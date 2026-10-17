/**
 * The investor's verification documents (docs/architecture/60 section 6). Needs the code-verified session.
 *   POST multipart { docType, file }       -> one document, encrypted on arrival (PDF, JPEG or PNG, up to 4 MB)
 *   POST json { action: "declare", category, owners? } -> what kind of investor they are, and for an entity who owns it
 *   POST json { action: "submit" }         -> "I have sent everything"
 * Nothing here accepts or rejects anyone: the fund looks at each document and decides.
 */
import { NextRequest, NextResponse } from "next/server"
import { verifyPortalToken, logPortalAccess } from "@/lib/portfolio/lp-portal"
import { LpError, sessionCookieName, sessionOk } from "@/lib/portfolio/lp-onboarding"
import { declare, submit, uploadDocument, verificationView } from "@/lib/portfolio/lp-verification"

export const runtime = "nodejs"
export const maxDuration = 30
const noStore = { "Cache-Control": "private, no-store" }

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const lp = await verifyPortalToken(token)
  if (!lp) return NextResponse.json({ error: "This link is not valid any more." }, { status: 401, headers: noStore })
  if (!(await sessionOk(lp.tokenId, req.cookies.get(sessionCookieName(lp.tokenId))?.value))) return NextResponse.json({ error: "Please enter your code first.", code: "no_session" }, { status: 401, headers: noStore })
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  try {
    let what = ""
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const f = await req.formData(); const file = f.get("file")
      if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400, headers: noStore })
      await uploadDocument(lp.lpId, f.get("docType"), { filename: file.name, bytes: Buffer.from(await file.arrayBuffer()) }); what = "upload"
    } else {
      const b = await req.json().catch(() => ({}))
      if (b?.action === "declare") { await declare(lp.lpId, b); what = "declare" }
      else if (b?.action === "submit") { await submit(lp.lpId); what = "submit" }
      else return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: noStore })
    }
    await logPortalAccess(lp.tokenId, lp.lpId, `verification:${what}`, ip)
    return NextResponse.json({ ok: true, verification: await verificationView(lp.lpId) }, { headers: noStore })
  } catch (e) { if (e instanceof LpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: noStore }); throw e }
}
