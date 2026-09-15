import { NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { CallError, callScope } from "@/lib/calls/access"
import { callReleases } from "@/lib/calls/releases"
export const runtime = "nodejs"
export const maxDuration = 300
export async function GET(req: NextRequest) {
  try {
    await callScope()
    const release = callReleases().find(r => r.platform === req.nextUrl.searchParams.get("platform"))
    if (!release) throw new CallError("An approved installer is not available for this platform yet.", 404)
    const blob = await get(release.pathname, { access: "private", token: process.env.ANKER_CALL_BLOB_TOKEN, useCache: false, abortSignal: req.signal })
    if (!blob || blob.statusCode !== 200) throw new CallError("Installer temporarily unavailable. Please retry.", 503)
    if (blob.blob.size !== release.size) { await blob.stream.cancel(); throw new CallError("Installer verification failed. Contact support.", 503) }
    return new Response(blob.stream, { headers: {
      "Content-Type": "application/octet-stream", "Content-Length": String(release.size),
      "Content-Disposition": `attachment; filename="${release.filename}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Checksum-SHA256": release.sha256,
    } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof CallError ? e.message : "Installer unavailable. Please retry." }, { status: e instanceof CallError ? e.status : 503, headers: { "Cache-Control": "no-store" } })
  }
}
