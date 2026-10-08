import { requireAiPrincipal } from "@/lib/assistant/principal"
import { inputSchema } from "@/lib/ai/studio/catalog"
import { configuration } from "@/lib/ai/studio/provider"
import { assertScope, createJob, listJobs } from "@/lib/ai/studio/service"
import { readJson, errorResponse, json } from "@/lib/ai/studio/http"
import { WorkspaceError } from "@/lib/auth/workspace-context"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60
export async function GET(req: Request) {
  try {
    const p = await requireAiPrincipal(),
      q = new URL(req.url).searchParams
    assertScope(p, q.get("scopeKey") || "")
    const before = q.get("before") || undefined
    if (before && (!/^\d{4}-\d{2}-\d{2}T/.test(before) || !Number.isFinite(Date.parse(before))))
      throw new WorkspaceError("Invalid history cursor.", 400)
    const jobs = await listJobs(p, before)
    return json({
      scopeKey: p.scopeKey,
      ready: configuration().ready,
      canGenerate: !p.readonly && (p.persona === "lp" || p.canWrite),
      jobs,
      nextCursor: jobs.length === 30 ? jobs[jobs.length - 1].createdAt : null,
    })
  } catch (e) {
    return errorResponse(e)
  }
}
export async function POST(req: Request) {
  try {
    const p = await requireAiPrincipal()
    return json({ job: await createJob(p, inputSchema.parse(await readJson(req))) }, 202)
  } catch (e) {
    return errorResponse(e)
  }
}
