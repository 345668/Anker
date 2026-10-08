import { sql } from "@/lib/db"
import { advanceJob } from "@/lib/ai/studio/service"
import { isCronAuthorised, trackCron } from "@/lib/cron/track"
import { json } from "@/lib/ai/studio/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300
export const GET = trackCron("ai-media", async (req: Request) => {
  if (!isCronAuthorised(req)) return json({ error: "Unauthorized" }, 401)
  await sql`UPDATE ai_studio_jobs SET status='uncertain',error='Submission was interrupted. Contact support before generating again.',updated_at=now() WHERE status='submitting' AND created_at<now()-interval '2 minutes'`
  const jobs =
    await sql`SELECT id FROM ai_studio_jobs WHERE status IN ('queued','running','saving') AND next_poll_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_poll_at LIMIT 6`
  const r = await Promise.allSettled(jobs.map((j) => advanceJob(j.id)))
  const errors = r.filter((v) => v.status === "rejected").length
  return json({ processed: r.length - errors, errors }, errors ? 500 : 200)
})
