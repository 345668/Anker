/**
 * The post-deploy smoke test (docs/architecture/59 R6). Pure given a fetch function, so it is tested without a network.
 * Public checks need nothing; the deep check needs the smoke token and is reported as skipped (not failed) without one.
 */
const PUBLIC_PAGES = ["/", "/login", "/privacy", "/privacy/subprocessors", "/terms", "/security"]

async function timed(name, fn) {
  const t = Date.now()
  try { const detail = await fn(); return { name, ok: true, ms: Date.now() - t, ...(detail ? { detail } : {}) } }
  catch (e) { return { name, ok: false, ms: Date.now() - t, error: String(e?.message ?? e).slice(0, 200) } }
}

/** Retries while a fresh deployment's address is still being switched over. */
async function withRetry(fn, tries, waitMs, sleep) {
  let last
  for (let i = 0; i < tries; i++) { try { return await fn() } catch (e) { last = e; if (i < tries - 1) await sleep(waitMs * (i + 1)) } }
  throw last
}

export async function runSmoke({ base, token = "", fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), retries = 4, waitMs = 5000 }) {
  const get = (p, init = {}) => fetchFn(new URL(p, base), { redirect: "manual", signal: AbortSignal.timeout(15_000), ...init })
  const checks = []

  checks.push(await timed("health", () => withRetry(async () => {
    const r = await get("/api/health"); const j = await r.json().catch(() => null)
    if (r.status !== 200) throw new Error(`/api/health answered ${r.status}`)
    if (!j?.db) throw new Error("the database did not answer")
    if (j.schemaBehind !== 0) throw new Error(j.schemaBehind == null ? "the migration ledger could not be read" : `the database is missing ${j.schemaBehind} migration(s) the code expects`)
  }, retries, waitMs, sleep)))

  for (const p of PUBLIC_PAGES) checks.push(await timed(`page ${p}`, async () => {
    const r = await get(p)
    if (r.status >= 300 && r.status < 400) { const to = r.headers.get("location") ?? ""; if (!/^\/|^https?:\/\//.test(to)) throw new Error(`${p} redirected somewhere unreadable`); return `redirects (${r.status})` }
    if (r.status !== 200) throw new Error(`${p} answered ${r.status}`)
  }))

  let skipped = 0
  if (!token) { skipped = 1 }
  else {
    checks.push(await timed("deep checks", async () => {
      const r = await get("/api/smoke", { headers: { "x-smoke-token": token } })
      if (r.status === 401 || r.status === 403) throw new Error("the smoke token was refused")
      if (r.status === 503) throw new Error("the app has no smoke token set (SMOKE_TOKEN)")
      const j = await r.json().catch(() => null)
      if (!j || !Array.isArray(j.checks)) throw new Error(`/api/smoke answered ${r.status} with no result`)
      const bad = j.checks.filter((c) => !c.ok)
      if (bad.length) throw new Error(bad.map((c) => `${c.name}: ${c.error ?? "failed"}`).join("; "))
      return `${j.checks.length} checks`
    }))
  }
  const failures = checks.filter((c) => !c.ok).map((c) => ({ name: c.name, error: c.error }))
  return { ok: failures.length === 0, checks, failures, skipped }
}

/** One readable line per check, for the workflow log. */
export const summarise = (r) => [...r.checks.map((c) => `${c.ok ? "ok  " : "FAIL"} ${c.name} (${c.ms} ms)${c.error ? `: ${c.error}` : c.detail ? ` - ${c.detail}` : ""}`), ...(r.skipped ? ["skip deep checks (no SMOKE_TOKEN set in this workflow)"] : [])].join("\n")
