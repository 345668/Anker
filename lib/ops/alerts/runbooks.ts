import type { RuleKey } from "./rules"

/** One runbook per rule: what it means, how to check, how to fix. Shown in the alert email and on the incident page. A test fails if a rule has none. */
export interface Runbook { means: string; check: string; fix: string }
export const RUNBOOKS: Record<RuleKey, Runbook> = {
  cron_stale: {
    means: "A scheduled job has not completed successfully for longer than twice its interval. Whatever it does (sending, assessing, syncing) has stopped.",
    check: "SAIL, System health, Scheduled jobs: the job's last runs and errors. Vercel, the project's Cron Jobs tab: is the job listed and enabled? Is the deployment healthy?",
    fix: "If the last run failed, read its error and fix the cause. If there is no recent run at all, check that the schedule is in vercel.json and that CRON_SECRET is set. Run the job once by hand from the Vercel dashboard and watch it complete.",
  },
  cron_stuck: {
    means: "A run started and never finished: the platform killed it at its time limit, or the code hung. It left its row as 'running'.",
    check: "SAIL, System health: how long it has been running. Vercel, the function logs for that job around the start time: a timeout, an out-of-memory kill, or an unhandled error.",
    fix: "Fix the slow step (batch size, a query without an index, a call without a timeout). The incident clears by itself when the job next starts and finishes normally.",
  },
  cron_failing: {
    means: "A job has failed in at least three of its last five runs, including the latest. This is a bug or a broken dependency, not a missed schedule.",
    check: "SAIL, System health: the job's error text. Compare with the dependency checks: a provider key or a database problem often explains several jobs at once.",
    fix: "Fix the cause shown in the error. If a provider is down, nothing to do but wait; add a retry if the job should survive it.",
  },
  dependency_down: {
    means: "A dependency the product needs is missing or broken (a secret, a mailbox, a provider). The nightly check calls this 'down', and a feature that depends on it does not work.",
    check: "The evidence names the check and the fix. Open SAIL, System health for the full list.",
    fix: "Apply the fix the check names (usually set an environment variable in Vercel and redeploy, or connect an account). The incident clears after three clean checks, about 15 minutes.",
  },
  dependency_degraded: {
    means: "A dependency has been working only partly for three nights running (for example a missing footer address, or a failing job that is not yet stuck). It is not urgent, which is why it only appears in the morning digest.",
    check: "SAIL, System health: the check's detail and its fix. The nightly history shows how long it has been degraded.",
    fix: "Apply the fix the check names. It clears by itself after three clean evaluations.",
  },
  ai_failure_rate: {
    means: "A large share of recent AI calls to one provider failed. Answers, document reading or drafting that depend on it are failing or falling back to a slower or costlier provider.",
    check: "SAIL, AI config: the provider's key and its free-lane or token-plan allowance. The failing calls' error text in the usage panel. The provider's own status page.",
    fix: "If a key was rejected, replace it. If the free allowance is spent, add or top up the backup lane. If the provider is down, wait or switch the preferred provider in AI config.",
  },
  privacy_request_due: {
    means: "A confirmed privacy request from a person in the directory is due within 7 days or is overdue. The deadline is 30 days from receipt and is a legal one.",
    check: "SAIL, Privacy requests: the request, the records found and its due date.",
    fix: "Act on the request (access, correct, restrict, erase) or, if it is complex, extend it once with a reason. Closing the request clears this incident.",
  },
  telegram_queue: {
    means: "Messages sent to the Anker bot by customers are waiting or failing: people are not getting answers on Telegram.",
    check: "SAIL, Telegram channel: the queue, the webhook status and its last error. Vercel function logs for /api/telegram/webhook and the telegram-sweep cron. Telegram's own status.",
    fix: "If the webhook is not registered or shows an error, register it again in SAIL. If the AI provider is failing, fix that first (the AI failure rule will also be open). The sweep retries waiting messages every minute, up to three times each.",
  },
  cost_coverage: {
    means: "Many recent AI calls have no cost on record. A workspace's monthly AI allowance adds up those costs, so it would not stop a workspace that is using far more than its plan.",
    check: "SAIL, Model prices: which models are unpriced. SAIL, AI usage: calls by provider and model for the last day.",
    fix: "Add the missing prices in SAIL, Model prices. If the provider returns no token counts, calls are estimated from text length and still count; if most calls are unpriced, a new model was switched on without a price.",
  },
  unpriced_model: {
    means: "Calls to a model with no price were made in the last day, so their cost is not counted in anyone's allowance.",
    check: "The model name in this alert; SAIL, Model prices.",
    fix: "Enter the model's list price per million input and output tokens in SAIL, Model prices. The incident clears when no unpriced call is recorded for a day.",
  },
  workspace_at_limit: {
    means: "A workspace used all of its monthly AI allowance, so its AI answers, voice notes, document reading and generation are paused until the month resets.",
    check: "SAIL, Unit economics: the workspace's spend against its limit and where it went. SAIL, Tenants: its plan and limits.",
    fix: "If the use is legitimate, raise the workspace's AI limit in SAIL, Tenants, or move it to a larger plan. If it looks wrong (a loop, a very large upload), look at the usage breakdown first. The owners have already been told in the app.",
  },
  schema_behind: {
    means: "The version of Anker that is running expects database changes that have not been made yet. Anything that uses them (a new column, a new table) fails until they are applied. This usually means a deploy went out before its migration.",
    check: "The file names in this alert. `pnpm migrate:verify` lists every migration against the database, so you can see whether the file is really missing or only unrecorded.",
    fix: "Apply the named file: `node scripts/oneshot/run-migration.mjs scripts/migrations/<file> --yes-production`. If `migrate:verify` says the objects already exist, run `pnpm migrate:verify --record`. The incident clears by itself once the ledger has the file.",
  },
  halyard_latency: {
    means: "People using Halyard on a live call are waiting too long for suggestions (the slowest 5% took over four seconds).",
    check: "SAIL, Halyard: the 95th percentile and the suggestion count for the last 15 minutes. SAIL, AI usage: whether the model provider is slow or failing (the AI failure rule may also be open). Vercel function logs for the act route.",
    fix: "If one provider is slow, move the Halyard tasks to another lane in AI configuration. If it is the model tier, a faster tier for the live actions helps. Nothing is lost meanwhile: suggestions arrive late, the transcript is unaffected.",
  },
  halyard_stt_failing: {
    means: "Audio from live calls is failing to turn into text, so parts of conversations are missing from the transcript. The browser keeps unsent audio and retries.",
    check: "SAIL, Halyard: the failure share and the count. SAIL, Platform keys: the Qwen key on the standard lane (speech is not served on the plan lane). Vercel function logs for the utterances route.",
    fix: "Fix the key or the provider (the transcription service rejecting credentials is the usual cause). People with a call open will see their audio waiting and sent when it works again; calls that already ended cannot be re-transcribed because audio is never stored.",
  },
  smoke_failed: {
    means: "The automatic check that runs after each deploy found a problem: a public page did not load, the database or the migrations were not as the code expects, or a deep check failed. The deploy is live, so customers may be affected.",
    check: "The failures named in this alert. The GitHub Actions run called Post-deploy smoke has the full log. `/api/health` shows the database and migration state; Vercel's function logs show the failing route.",
    fix: "If a migration is missing, apply it (the schema alert will also be open). If a page or route fails, roll back the deploy in Vercel (Deployments, the previous one, Promote) and fix forward. The incident clears by itself after the next passing run, or after a day.",
  },
  alerter_stale: {
    means: "The alert evaluator itself has stopped. Until it runs again nothing is being watched, so any other fault would go unreported.",
    check: "Vercel, Cron Jobs: is alerts-evaluate scheduled and recent? Function logs for /api/cron/alerts-evaluate: an error, a timeout, a missing CRON_SECRET. SAIL, Alerts, the heartbeat line.",
    fix: "Fix the error shown in the logs and run alerts-evaluate once by hand. This incident clears by itself when the heartbeat is fresh.",
  },
}
