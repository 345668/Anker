#!/usr/bin/env node
/**
 * Clean the Anker `investors` and `investment_firms` tables.
 *
 * Three operations (all opt-in, all schema-tolerant):
 *   1. NORMALIZE   trim whitespace, collapse internal runs in `name`,
 *                  convert "" -> NULL on every text column, lowercase emails.
 *   2. DROP EMPTY/GARBAGE   rows with no usable identity (blank name+website
 *                  +email) or an obvious junk name ("test", "asdf", "n/a",
 *                  single char, pure punctuation) and no website.
 *   3. DEDUPLICATE rows sharing lower(name)+website(+location); keep the most
 *                  complete record (then earliest created_at, then lowest id).
 *
 * SAFETY
 *   • Default mode is DRY-RUN: prints a full report and writes a JSON file,
 *     but changes NOTHING. Add --apply to execute.
 *   • Before any DELETE, every affected row is copied verbatim into a
 *     timestamped backup table (cleanup_bak_<table>_<ts>) so the operation
 *     is fully reversible.
 *   • Aborts apply if a single table would lose >40% of its rows, unless
 *     --force is also passed.
 *   • Runs each table inside one transaction (rollback on any error).
 *
 * USAGE
 *   pnpm clean:db                 # dry-run report only (safe)
 *   pnpm clean:db --apply         # normalize + delete, with backups
 *   pnpm clean:db --apply --force # bypass the 40% safety abort
 *   pnpm clean:db --table=investors --apply   # one table only
 *
 * Reads DATABASE_URL / POSTGRES_URL from env or .env.local automatically.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes("--apply");
const FORCE = ARGV.includes("--force");
const ONLY_TABLE = (ARGV.find((a) => a.startsWith("--table=")) || "").split("=")[1] || null;
const MAX_DELETE_FRACTION = 0.4;

// ── load DATABASE_URL from env or .env.local ──────────────────────────────
function loadEnvLocal() {
  const f = path.join(ROOT, ".env.local");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}
loadEnvLocal();
const DB = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
if (!DB) {
  console.error("No DATABASE_URL / POSTGRES_URL set (checked env + .env.local).");
  process.exit(1);
}

const q = (id) => `"${String(id).replace(/"/g, '""')}"`; // safe identifier quote

// junk that is never a real org/investor name (compared after trim+lowercase)
const JUNK_NAMES = new Set([
  "", "test", "testing", "tests", "asdf", "asdfasdf", "qwerty", "qwe",
  "n/a", "na", "none", "null", "nil", "tbd", "tba", "unknown", "undefined",
  "example", "sample", "demo", "placeholder", "xxx", "xx", "aaa",
  "-", "--", "---", ".", "..", "...", "company", "firm", "investor", "fund",
]);

function normName(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}
function isGarbageName(nm) {
  if (JUNK_NAMES.has(nm)) return true;
  if (nm.length < 2) return true;            // single char
  if (!/[a-z0-9]/.test(nm)) return true;     // no letters/digits at all
  if (/^\d+$/.test(nm)) return true;         // pure digits
  return false;
}

async function tableColumns(client, table) {
  const r = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table],
  );
  return r.rows; // [{column_name, data_type}]
}

async function processTable(client, table) {
  const colsMeta = await tableColumns(client, table);
  if (colsMeta.length === 0) { console.log(`\n[${table}] table not found — skipping.`); return null; }
  const colset = new Set(colsMeta.map((c) => c.column_name));
  if (!colset.has("id")) { console.log(`\n[${table}] no 'id' column — cannot safely operate, skipping.`); return null; }

  const hasName = colset.has("name");
  const hasFirst = colset.has("first_name");
  const hasLast = colset.has("last_name");
  // person table (people) vs firm table (orgs) — drives identity + dedup rules
  const personMode = !hasName && (hasFirst || hasLast);
  if (!hasName && !personMode) {
    console.log(`\n[${table}] no 'name' / 'first_name' / 'last_name' column — cannot safely operate, skipping.`);
    return null;
  }

  // SQL expression that yields the display name (firm: name; person: first+last)
  const nameSql = hasName
    ? "name"
    : `btrim(concat_ws(' ', ${hasFirst ? "NULLIF(btrim(first_name),'')" : "NULL"}, ${hasLast ? "NULLIF(btrim(last_name),'')" : "NULL"}))`;
  // column(s) whose internal whitespace runs we collapse during normalize
  const collapseCols = (hasName ? ["name"] : [hasFirst && "first_name", hasLast && "last_name"]).filter(Boolean);

  const textCols = colsMeta
    .filter((c) => ["text", "character varying", "character"].includes(c.data_type))
    .map((c) => c.column_name);
  const hasWebsite = colset.has("website");
  const emailCol = ["email", "contact_email"].find((c) => colset.has(c)) || null;
  const linkedinCol = ["linkedin_url", "person_linkedin_url"].find((c) => colset.has(c)) || null;
  const locCol = ["hq_location", "location"].find((c) => colset.has(c)) || null;
  const hasCreated = colset.has("created_at");

  console.log(`\n────────────────────────────────────────────────────────`);
  console.log(`[${table}] mode=${personMode ? "person" : "firm"} columns=${colsMeta.length} text=${textCols.length} ` +
    `website=${hasWebsite} email=${emailCol ?? "—"} linkedin=${linkedinCol ?? "—"} location=${locCol ?? "—"}`);

  const totalRow = await client.query(`SELECT count(*)::int AS n FROM ${q(table)}`);
  const total = totalRow.rows[0].n;
  console.log(`[${table}] total rows: ${total}`);

  // ── 1. NORMALIZE (count in dry-run, execute in apply) ──────────────────
  // cells needing trim / empty->null
  const trimChecks = textCols.map((c) =>
    `SUM(CASE WHEN ${q(c)} IS DISTINCT FROM NULLIF(btrim(${q(c)}),'') THEN 1 ELSE 0 END)`);
  const emailCheck = emailCol
    ? `SUM(CASE WHEN ${q(emailCol)} IS NOT NULL AND ${q(emailCol)} <> lower(${q(emailCol)}) THEN 1 ELSE 0 END)`
    : `0`;
  const nameCheck =
    "SUM(CASE WHEN " +
    collapseCols.map((c) => `${q(c)} IS DISTINCT FROM NULLIF(regexp_replace(btrim(${q(c)}),'\\s+',' ','g'),'')`).join(" OR ") +
    " THEN 1 ELSE 0 END)";
  const normRes = await client.query(
    `SELECT (${trimChecks.join(" + ") || "0"})::bigint AS trim_cells,
            (${emailCheck})::bigint AS email_cells,
            (${nameCheck})::bigint AS name_cells
     FROM ${q(table)}`);
  const norm = {
    trimCells: Number(normRes.rows[0].trim_cells),
    emailCells: Number(normRes.rows[0].email_cells),
    nameCells: Number(normRes.rows[0].name_cells),
  };
  console.log(`[${table}] normalize: ${norm.trimCells} cells to trim, ` +
    `${norm.nameCells} names to collapse, ${norm.emailCells} emails to lowercase`);

  // ── 2 + 3. fetch lightweight identity rows to find empties/garbage/dupes ──
  const filledExpr = colsMeta.map((c) => `(${q(c.column_name)} IS NOT NULL)::int`).join(" + ");
  const sel = [
    "id",
    `(${nameSql}) AS name`,
    hasWebsite ? "website" : "NULL::text AS website",
    locCol ? `${q(locCol)} AS loc` : "NULL::text AS loc",
    emailCol ? `${q(emailCol)}::text AS email_id` : "NULL::text AS email_id",
    linkedinCol ? `${q(linkedinCol)}::text AS linkedin` : "NULL::text AS linkedin",
    hasCreated ? "created_at" : "NULL::timestamptz AS created_at",
    `(${filledExpr}) AS filled`,
  ].join(", ");
  const rows = (await client.query(`SELECT ${sel} FROM ${q(table)}`)).rows;

  const emptyIds = [];
  const garbageIds = [];
  const groups = new Map(); // key -> [{id, filled, created, ...}]
  const emptySamples = [], garbageSamples = [];

  let uniqueNoKey = 0;
  for (const r of rows) {
    const nm = normName(r.name);
    const web = String(r.website ?? "").trim().toLowerCase();
    const loc = String(r.loc ?? "").trim().toLowerCase();
    const em = String(r.email_id ?? "").trim().toLowerCase();
    const li = String(r.linkedin ?? "").trim().toLowerCase();

    // empty: no usable identity at all
    if (nm === "" && web === "" && em === "" && li === "") {
      emptyIds.push(r.id);
      if (emptySamples.length < 10) emptySamples.push({ id: r.id, name: r.name });
      continue;
    }
    // garbage: junk name AND nothing (website/email/linkedin) to rescue it
    if (isGarbageName(nm) && web === "" && em === "" && li === "") {
      garbageIds.push(r.id);
      if (garbageSamples.length < 10) garbageSamples.push({ id: r.id, name: r.name });
      continue;
    }
    // dedup key:
    //  • person: ONLY on a strong identifier (email, else LinkedIn). Never
    //    merge two distinct people on name alone.
    //  • firm: name + website + location (must match on all three).
    let key;
    if (personMode) {
      key = em ? `e:${em}` : li ? `li:${li}` : null;
    } else {
      key = `n:${nm}|w:${web}|l:${loc}`;
    }
    if (!key) { uniqueNoKey++; continue; }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  if (personMode && uniqueNoKey) {
    console.log(`[${table}] ${uniqueNoKey} people have no email/linkedin — left untouched (not deduped on name alone).`);
  }

  const dupeIds = [];
  const dupeSamples = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    list.sort((a, b) => {
      if (b.filled !== a.filled) return b.filled - a.filled;            // most complete first
      const ca = a.created_at ? new Date(a.created_at).getTime() : Infinity;
      const cb = b.created_at ? new Date(b.created_at).getTime() : Infinity;
      if (ca !== cb) return ca - cb;                                    // earliest first
      return String(a.id) < String(b.id) ? -1 : 1;                      // lowest id
    });
    const keeper = list[0];
    for (const r of list.slice(1)) dupeIds.push(r.id);
    if (dupeSamples.length < 10) dupeSamples.push({ name: keeper.name, copies: list.length, keptId: keeper.id });
  }

  const delSet = new Set([...emptyIds, ...garbageIds, ...dupeIds]);
  const delIds = [...delSet];
  console.log(`[${table}] DROP empty: ${emptyIds.length}  garbage: ${garbageIds.length}  ` +
    `duplicates: ${dupeIds.length}  -> total rows to delete: ${delIds.length}`);
  if (emptySamples.length)   console.log(`           empty e.g.:`, emptySamples.slice(0, 3).map((s) => JSON.stringify(s.name)).join(", "));
  if (garbageSamples.length) console.log(`           garbage e.g.:`, garbageSamples.slice(0, 5).map((s) => JSON.stringify(s.name)).join(", "));
  if (dupeSamples.length)    console.log(`           dupes e.g.:`, dupeSamples.slice(0, 3).map((s) => `${JSON.stringify(s.name)} x${s.copies}`).join(", "));

  const report = {
    table, total,
    normalize: norm,
    drop: { empty: emptyIds.length, garbage: garbageIds.length, duplicates: dupeIds.length, totalDeleted: delIds.length },
    samples: { empty: emptySamples, garbage: garbageSamples, duplicates: dupeSamples },
    remainingAfter: total - delIds.length,
  };

  if (!APPLY) {
    console.log(`[${table}] DRY-RUN — no changes written. Re-run with --apply to execute.`);
    return report;
  }

  // ── APPLY ──────────────────────────────────────────────────────────────
  if (delIds.length > total * MAX_DELETE_FRACTION && !FORCE) {
    console.error(`[${table}] ABORT: would delete ${delIds.length}/${total} ` +
      `(>${Math.round(MAX_DELETE_FRACTION * 100)}%). Re-run with --force if this is intended.`);
    report.aborted = true;
    return report;
  }

  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const backup = `cleanup_bak_${table}_${ts}`;
  try {
    await client.query("BEGIN");

    // 1. normalize
    for (const c of textCols) {
      await client.query(
        `UPDATE ${q(table)} SET ${q(c)} = NULLIF(btrim(${q(c)}),'')
         WHERE ${q(c)} IS DISTINCT FROM NULLIF(btrim(${q(c)}),'')`);
    }
    for (const c of collapseCols) {
      await client.query(
        `UPDATE ${q(table)} SET ${q(c)} = NULLIF(regexp_replace(btrim(${q(c)}),'\\s+',' ','g'),'')
         WHERE ${q(c)} IS DISTINCT FROM NULLIF(regexp_replace(btrim(${q(c)}),'\\s+',' ','g'),'')`);
    }
    if (emailCol) {
      await client.query(
        `UPDATE ${q(table)} SET ${q(emailCol)} = lower(${q(emailCol)})
         WHERE ${q(emailCol)} IS NOT NULL AND ${q(emailCol)} <> lower(${q(emailCol)})`);
    }

    // 2 + 3. backup + delete
    if (delIds.length) {
      await client.query(`CREATE TABLE ${q(backup)} AS SELECT * FROM ${q(table)} WHERE id = ANY($1)`, [delIds]);
      const del = await client.query(`DELETE FROM ${q(table)} WHERE id = ANY($1)`, [delIds]);
      console.log(`[${table}] backed up ${delIds.length} rows -> ${backup}; deleted ${del.rowCount}`);
      report.backupTable = backup;
    } else {
      console.log(`[${table}] nothing to delete; normalization applied.`);
    }

    await client.query("COMMIT");
    console.log(`[${table}] APPLY committed. Restore if needed: ` +
      `INSERT INTO ${table} SELECT * FROM ${backup};`);
    report.applied = true;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[${table}] APPLY failed — rolled back. ${e.message}`);
    report.error = e.message;
  }
  return report;
}

async function main() {
  console.log(`Anker DB cleanup  —  mode: ${APPLY ? "APPLY" : "DRY-RUN"}${FORCE ? " (force)" : ""}`);
  const client = new pg.Client({
    connectionString: DB,
    ssl: /localhost|127\.0\.0\.1/.test(DB) ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  const tables = ONLY_TABLE ? [ONLY_TABLE] : ["investors", "investment_firms"];
  const reports = [];
  for (const t of tables) {
    const r = await processTable(client, t);
    if (r) reports.push(r);
  }
  await client.end();

  // write JSON report next to the script output
  const outDir = path.join(ROOT, "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `db-cleanup-${APPLY ? "apply" : "dryrun"}-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ mode: APPLY ? "apply" : "dry-run", at: new Date().toISOString(), reports }, null, 2));

  console.log(`\n========================================================`);
  for (const r of reports) {
    console.log(`${r.table.padEnd(18)} total ${String(r.total).padStart(7)}  ` +
      `delete ${String(r.drop.totalDeleted).padStart(6)}  -> remain ${String(r.remainingAfter).padStart(7)}` +
      `${r.aborted ? "  [ABORTED >40%]" : r.applied ? "  [applied]" : r.error ? "  [error]" : ""}`);
  }
  console.log(`Report: ${path.relative(ROOT, outFile)}`);
  if (!APPLY) console.log(`\nThis was a DRY-RUN. Review the numbers above, then run:  pnpm clean:db --apply`);
}

main().catch((e) => { console.error(e); process.exit(1); });
