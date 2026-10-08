import { NextResponse } from "next/server"
import { WorkspaceError, workspaceError } from "@/lib/auth/workspace-context"
import { ZodError } from "zod"
export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } })
export async function bodyBytes(req: Request, limit = 24000): Promise<Uint8Array> {
  const origin = req.headers.get("origin")
  if (origin && origin !== new URL(req.url).origin) throw new WorkspaceError("Request origin is not allowed.")
  if (Number(req.headers.get("content-length")) > limit) throw new WorkspaceError("Request too large.", 413)
  const reader = req.body?.getReader()
  if (!reader) throw new WorkspaceError("Request body required.", 400)
  const chunks: Uint8Array[] = []
  let n = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    n += value.byteLength
    if (n > limit) {
      await reader.cancel()
      throw new WorkspaceError("Request too large.", 413)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}
export async function readJson(req: Request) {
  const b = await bodyBytes(req)
  try {
    return JSON.parse(Buffer.from(b).toString("utf8")) as unknown
  } catch {
    throw new WorkspaceError("Send valid JSON.", 400)
  }
}
export function errorResponse(e: unknown) {
  if (e instanceof ZodError) return json({ error: e.issues[0]?.message || "Invalid settings." }, 400)
  const r = workspaceError(e)
  r.headers.set("Cache-Control", "private, no-store")
  return r
}
