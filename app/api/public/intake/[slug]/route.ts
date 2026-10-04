/**
 * Public fund intake (docs/architecture/39).
 *   GET  /api/public/intake/<fund-slug>   the form shape and headline only (never the thesis, gates or rubric)
 *   POST /api/public/intake/<fund-slug>   an application, multipart or JSON-less form data
 * Unauthenticated, so defended like /api/public/submit: rate limits by IP and email, honeypot, optional Turnstile,
 * size and type caps, blob URLs validated. A missing or disabled fund answers 404 either way.
 */
import { NextRequest, NextResponse, after } from "next/server"
import { createHash, randomBytes } from "node:crypto"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { getPublicIntake, createSubmission, processSubmission } from "@/lib/intake/store"
import { sendEmail, isResendConfigured } from "@/lib/email/resend"
import { nameFromBlobUrl } from "@/lib/campaign/submission-files"
import { isIntakeBlobUrl, INTAKE_MAX_BYTES } from "@/lib/intake/files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

const IP_LIMIT = { limit: 5, windowMs: 60 * 60_000 }
const EMAIL_LIMIT = { limit: 2, windowMs: 24 * 60 * 60_000 }
const MAX_INLINE = 4 * 1024 * 1024
const DECK_TYPES = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.ms-powerpoint"])

const clientIp = (req: NextRequest) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "0.0.0.0"
const hashIp = (ip: string) => createHash("sha256").update(ip + (process.env.IP_HASH_SALT || "anker")).digest("hex").slice(0, 32)
const str = (f: FormData, k: string, max = 2000) => { const v = f.get(k); return typeof v === "string" ? v.trim().slice(0, max) : "" }
const publicRef = () => { const a = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; const b = randomBytes(5); return "INT-" + Array.from(b, (x) => a[x % a.length]).join("") }

async function turnstileOk(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ secret, response: token, remoteip: ip }) })
    return !!((await r.json()) as { success?: boolean }).success
  } catch { return false }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const p = await getPublicIntake(slug)
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ fundName: p.fundName, headline: p.headline, intro: p.intro, form: p.form }, { headers: { "Cache-Control": "public, max-age=60" } })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const ip = clientIp(req)
  const rl = rateLimit(`intake:ip:${hashIp(ip)}`, IP_LIMIT)
  if (!rl.ok) return rateLimitResponse(rl)

  const intake = await getPublicIntake(slug)
  if (!intake) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: "Invalid form submission." }, { status: 400 }) }
  if (str(form, "company_url_confirm")) return NextResponse.json({ ok: true, publicRef: publicRef() }) // honeypot: silent accept, drop

  const companyName = str(form, "company_name", 200), contactName = str(form, "contact_name", 200), contactEmail = str(form, "contact_email", 320).toLowerCase()
  if (!companyName || !contactName || !contactEmail) return NextResponse.json({ error: "Company, your name and your email are required." }, { status: 400 })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) return NextResponse.json({ error: "Please give a valid email address." }, { status: 400 })
  if (!str(form, "terms_accepted", 10)) return NextResponse.json({ error: "Please accept the privacy notice to submit." }, { status: 400 })
  for (const q of intake.form.questions) if (q.required && !str(form, `q_${q.id}`)) return NextResponse.json({ error: `Please answer: ${q.label}` }, { status: 400 })

  const er = rateLimit(`intake:email:${intake.fundId}:${contactEmail}`, EMAIL_LIMIT)
  if (!er.ok) return NextResponse.json({ error: "You have already applied recently. The team will be in touch." }, { status: 429 })
  if (!(await turnstileOk(str(form, "turnstile_token", 4000), ip))) return NextResponse.json({ error: "Bot verification failed. Please try again." }, { status: 403 })

  // Deck: inline when small, otherwise the URL of a blob the browser uploaded straight to private storage.
  const rawBlob = form.get("deck_blob_url")
  const blobUrl = isIntakeBlobUrl(rawBlob) ? rawBlob : null
  const file = form.get("pitch_deck")
  const deck = file instanceof File && file.size > 0 ? file : null
  let deckUrl: string | null = null
  const ref = publicRef()
  if (blobUrl) {
    if (!/\.(pdf|pptx?)$/i.test(nameFromBlobUrl(blobUrl))) return NextResponse.json({ error: "The deck must be a PDF or PowerPoint file." }, { status: 415 })
    const { head } = await import("@vercel/blob")
    const meta = await head(blobUrl).catch(() => null)
    if (!meta) return NextResponse.json({ error: "The uploaded deck could not be found. Please attach it again." }, { status: 400 })
    if (meta.size > INTAKE_MAX_BYTES) return NextResponse.json({ error: "The deck exceeds 100 MB." }, { status: 413 })
    deckUrl = blobUrl
  } else if (deck) {
    if (deck.size > MAX_INLINE) return NextResponse.json({ error: "Please attach larger decks through the upload button." }, { status: 413 })
    if (deck.type && !DECK_TYPES.has(deck.type)) return NextResponse.json({ error: "The deck must be a PDF or PowerPoint file." }, { status: 415 })
    try {
      if (process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL) {
        const { put } = await import("@vercel/blob")
        const r = await put(`intake-submissions/${ref}/deck-${deck.name.replace(/[^\w.\- ]/g, "_")}`, Buffer.from(await deck.arrayBuffer()), { access: "private", contentType: deck.type || "application/pdf", addRandomSuffix: false, token: process.env.BLOB_READ_WRITE_TOKEN })
        deckUrl = r.url
      }
    } catch (e) { console.error("[intake] deck upload failed:", (e as Error).message) }
  }

  const answers: Record<string, string> = {
    stage: str(form, "stage", 60), sectors: str(form, "sectors", 300), location: str(form, "location", 160),
    raise_amount: str(form, "raise_amount", 40), cheque_ask: str(form, "cheque_ask", 40),
    problem: str(form, "problem", 1500), traction: str(form, "traction", 1500), team: str(form, "team", 1500), ask: str(form, "ask", 1500),
    terms_accepted: new Date().toISOString(),
  }
  for (const q of intake.form.questions) answers[q.id] = str(form, `q_${q.id}`, 1500)

  let id: string
  try {
    id = await createSubmission({ fundId: intake.fundId, publicRef: ref, companyName, website: str(form, "website", 300) || null, oneLiner: str(form, "one_liner", 400) || null,
      contactName, contactEmail, answers, deckUrl, ipHash: hashIp(ip) })
  } catch (e) {
    console.error("[intake] insert failed:", (e as Error).message)
    return NextResponse.json({ error: "Could not save your application. Please try again." }, { status: 500 })
  }
  // Confirm receipt to the applicant. Transactional (they asked), no tracking, and never allowed to fail the submission.
  try {
    if (isResendConfigured()) {
      await sendEmail({ purpose: "transactional", noTracking: true, to: contactEmail, subject: `We received your application to ${intake.fundName}`,
        text: `Hello ${contactName},\n\n${intake.fundName} has received your application for ${companyName}. Your reference is ${ref}.\n\nThe team reads every submission that fits what they back and will contact you if they want to talk.\n\nThis message was sent because you submitted an application. You will not receive marketing from us.` })
    }
  } catch (e) { console.error("[intake] confirmation email failed:", (e as Error).message) }
  // Assess after the response is sent; the cron sweep picks up anything this misses.
  after(async () => { try { await processSubmission(id) } catch (e) { console.error("[intake] assess failed:", (e as Error).message) } })
  return NextResponse.json({ ok: true, publicRef: ref })
}
