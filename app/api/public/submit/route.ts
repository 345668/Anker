/**
 * POST /api/public/submit  — PUBLIC, unauthenticated founder application.
 *
 * The one internet-facing write in the campaign engine, so it's defended in
 * depth (see CAMPAIGN_ENGINE_PLAN.md §4.2):
 *   - in-memory rate limit, keyed by hashed IP *and* by email
 *   - optional Cloudflare Turnstile (enforced only when TURNSTILE_SECRET_KEY set)
 *   - honeypot field, size + type caps, field-length caps
 *   - IP is hashed at rest; nothing sensitive goes in the response
 *
 * Accepts multipart/form-data: structured fields + `pitch_deck` (1 file, PDF/PPTX,
 * ≤25MB) + zero-or-more `data_room` files. Writes a founder_submissions row
 * (status=received), uploads materials to PRIVATE Vercel Blob, emails the founder
 * a signed confirmation, and returns { ok, publicRef }. The campaign-assessment
 * cron picks it up from there.
 */
import { NextRequest, NextResponse } from "next/server"
import { createHash, randomBytes } from "node:crypto"
import { sql } from "@/lib/db"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { sendSubmissionConfirmation } from "@/lib/email/founder-lifecycle"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { createDeal, hasDealTables } from "@/lib/portfolio/deal-pipeline"

const FLAGSHIP_SLUG = "svs-fund-ii"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const MAX_DECK_BYTES = 25 * 1024 * 1024 // 25 MB (matches extract-profile)
const MAX_DATAROOM_FILES = 8
const MAX_FIELD_LEN = 5000
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/vnd.ms-powerpoint", // .ppt
])

// 3 submissions / IP / hour, 1 / email / day.
const IP_LIMIT = { limit: 3, windowMs: 60 * 60_000 }
const EMAIL_LIMIT = { limit: 1, windowMs: 24 * 60 * 60_000 }

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for") || ""
  return xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "0.0.0.0"
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + (process.env.IP_HASH_SALT || "anker")).digest("hex").slice(0, 32)
}

function str(form: FormData, key: string, max = MAX_FIELD_LEN): string {
  const v = form.get(key)
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

function num(form: FormData, key: string): number | null {
  const raw = str(form, key).replace(/[^0-9.]/g, "")
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function makePublicRef(): string {
  // ANK-XXXX using unambiguous base32 (no 0/1/O/I).
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
  const bytes = randomBytes(4)
  let out = ""
  for (let i = 0; i < 4; i++) out += alphabet[bytes[i] % alphabet.length]
  return `ANK-${out}`
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true // not configured → skip (Phase 0)
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    })
    const data = (await res.json()) as { success?: boolean }
    return !!data.success
  } catch {
    return false
  }
}

async function uploadPrivate(key: string, file: File): Promise<{ pathname: string; url: string } | null> {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  const isVercel = !!process.env.VERCEL
  if (!blobToken && !isVercel) return null // dev without Blob → skip, keep row
  const { put } = await import("@vercel/blob")
  const buf = Buffer.from(await file.arrayBuffer())
  const res = await put(`founder-submissions/${key}`, buf, {
    access: "private",
    contentType: file.type || "application/octet-stream",
    addRandomSuffix: false,
    token: blobToken,
  })
  return { pathname: res.pathname, url: res.url } // pathname = engine key; url = deal-board deck link
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req)

  // 1. Rate limit by IP first (cheapest gate).
  const ipRl = rateLimit(`public-submit:ip:${hashIp(ip)}`, IP_LIMIT)
  if (!ipRl.ok) return rateLimitResponse(ipRl)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form submission." }, { status: 400 })
  }

  // 2. Honeypot — bots fill hidden fields; humans never see them.
  if (str(form, "company_url_confirm")) {
    return NextResponse.json({ ok: true, publicRef: makePublicRef() }) // silent accept, drop
  }

  // 3. Required fields.
  const startupName = str(form, "startup_name", 200)
  const founderName = str(form, "founder_name", 200)
  const founderEmail = str(form, "founder_email", 320).toLowerCase()
  if (!startupName || !founderName || !founderEmail) {
    return NextResponse.json(
      { error: "startup_name, founder_name and founder_email are required." },
      { status: 400 },
    )
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(founderEmail)) {
    return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 })
  }

  // Terms of participation must be accepted (community-trial consent).
  const termsAccepted = !!str(form, "terms_accepted", 10)
  if (!termsAccepted) {
    return NextResponse.json({ error: "You must accept the community-trial terms to submit." }, { status: 400 })
  }

  // 4. Per-email rate limit.
  const emailRl = rateLimit(`public-submit:email:${founderEmail}`, EMAIL_LIMIT)
  if (!emailRl.ok) {
    return NextResponse.json(
      { error: "You've already submitted recently. We'll be in touch — check your email for your reference." },
      { status: 429 },
    )
  }

  // 5. Turnstile (only enforced when configured).
  if (!(await verifyTurnstile(str(form, "turnstile_token", 4000), ip))) {
    return NextResponse.json({ error: "Bot verification failed. Please try again." }, { status: 403 })
  }

  // 6. Files.
  const deck = form.get("pitch_deck")
  if (!(deck instanceof File) || deck.size === 0) {
    return NextResponse.json({ error: "A pitch deck (PDF or PPTX) is required." }, { status: 400 })
  }
  if (deck.size > MAX_DECK_BYTES) {
    return NextResponse.json({ error: "Pitch deck exceeds the 25 MB limit." }, { status: 413 })
  }
  if (deck.type && !ALLOWED_TYPES.has(deck.type)) {
    return NextResponse.json({ error: "Pitch deck must be a PDF or PowerPoint file." }, { status: 415 })
  }
  const dataRoom = form.getAll("data_room").filter((v): v is File => v instanceof File && v.size > 0)
  if (dataRoom.length > MAX_DATAROOM_FILES) {
    return NextResponse.json({ error: `At most ${MAX_DATAROOM_FILES} data-room files.` }, { status: 413 })
  }
  for (const f of dataRoom) {
    if (f.size > MAX_DECK_BYTES) {
      return NextResponse.json({ error: `Data-room file "${f.name}" exceeds 25 MB.` }, { status: 413 })
    }
  }

  // 7. Structured fields.
  const publicRef = makePublicRef()
  const sectors = str(form, "sectors")
    .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20)
  const team = safeJsonArray(str(form, "team_json"))
  const traction = safeJsonObject(str(form, "traction_json"))
  const extra = {
    revenue: str(form, "revenue", 500),
    customers: str(form, "customers", 500),
    round: str(form, "round", 200),
    ask: str(form, "ask", 2000),
    // Consent record for the community-trial terms (legal audit trail).
    termsAccepted: true,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: "community-trial-2026-07",
    ...safeJsonObject(str(form, "extra_fields_json")),
  }

  // 8. Upload materials (best-effort; a Blob failure shouldn't lose the lead).
  let deckKey: string | null = null
  let deckUrl: string | null = null
  const dataRoomKeys: string[] = []
  try {
    const d = await uploadPrivate(`${publicRef}/deck-${sanitize(deck.name)}`, deck)
    if (d) { deckKey = d.pathname; deckUrl = d.url }
    for (const f of dataRoom) {
      const k = await uploadPrivate(`${publicRef}/room-${sanitize(f.name)}`, f)
      if (k) dataRoomKeys.push(k.pathname)
    }
  } catch (e: any) {
    console.error("[public/submit] blob upload failed:", e?.message ?? e)
    // continue — we keep the submission and can re-request materials if needed
  }

  // 9. Insert.
  try {
    await sql`
      INSERT INTO founder_submissions (
        public_ref, campaign_batch_id, startup_name, website, one_liner,
        sectors, stage, raise_amount, check_size_min, check_size_max, location,
        founder_name, founder_email, founder_linkedin, founder_title,
        team_json, traction_json, extra_fields_json,
        deck_blob_key, data_room_keys, status, ip_hash, user_agent
      ) VALUES (
        ${publicRef}, ${str(form, "campaign_batch_id", 100) || null},
        ${startupName}, ${str(form, "website", 500) || null}, ${str(form, "one_liner", 400) || null},
        ${sectors}::text[], ${str(form, "stage", 100) || null},
        ${num(form, "raise_amount")}, ${num(form, "check_size_min")}, ${num(form, "check_size_max")},
        ${str(form, "location", 200) || null},
        ${founderName}, ${founderEmail}, ${str(form, "founder_linkedin", 500) || null},
        ${str(form, "founder_title", 200) || null},
        ${JSON.stringify(team)}::jsonb, ${JSON.stringify(traction)}::jsonb, ${JSON.stringify(extra)}::jsonb,
        ${deckKey}, ${dataRoomKeys}::text[], 'received',
        ${hashIp(ip)}, ${(req.headers.get("user-agent") || "").slice(0, 500)}
      )
    `
  } catch (e: any) {
    console.error("[public/submit] insert failed:", e?.message ?? e)
    return NextResponse.json({ error: "Could not save your submission. Please try again." }, { status: 500 })
  }

  // 10. Also land it on the GP deal board (merged flow: one form feeds both the
  //     campaign engine AND the deal board). Best-effort — never blocks the 200.
  try {
    if (await hasDealTables()) {
      const fund = await getFundBySlug(FLAGSHIP_SLUG)
      if (fund) {
        await createDeal({
          fundId: fund.id,
          companyName: startupName,
          website: str(form, "website", 300) || null,
          oneLiner: str(form, "one_liner", 300) || null,
          sector: sectors[0] || null,
          geography: str(form, "location", 120) || null,
          roundName: str(form, "stage", 60) || null,
          raiseAmount: num(form, "raise_amount"),
          source: "founder submission (web)",
          notes: [str(form, "ask", 2000), publicRef ? `Campaign ref: ${publicRef}` : ""].filter(Boolean).join("\n\n") || null,
          deckUrl,
          contactName: founderName,
          contactEmail: founderEmail,
          submittedVia: "public_form",
          createdBy: founderEmail,
        })
      }
    }
  } catch (e: any) {
    console.error("[public/submit] deal-board create failed (non-fatal):", e?.message ?? e)
  }

  // 11. Confirmation email (best-effort; never blocks the 200).
  try {
    await sendSubmissionConfirmation({ to: founderEmail, founderName, startupName, publicRef })
  } catch (e: any) {
    console.error("[public/submit] confirmation email failed:", e?.message ?? e)
  }

  return NextResponse.json({ ok: true, publicRef })
}

// ─── util ────────────────────────────────────────────────────────────────────

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "file"
}
function safeJsonArray(s: string): any[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] }
}
function safeJsonObject(s: string): Record<string, any> {
  try { const v = JSON.parse(s); return v && typeof v === "object" && !Array.isArray(v) ? v : {} } catch { return {} }
}
