/**
 * POST /api/admin/email-check/fix
 *
 * Three repair modes for an email surfaced by /api/admin/email-check:
 *
 *   { mode: "hunter", ownerId, field }
 *     Hunter email-finder: pulls firm domain + investor first/last name
 *     and asks Hunter for the best-known address.
 *
 *   { mode: "ai", ownerId, field }
 *     Local model proposes the most-likely email pattern given the
 *     firm domain + investor name (e.g. firstname.lastname@acme.vc).
 *
 *   { mode: "manual", ownerId, field, email }
 *     User-supplied — verify once via Hunter (or fall-back) before
 *     writing back.
 *
 * When `apply: true` AND the verifier returns valid / risky / accept_all
 * (i.e. NOT invalid / disposable / no_mx / malformed), we write the
 * email back to investors.email.
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireAdmin } from "@/lib/auth/require-admin"
import { checkEmail } from "@/lib/admin/email-check"
import { findEmail, isHunterAvailable } from "@/lib/admin/hunter"
import { generate } from "@/lib/ai/provider"

export const runtime = "nodejs"
export const maxDuration = 90

type FixMode = "hunter" | "ai" | "manual"

interface Body {
  mode: FixMode
  ownerId: string
  field: "email"
  email?: string
  apply?: boolean
}

const APPLIABLE = new Set(["valid", "risky", "accept_all", "webmail"])

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const body = (await req.json()) as Body
    if (!body?.ownerId || !body?.mode) {
      return NextResponse.json({ error: "mode + ownerId required" }, { status: 400 })
    }
    const owner = await loadInvestor(body.ownerId)
    if (!owner) return NextResponse.json({ error: "investor not found" }, { status: 404 })

    let proposed: string | null = null
    let detail = ""
    let candidates: { email: string; score?: number; method?: string | null; sources?: any[] }[] = []

    if (body.mode === "manual") {
      if (!body.email || !body.email.trim()) {
        return NextResponse.json({ error: "email required for manual mode" }, { status: 400 })
      }
      proposed = body.email.trim().toLowerCase()
      detail = "user-provided"
    } else if (body.mode === "hunter") {
      if (!isHunterAvailable()) {
        return NextResponse.json({
          error: "Hunter not configured. Set HUNTER_API_KEY in .env.local and restart.",
        }, { status: 503 })
      }
      const domain = pickFirmDomain(owner)
      if (!domain) {
        return NextResponse.json({
          error: "No firm domain available — Hunter finder needs a domain.  Add the firm's website first or use Local AI / Manual mode.",
        }, { status: 422 })
      }
      const r = await findEmail({
        domain,
        firstName: owner.first_name ?? undefined,
        lastName: owner.last_name ?? undefined,
        fullName: !owner.first_name && !owner.last_name
          ? [owner.first_name, owner.last_name].filter(Boolean).join(" ").trim() || undefined
          : undefined,
        company: owner.firm_name ?? undefined,
      })
      proposed = r.email
      detail = `hunter (${r.detail})`
      if (r.email) candidates.push({ email: r.email, score: r.score, method: r.method, sources: r.sources })
    } else if (body.mode === "ai") {
      proposed = await proposeViaAi(owner)
      detail = "local-ai"
    } else {
      return NextResponse.json({ error: `unknown mode: ${body.mode}` }, { status: 400 })
    }

    let probe: any = null
    if (proposed) probe = await checkEmail(proposed, { timeoutMs: 12_000 })

    let applied = false
    if (proposed && body.apply) {
      const ok = probe && APPLIABLE.has(probe.verdict)
      if (!ok) {
        return NextResponse.json({
          proposed, probe, candidates, detail,
          error: `proposed email did not pass verification (verdict ${probe?.verdict ?? "n/a"}); refusing to apply`,
        }, { status: 422 })
      }
      await sql`
        UPDATE investors SET
          email = ${proposed},
          updated_at = NOW()
        WHERE id = ${owner.id}
      `
      applied = true
    }

    return NextResponse.json({
      mode: body.mode,
      proposed,
      probe,
      candidates,
      applied,
      detail,
      hunterAvailable: isHunterAvailable(),
    })
  } catch (e: any) {
    console.error("[admin/email-check/fix] error:", e)
    return NextResponse.json({ error: e?.message ?? "fix failed" }, { status: 500 })
  }
}

// ─── helpers ───────────────────────────────────────────────────────────
async function loadInvestor(id: string): Promise<any | null> {
  const [r] = await sql`SELECT i.id, i.first_name, i.last_name, i.title, i.email,
                               i.linkedin_url, i.location, i.firm_id, i.bio,
                               f.name AS firm_name, f.website AS firm_website
                        FROM investors i
                        LEFT JOIN investment_firms f ON i.firm_id = f.id
                        WHERE i.id = ${id} LIMIT 1`
  return r ?? null
}

function pickFirmDomain(o: any): string | null {
  if (o?.firm_website) {
    try {
      return new URL(o.firm_website).hostname.replace(/^www\./, "")
    } catch {
      return o.firm_website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null
    }
  }
  if (o?.email) {
    const after = String(o.email).split("@")[1]
    if (after) return after.toLowerCase()
  }
  return null
}

async function proposeViaAi(o: any): Promise<string | null> {
  const fullName = [o.first_name, o.last_name].filter(Boolean).join(" ").trim()
  const domain = pickFirmDomain(o)
  if (!domain) return null
  const prompt = `You are an investment-data analyst.  Given the context below, return ONLY the most likely correct email address for this person, or the literal token "UNKNOWN" if you can't reasonably guess.

Rules:
- Use the firm's domain (${domain}) as the email domain.
- Most VC firms use first.last@domain or first@domain.  Common variants: firstinitial+last, first_last.
- Output a SINGLE plain email address on one line.  No prose, no markdown.
- Return UNKNOWN when the firm pattern is genuinely unclear.

Context:
Name: ${fullName || "(unknown)"}
Title: ${o.title ?? ""}
Firm: ${o.firm_name ?? ""}
Firm website: ${o.firm_website ?? ""}
Location: ${o.location ?? ""}
Prior email on file (broken): ${o.email ?? "none"}`
  const out = await generate(prompt, { task: "url_classify", maxTokens: 60, temperature: 0.1 })
  const cleaned = (out ?? "").trim().replace(/^["'`]+|["'`]+$/g, "")
  if (!cleaned || /^UNKNOWN$/i.test(cleaned)) return null
  // Take only the first email-shaped token
  const m = cleaned.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
  return m ? m[0].toLowerCase() : null
}
