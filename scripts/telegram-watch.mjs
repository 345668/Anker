/**
 * Read-only watcher for the first real run of the Telegram channel (docs/architecture/57 section 21, T5a).
 *   node scripts/telegram-watch.mjs            # the state of the channel right now
 * Prints counts and statuses only: no message text, no names, no tokens. The incoming updates are encrypted and wiped after processing, so this cannot show content.
 */
import { neon } from "@neondatabase/serverless"
import { loadEnvFiles } from "./lib/load-env.mjs"
loadEnvFiles()
const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL)
const q = (t, p = []) => sql.query(t, p).catch((e) => [{ error: String(e.message).slice(0, 120) }])
const show = (title, rows) => console.log(`\n${title}\n${rows.length ? rows.map((r) => "  " + JSON.stringify(r)).join("\n") : "  (none)"}`)

const [flag] = await q("select enabled, rollout_pct from platform_flags where key = 'telegram_channel'")
console.log(`Flag telegram_channel: ${flag?.enabled ? "ON" : "off"} (rollout ${flag?.rollout_pct ?? "?"}%)`)
show("Subprocessor entry (the public list)", await q("select slug, active, public from ai_subprocessors where slug = 'telegram'"))
show("Bots (the token is never read)", await q("select id, org_id, user_id is not null as personal, username, to_char(created_at,'MM-DD HH24:MI') created from telegram_bots order by created_at"))
show("Devices", await q("select bot_id, status, mode, to_char(linked_at,'MM-DD HH24:MI') linked, to_char(last_seen_at,'MM-DD HH24:MI') seen from telegram_links order by created_at"))
show("Update queue, last 2 hours (status, kind, tries, short error)", await q("select kind, status, attempts, left(error, 80) as error, to_char(received_at,'HH24:MI:SS') at from telegram_updates where received_at > now() - interval '2 hours' order by received_at desc limit 25"))
show("Counts by status, last 24 hours", await q("select status, count(*)::int n from telegram_updates where received_at > now() - interval '24 hours' group by 1"))
show("Messages the bot remembers (for /forget), last 48 hours", await q("select kind, count(*)::int n from telegram_sent where sent_at > now() - interval '48 hours' group by 1"))
show("Held voice notes and files (waiting for a tap)", await q("select kind, count(*)::int n from telegram_pending group by 1"))
show("Proposals made from Telegram or waiting", await q("select status, risk_class, count(*)::int n from action_proposals where created_at > now() - interval '2 hours' group by 1, 2"))
show("Usage events from the channel, last 2 hours", await q("select unit, round(sum(qty))::int qty, round(sum(cost_usd)::numeric, 5) usd from usage_events where source like 'telegram%' and created_at > now() - interval '2 hours' group by 1"))
show("Cron health", await q("select job, status, to_char(started_at,'HH24:MI') at from cron_runs where job in ('telegram-sweep','telegram-notify') order by started_at desc limit 3"))
