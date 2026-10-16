/**
 * node scripts/smoke.mjs <base url>      (SMOKE_TOKEN in the environment enables the deep checks and the report)
 * Exits 1 when any check fails. With a token, the result is also reported to the app so the alert engine can tell the operator.
 */
import { runSmoke, summarise } from "./lib/smoke.mjs"

const base = process.argv[2] || process.env.SMOKE_BASE_URL
if (!base) { console.error("Usage: node scripts/smoke.mjs <base url>"); process.exit(2) }
const token = process.env.SMOKE_TOKEN || ""
const full = await runSmoke({ base, token })
console.log(summarise(full))
if (token) {
  try {
    const res = await fetch(new URL("/api/smoke", base), { method: "POST", headers: { "x-smoke-token": token, "content-type": "application/json" }, body: JSON.stringify({ sha: process.env.GITHUB_SHA ?? null, baseUrl: base, ok: full.ok, skipped: full.skipped, failures: full.failures }), signal: AbortSignal.timeout(15_000) })
    console.log(`report: ${res.status}`)
  } catch (e) { console.log(`report could not be sent (${e?.message ?? e}); this run still fails the workflow if a check failed`) }
}
process.exit(full.ok ? 0 : 1)
