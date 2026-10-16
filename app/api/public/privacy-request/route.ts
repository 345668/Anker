/**
 * POST /api/public/privacy-request — a person asks what Anker holds about them, or asks Anker to correct, restrict, erase or stop using it (docs/architecture/54, D3).
 * No login. The answer is always the same, whether or not we hold anything, so the form cannot be used to find out who is in the directory. Nothing happens until the person
 * confirms through a link sent to the address they gave.
 */
import { NextRequest, NextResponse } from "next/server"
import { createRequest, formTokenOk, DsarError } from "@/lib/privacy/dsar"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const clientIp = (req: NextRequest) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown"

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = rateLimit(`privacy-request:${ip}`, { limit: 5, windowMs: 3600_000 })
  if (!rl.ok) return rateLimitResponse(rl)
  const ct = req.headers.get("content-type") || ""
  const f: Record<string, string> = ct.includes("application/json") ? await req.json().catch(() => ({})) : Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, String(v)]))
  const back = (q: string) => (ct.includes("application/json") ? NextResponse.json(q === "sent=1" ? { ok: true } : { error: q }, { status: q === "sent=1" ? 200 : 400 }) : NextResponse.redirect(new URL(`/privacy/request?${q}`, req.url), 303))
  // A filled honeypot or a missing or too-fast form token is a bot: answer as if it worked, do nothing.
  if (f.website || !formTokenOk(f.t)) return back("sent=1")
  const rl2 = rateLimit(`privacy-request-email:${String(f.email ?? "").toLowerCase()}`, { limit: 3, windowMs: 24 * 3600_000 })
  if (!rl2.ok) return back("sent=1")
  try {
    await createRequest({ kind: f.kind, email: f.email, linkedin: f.linkedin, note: f.note })
  } catch (e) {
    if (e instanceof DsarError) return back(`error=${encodeURIComponent(e.message)}`)
    console.error("[privacy-request]", (e as Error)?.message)
    return back("error=" + encodeURIComponent("We could not take your request just now. Please email privacy@an-ker.de instead."))
  }
  return back("sent=1")
}
