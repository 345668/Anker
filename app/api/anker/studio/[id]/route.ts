import { z } from "zod"
import { requireAiPrincipal } from "@/lib/assistant/principal"
import { assertScope, getJob, setFavorite } from "@/lib/ai/studio/service"
import { readJson, errorResponse, json } from "@/lib/ai/studio/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 180
type Context = { params: Promise<{ id: string }> }
export async function GET(req: Request, ctx: Context) {
  try {
    const p = await requireAiPrincipal()
    assertScope(p, new URL(req.url).searchParams.get("scopeKey") || "")
    const { id } = await ctx.params
    return json({ scopeKey: p.scopeKey, job: await getJob(p, z.string().uuid().parse(id), true) })
  } catch (e) {
    return errorResponse(e)
  }
}
export async function PATCH(req: Request, ctx: Context) {
  try {
    const p = await requireAiPrincipal(),
      b = z
        .object({ scopeKey: z.string(), favorite: z.boolean() })
        .strict()
        .parse(await readJson(req))
    assertScope(p, b.scopeKey)
    const { id } = await ctx.params
    return json({ job: await setFavorite(p, z.string().uuid().parse(id), b.favorite) })
  } catch (e) {
    return errorResponse(e)
  }
}
