import { z } from "zod"
import { requireAiPrincipal } from "@/lib/assistant/principal"
import { assetResponse, ownedAsset } from "@/lib/ai/studio/assets"
import { errorResponse } from "@/lib/ai/studio/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const p = await requireAiPrincipal(),
      { id } = await ctx.params
    return await assetResponse(
      await ownedAsset(p, z.string().uuid().parse(id)),
      new URL(req.url).searchParams.get("download") === "1",
    )
  } catch (e) {
    return errorResponse(e)
  }
}
