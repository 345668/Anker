import { keyOf } from "./migration-sql.mjs"

/**
 * Comparing what a migration file creates with what the database holds (docs/architecture/59 R1). Pure given a catalog snapshot; the snapshot is read once.
 *   applied  every object the file creates is there
 *   partial  some are, some are not: the dangerous case (a table that exists in an older shape, a half-applied file)
 *   absent   none are there
 *   unknown  the file creates no objects the reader understands (data only, or a shape it does not parse): a person must look
 * Objects that a later file drops or renames are not expected to be there, so they are left out.
 */
export function emptyCatalog() { return { tables: new Map(), indexes: new Set(), views: new Set(), functions: new Set(), constraints: new Set(), types: new Set(), extensions: new Set() } }

export function has(cat, o) {
  switch (o.kind) {
    case "table": return cat.tables.has(o.name) || cat.views.has(o.name)
    case "column": return !!cat.tables.get(o.table)?.has(o.name)
    case "index": return cat.indexes.has(o.name) || cat.tables.has(o.name)
    case "view": return cat.views.has(o.name) || cat.tables.has(o.name)
    case "function": return cat.functions.has(o.name)
    case "constraint": return cat.constraints.has(o.name)
    case "type": return cat.types.has(o.name)
    case "extension": return cat.extensions.has(o.name)
    default: return true
  }
}

/** `later` is the set of object keys dropped or renamed by any file after (or in) this one. */
export function verdictFor(created, cat, later = new Set()) {
  const expected = []
  const seen = new Set()
  for (const o of created) { const k = keyOf(o); if (seen.has(k) || later.has(k)) continue; seen.add(k); expected.push(o) }
  // A column of a table that a later file drops goes with it.
  const live = expected.filter((o) => !(o.kind === "column" && later.has(`table:${o.table}`)))
  if (!live.length) return { verdict: "unknown", present: [], missing: [] }
  const present = [], missing = []
  for (const o of live) (has(cat, o) ? present : missing).push(keyOf(o))
  return { verdict: missing.length === 0 ? "applied" : present.length === 0 ? "absent" : "partial", present, missing }
}

/** Reads the public schema once: six small queries, whatever the number of files. `query(text)` returns rows. */
export async function readCatalog(query) {
  const cat = emptyCatalog()
  for (const r of await query("select table_name, column_name from information_schema.columns where table_schema = 'public'")) {
    if (!cat.tables.has(r.table_name)) cat.tables.set(r.table_name, new Set())
    cat.tables.get(r.table_name).add(r.column_name)
  }
  for (const r of await query("select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'")) {
    if (r.relkind === "i" || r.relkind === "I") cat.indexes.add(r.relname)
    else if (r.relkind === "v" || r.relkind === "m") { cat.views.add(r.relname); if (!cat.tables.has(r.relname)) cat.tables.set(r.relname, new Set()) }
    else if (r.relkind === "r" || r.relkind === "p") { if (!cat.tables.has(r.relname)) cat.tables.set(r.relname, new Set()) }
  }
  for (const r of await query("select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'")) cat.functions.add(r.proname)
  for (const r of await query("select conname from pg_constraint")) cat.constraints.add(r.conname)
  for (const r of await query("select typname from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public'")) cat.types.add(r.typname)
  for (const r of await query("select extname from pg_extension")) cat.extensions.add(r.extname)
  return cat
}
