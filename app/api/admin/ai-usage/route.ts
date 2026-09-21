import { NextResponse } from "next/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { aiUsageSummary, idleTasks } from "@/lib/ai/usage"

/**
 * What the AI integration actually did, for the window asked for.
 *
 * The companion to /api/admin/ai-config: that route sets keys and flips
 * per-task kill switches, and until now there was no way to see the result of
 * either. Owner-gated like every other admin surface — this exposes which
 * workspaces are using which providers, and how much.
 *
 * Returns no prompt or completion text, because none is stored.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const summary = await aiUsageSummary({
    hours: Number(url.searchParams.get("hours")) || 24,
    task: url.searchParams.get("task"),
    provider: url.searchParams.get("provider"),
    workspaceId: url.searchParams.get("workspaceId"),
  })

  return NextResponse.json({
    ...summary,
    // A task with its switch off and a task nobody uses are both simply absent
    // from byTask. Naming the ones that did nothing is what lets an admin tell
    // those apart.
    idleTasks: idleTasks(summary.byTask),
  })
}
