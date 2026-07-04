/**
 * POST /api/pitch — PUBLIC founder pitch intake.
 *
 *   FormData:
 *     companyName *   contactName *   contactEmail *
 *     website  oneLiner  sector  geography  roundName  raiseAmount  notes
 *     deck            optional PDF ≤ 15 MB
 *     company         honeypot — must stay empty (bots fill it)
 *
 * Creates a `sourced` deal on the flagship fund with submitted_via=
 * 'public_form'; the deck goes to Vercel Blob (or /public fallback in
 * dev) and lands on the deal as deck_url. The GP reviews it on the
 * deal board like any other sourced opportunity.
 *
 * Anti-abuse: honeypot field, PDF-only, size cap, field length caps,
 * and a best-effort per-IP throttle (5/hour, in-memory per instance).
 */
import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { createDeal, hasDealTables } from "@/lib/portfolio/deal-pipeline"

export const runtime = "nodejs"
export const maxDuration = 120

const MAX_DECK_BYTES = 15 * 1024 * 1024
const FLAGSHIP_SLUG = "svs-fund-ii"

// Best-effort in-memory throttle (resets on cold start — fine as a speed bump).
const hits = new Map<string, { n: number; windowStart: number }>()
function throttled(ip: string): boolean {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || now - h.windowStart > 3600_000) {
    hits.set(ip, { n: 1, windowStart: now })
    return false
  }
  h.n++
  return h.n > 5
}

const str = (v: FormDataEntryValue | null, max = 300): string | null => {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

async function storeDeck(file: File, companyName: string): Promise<string | null> {
  if (file.size === 0) return null
  if (file.size > MAX_DECK_BYTES) throw new Error("Deck must be 15 MB or smaller.")
  if (file.type !== "application/pdf") throw new Error("Deck must be a PDF.")
  const bytes = Buffer.from(await file.arrayBuffer())
  const slugish = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)
  const filename = `${slugish}-${randomUUID().slice(0, 8)}.pdf`

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (blobToken) {
    const { put } = await import("@vercel/blob")
    const blob = await put(`pitch-decks/${filename}`, bytes, {
      access: "public",
      token: blobToken,
      contentType: "application/pdf",
      addRandomSuffix: false,
    })
    return blob.url
  }
  // Dev fallback: public/pitch-decks/
  const dir = path.join(process.cwd(), "public", "pitch-decks")
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, filename), bytes)
  return `/pitch-decks/${filename}`
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    if (throttled(ip)) {
      return NextResponse.json({ error: "Too many submissions — try again later." }, { status: 429 })
    }
    if (!(await hasDealTables())) {
      return NextResponse.json({ error: "Submissions are temporarily unavailable." }, { status: 503 })
    }

    const form = await req.formData()

    // Honeypot: real users never see or fill this field.
    if (str(form.get("company"))) {
      return NextResponse.json({ ok: true }) // silently accept + drop
    }

    const companyName = str(form.get("companyName"), 120)
    const contactName = str(form.get("contactName"), 120)
    const contactEmail = str(form.get("contactEmail"), 200)
    if (!companyName || !contactName || !contactEmail) {
      return NextResponse.json({ error: "Company, contact name, and email are required." }, { status: 400 })
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(contactEmail)) {
      return NextResponse.json({ error: "That email address doesn't look right." }, { status: 400 })
    }

    const fund = await getFundBySlug(FLAGSHIP_SLUG)
    if (!fund) {
      return NextResponse.json({ error: "Submissions are temporarily unavailable." }, { status: 503 })
    }

    // Deck: preferred path is a CLIENT-SIDE upload to Vercel Blob (the
    // browser → blob directly, since function bodies over ~4.5 MB get a
    // platform-level 413). We accept the resulting URL here after
    // validating it points at OUR blob store's pitch-decks/ prefix.
    // Small files (<4 MB) may still arrive as multipart fallback.
    let deckUrl: string | null = null
    const deckUrlRaw = str(form.get("deckUrl"), 500)
    if (deckUrlRaw) {
      try {
        const u = new URL(deckUrlRaw)
        const isBlobHost = u.hostname.endsWith(".public.blob.vercel-storage.com")
        const isOurs = u.pathname.includes("pitch-decks/")
        if (!isBlobHost || !isOurs) {
          return NextResponse.json({ error: "Invalid deck upload." }, { status: 400 })
        }
        deckUrl = deckUrlRaw
      } catch {
        return NextResponse.json({ error: "Invalid deck upload." }, { status: 400 })
      }
    } else {
      const deck = form.get("deck")
      if (deck instanceof File && deck.size > 0) {
        deckUrl = await storeDeck(deck, companyName)
      }
    }

    const raiseRaw = str(form.get("raiseAmount"), 20)
    const raiseAmount = raiseRaw != null && Number.isFinite(Number(raiseRaw)) && Number(raiseRaw) > 0
      ? Number(raiseRaw)
      : null

    const deal = await createDeal({
      fundId: fund.id,
      companyName,
      website: str(form.get("website"), 300),
      oneLiner: str(form.get("oneLiner"), 300),
      sector: str(form.get("sector"), 120),
      geography: str(form.get("geography"), 120),
      roundName: str(form.get("roundName"), 60),
      raiseAmount,
      source: "founder submission (web)",
      notes: str(form.get("notes"), 2000),
      deckUrl,
      contactName,
      contactEmail,
      submittedVia: "public_form",
      createdBy: contactEmail,
    })

    console.log(`[pitch] public submission ${deal.id} — ${companyName} (${contactEmail})`)
    return NextResponse.json({ ok: true, reference: deal.id.slice(0, 8) }, { status: 201 })
  } catch (e: any) {
    const msg = e?.message ?? "Submission failed"
    const known = /15 MB|PDF/.test(msg)
    if (!known) console.error("[pitch POST]", e)
    return NextResponse.json({ error: known ? msg : "Submission failed — please try again." }, { status: known ? 400 : 500 })
  }
}
