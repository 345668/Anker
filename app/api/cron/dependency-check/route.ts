/**
 * Nightly dependency check, stored in `dependency_checks` so a regression ("webhook secret removed", "mailbox
 * disconnected") is visible in history, not only now. Auth: `Authorization: Bearer $CRON_SECRET`, fails closed.
 */
import { NextRequest, NextResponse } from "next/server"
import { runDependencyChecks } from "@/lib/ops/dependencies"
import { trackCron, isCronAuthorised } from "@/lib/cron/track"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

async function handle(req: NextRequest) {
  if (!isCronAuthorised(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const report = await runDependencyChecks()
  await sql`INSERT INTO dependency_checks (trigger, ok, results) VALUES ('cron', ${report.ok}, ${JSON.stringify(report.checks)}::jsonb)`
  return NextResponse.json({ ok: report.ok, down: report.checks.filter((c) => c.status === "down").map((c) => c.name), degraded: report.checks.filter((c) => c.status === "degraded").map((c) => c.name) })
}

export const GET = trackCron("dependency-check", handle)
