/**
 * POST /api/contracts/[id]/send-for-signature — send a contract for e-signature via
 * DocuSign (lib/contracts/docusign). Inert until DocuSign env is configured, in which
 * case it returns a clear "not configured" message the UI can surface.
 *
 * Body: { subject?, documentBase64, documentName?, fileExtension?, signers: [{email,name}] }
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendForSignature, isDocuSignConfigured } from "@/lib/contracts/docusign"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  await ctx.params // contract id reserved for future envelope↔contract linking

  if (!isDocuSignConfigured()) {
    return NextResponse.json({ error: "DocuSign is not configured. Set DOCUSIGN_BASE_URI, DOCUSIGN_ACCOUNT_ID, and DOCUSIGN_ACCESS_TOKEN to enable e-signature.", configured: false }, { status: 400 })
  }

  const body = await req.json().catch(() => ({})) as {
    subject?: string; documentBase64?: string; documentName?: string; fileExtension?: string
    signers?: { email: string; name: string }[]
  }
  if (!body.documentBase64) return NextResponse.json({ error: "Provide the document (base64)." }, { status: 400 })
  if (!Array.isArray(body.signers) || !body.signers.length) return NextResponse.json({ error: "Provide at least one signer." }, { status: 400 })

  const result = await sendForSignature({
    subject: body.subject ?? "Please sign",
    documentBase64: body.documentBase64,
    documentName: body.documentName ?? "Contract",
    fileExtension: body.fileExtension,
    signers: body.signers,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ ok: true, envelopeId: result.envelopeId, status: result.status })
}
