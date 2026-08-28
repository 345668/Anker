/**
 * POST /api/extension/li-inbox
 *
 * The extension posts synced LinkedIn conversations here. Upserts threads +
 * messages and flips any active campaign member who replied to 'replied'
 * (reply-stop). See lib/linkedin/inbox.ts.
 *
 * Body: { threads: IngestThread[] }
 */
import { NextRequest, NextResponse } from "next/server"
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth"
import { ingestThreads } from "@/lib/linkedin/inbox"

export const runtime = "nodejs"

export async function OPTIONS() { return corsOptionsResponse() }

export async function POST(req: NextRequest) {
  const auth = await authenticateExtension(req)
  if (!auth.ok) return auth.response
  const body = await req.json().catch(() => ({}))
  const threads = Array.isArray(body.threads) ? body.threads : []
  try {
    const result = await ingestThreads(auth.userId, threads)
    return NextResponse.json({ ok: true, ...result }, { headers: corsHeaders() })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ingest failed" }, { status: 400, headers: corsHeaders() })
  }
}
