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
  alerter_stale: {
    means: "The alert evaluator itself has stopped. Until it runs again nothing is being watched, so any other fault would go unreported.",
    check: "Vercel, Cron Jobs: is alerts-evaluate scheduled and recent? Function logs for /api/cron/alerts-evaluate: an error, a timeout, a missing CRON_SECRET. SAIL, Alerts, the heartbeat line.",
    fix: "Fix the error shown in the logs and run alerts-evaluate once by hand. This incident clears by itself when the heartbeat is fresh.",
  },
}
