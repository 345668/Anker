/**
 * POST /api/extension/li-actions/[id]/report
 *
 * The extension calls this after executing a claimed action on LinkedIn.
 * ok → 'done', else → 'failed'. Only affects a row the extension actually
 * holds ('claimed') and owns.
 *
 * Body: { ok: boolean, error?: string, result?: object }
 *   result may carry structured detail (e.g. { invited: true } / { messaged: true },
 *   or { friction: "captcha" } so the platform can surface a sender pause).
 */
import { NextRequest, NextResponse } from "next/server"
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth"
import { reportActionResult } from "@/lib/linkedin/action-queue"

export const runtime = "nodejs"

export async function OPTIONS() { return corsOptionsResponse() }

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authenticateExtension(req)
  if (!auth.ok) return auth.response
  const { id } = await ctx.params

  const body = await req.json().catch(() => ({}))
  const okFlag: boolean = body.ok !== false
  const result = body.result && typeof body.result === "object" ? body.result : undefined

  const status = await reportActionResult(auth.userId, id, {
    ok: okFlag,
    error: typeof body.error === "string" ? body.error : undefined,
    result,
  })

  if (!status) {
    return NextResponse.json({ error: "Action not found or not claimed" }, { status: 404, headers: corsHeaders() })
  }
  return NextResponse.json({ ok: true, status }, { headers: corsHeaders() })
}
