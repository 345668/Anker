// The restore drill (docs/architecture/59 R4), as a module so it can be tested without Neon. The CLI is scripts/restore-drill.mjs.
//
// What it proves: that a point-in-time copy of production can be made, that it contains what production contained an hour ago, and how long that takes. It makes a READ-ONLY branch
// through the Neon API, compares row counts with production within a stated tolerance, runs three read-only queries on the branch, records the outcome, and ALWAYS deletes the branch,
// including when something fails. It reads counts only; no row content is read, printed or stored. The API key is read from the environment by the CLI and never printed.

/** The tables whose counts say the most about whether a restore is whole. A table that does not exist is skipped, not failed. */
export const IMPORTANT_TABLES = [
  "organizations", "memberships", "profiles", "funds", "fund_lps", "investor_calls", "crm_entries", "crm_tasks", "investors", "investment_firms",
  "outreach_messages", "ai_calls", "usage_events", "action_proposals", "deal_opportunities", "lp_documents", "halyard_sessions", "halyard_segments",
  "investor_profiles", "investor_entities",
]
/** Rows written since the branch's point in time are expected to be missing from it; rows can also be deleted. Both are allowed for, and nothing else. */
export const TOLERANCE = { relative: 0.01, floor: 10 }

export function judge(table, prod, restored, recent) {
  const expected = Math.max(0, prod - recent)                      // what production held at the branch's point in time, if nothing was deleted since
  const slack = Math.max(TOLERANCE.floor, Math.ceil(prod * TOLERANCE.relative))
  const ok = restored >= expected - slack && restored <= prod + slack
  return { table, prod, restored, recent, expected, slack, ok }
}

async function count(query, table) {
  const [r] = await query(`SELECT count(*)::bigint AS n FROM "${table}"`)
  return Number(r.n)
}
async function recentRows(query, table, since) {
  try { const [r] = await query(`SELECT count(*)::bigint AS n FROM "${table}" WHERE created_at >= $1`, [since]); return Number(r.n) } catch { return 0 }     // no created_at: no allowance, the plain tolerance applies
}
const tableExists = async (query, t) => ((await query(`SELECT to_regclass($1) AS r`, [`public.${t}`]))[0]?.r ?? null) !== null

/**
 * @param api   { createBranch({ name, parentTimestamp }) -> { branchId, uri }, deleteBranch(branchId) }
 * @param prod  query(text, params) against production (read-only use)
 * @param connect (uri) -> { query(text, params), close() } for the branch
 * @param record async (row) -> void, writes the outcome to restore_drills
 */
export async function runDrill({ api, prod, connect, record, now = () => Date.now(), ageMin = 60, tables = IMPORTANT_TABLES, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), runBy = null, attempts = 30 }) {
  const started = now()
  const pointInTime = new Date(started - ageMin * 60_000).toISOString()
  let branchId = null, conn = null, detail = {}, passed = false, error = null, checks = []
  try {
    const made = await api.createBranch({ name: `restore-drill-${new Date(started).toISOString().replace(/[:.]/g, "-")}`, parentTimestamp: pointInTime })
    branchId = made.branchId
    conn = connect(made.uri)
    let ready = false, last = null
    for (let i = 0; i < attempts && !ready; i++) { try { await conn.query("SELECT 1"); ready = true } catch (e) { last = e; await sleep(2000) } }
    if (!ready) throw new Error(`The restored branch did not accept connections (${last ? String(last.message).slice(0, 120) : "no answer"}).`)
    for (const t of tables) {
      if (!(await tableExists(prod, t)) || !(await tableExists(conn.query, t))) continue
      const [p, r, recent] = [await count(prod, t), await count(conn.query, t), await recentRows(prod, t, pointInTime)]
      checks.push(judge(t, p, r, recent))
    }
    if (!checks.length) throw new Error("None of the important tables could be compared.")
    // Three read-only queries a person would run to see the data is usable.
    const [orgs] = await conn.query("SELECT count(*)::int AS n FROM organizations"); const [mig] = await conn.query("SELECT count(*)::int AS n FROM schema_migrations")
    const [cols] = await conn.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public'")
    detail.queries = { organizations: orgs.n, migrationsRecorded: mig.n, columns: cols.n }
    if (!(orgs.n > 0 && mig.n > 0 && cols.n > 0)) throw new Error("The restored branch answered but looks empty.")
    passed = checks.every((c) => c.ok)
  } catch (e) { error = String(e && e.message ? e.message : e).slice(0, 300) }
  finally {
    try { if (conn) await conn.close() } catch { /* the branch is deleted next regardless */ }
    if (branchId) { try { await api.deleteBranch(branchId); detail.branchDeleted = true } catch (e) { detail.branchDeleted = false; detail.deleteError = String(e && e.message ? e.message : e).slice(0, 200); passed = false; error = error ?? "The drill branch could not be deleted: delete it in the Neon console." } }
  }
  const seconds = Math.round((now() - started) / 1000)
  detail = { ...detail, tables: checks, error }
  const row = { startedAt: new Date(started).toISOString(), ageMin, seconds, passed, tablesChecked: checks.length, tablesOff: checks.filter((c) => !c.ok).length, detail, runBy }
  await record(row)
  return row
}

/** The Neon API calls the drill needs. `fetchImpl` is injectable; the key is only ever placed in the Authorization header. */
export function neonApi({ apiKey, projectId, fetchImpl = fetch, base = "https://console.neon.tech/api/v2" }) {
  const call = async (method, path, body) => {
    const res = await fetchImpl(`${base}${path}`, { method, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`Neon answered ${res.status}${json && json.message ? `: ${String(json.message).slice(0, 160)}` : ""}`)
    return json
  }
  return {
    async createBranch({ name, parentTimestamp }) {
      const j = await call("POST", `/projects/${projectId}/branches`, { branch: { name, parent_timestamp: parentTimestamp }, endpoints: [{ type: "read_only" }] })
      const uri = j.connection_uris && j.connection_uris[0] && j.connection_uris[0].connection_uri
      if (!j.branch || !uri) throw new Error("Neon created no branch or connection address (check the history window of the plan: a point in time older than it cannot be restored).")
      return { branchId: j.branch.id, uri }
    },
    async deleteBranch(branchId) { await call("DELETE", `/projects/${projectId}/branches/${branchId}`) },
  }
}
