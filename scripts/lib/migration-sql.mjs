/**
 * Reading migration files (docs/architecture/59): splitting them into statements, finding the statements that destroy things, and listing the database objects a file creates.
 * Pure: nothing here touches a database.
 */

/** Splits SQL on semicolons, respecting 'strings' and $$dollar quotes$$, and dropping line and block comments. */
export function splitSql(src) {
  const out = []
  let buf = "", inSingle = false, dollarTag = null
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (dollarTag) {
      buf += c
      if (c === "$" && src.slice(i).startsWith(dollarTag)) { buf += dollarTag.slice(1); i += dollarTag.length - 1; dollarTag = null }
      continue
    }
    if (inSingle) { buf += c; if (c === "'" && src[i - 1] !== "\\") inSingle = false; continue }
    if (c === "/" && src[i + 1] === "*") { const end = src.indexOf("*/", i + 2); if (end === -1) break; buf += " "; i = end + 1; continue }
    if (c === "-" && src[i + 1] === "-") { const nl = src.indexOf("\n", i); if (nl === -1) break; buf += "\n"; i = nl; continue }
    if (c === "'") { inSingle = true; buf += c; continue }
    if (c === "$") { const m = src.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/); if (m) { dollarTag = m[0]; buf += m[0]; i += m[0].length - 1; continue } }
    if (c === ";") { out.push(buf); buf = ""; continue }
    buf += c
  }
  if (buf.trim()) out.push(buf)
  return out
}

/** The statements of a file, comments removed, blanks dropped. */
export const statementsOf = (raw) => splitSql(raw.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n")).map((s) => s.trim()).filter(Boolean)

export const DESTRUCTIVE_HEADER = /^\s*--\s*destructive:\s*\S+/i

/** Statements that remove data or structure. A DELETE without WHERE counts; a DELETE with one does not. */
export function destructiveStatements(raw) {
  const found = []
  for (const s of statementsOf(raw)) {
    const flat = s.replace(/\s+/g, " ")
    if (/^drop\s+(table|column|schema|database)\b/i.test(flat) || /^alter\s+table\s+.+\s+drop\s+column\b/i.test(flat) || /^truncate\b/i.test(flat) || (/^delete\s+from\b/i.test(flat) && !/\bwhere\b/i.test(flat))) found.push(flat.slice(0, 90))
  }
  return found
}

/** True when the first line of the file names the restore point or reason. */
export const hasDestructiveHeader = (raw) => DESTRUCTIVE_HEADER.test(raw.split("\n").find((l) => l.trim()) ?? "")

const norm = (s) => {
  let n = s.trim().replace(/"/g, "").toLowerCase()
  if (!/^[a-z_][a-z0-9_.]*$/.test(n)) return null
  if (n.includes(".")) { const [schema, name] = n.split("."); if (schema !== "public") return null; n = name }
  return n || null
}
const topLevelSplit = (body) => {
  const parts = []; let depth = 0, cur = "", q = false
  for (const ch of body) {
    if (ch === "'") q = !q
    if (!q) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue } }
    cur += ch
  }
  if (cur.trim()) parts.push(cur)
  return parts.map((p) => p.trim()).filter(Boolean)
}
export const keyOf = (o) => `${o.kind}:${o.table ? o.table + "." : ""}${o.name}`
const NOT_COLUMN = /^(constraint|primary|unique|foreign|check|exclude|like)\b/i

/**
 * What a file creates and what it removes. Objects: { kind: table|column|index|function|view|type|constraint|extension, name, table? }.
 * Seeded rows and updates are not objects (they are data). Anything in a schema other than public is ignored.
 */
export function extractObjects(raw) {
  const created = [], dropped = []
  let seq = 0
  const mk = (o) => created.push({ ...o, seq: seq++ })
  const rm = (o) => dropped.push({ ...o, seq: seq++ })
  for (const st of statementsOf(raw)) {
    const s = st.replace(/\s+/g, " ")
    let m
    if ((m = /^create (?:unlogged |global |temp(?:orary)? )?table (?:if not exists )?([\w."]+)\s*\((.*)\)\s*(?:partition by .*|with .*|tablespace .*)?$/i.exec(s))) {
      const t = norm(m[1]); if (!t) continue
      mk({ kind: "table", name: t })
      for (const part of topLevelSplit(m[2])) { if (NOT_COLUMN.test(part)) continue; const c = norm(part.split(/\s+/)[0]); if (c) mk({ kind: "column", name: c, table: t }) }
    } else if ((m = /^create table (?:if not exists )?([\w."]+)/i.exec(s))) { const t = norm(m[1]); if (t) mk({ kind: "table", name: t }) }
    else if ((m = /^create (?:unique )?index (?:concurrently )?(?:if not exists )?([\w."]+)/i.exec(s))) { const n = norm(m[1]); if (n) mk({ kind: "index", name: n }) }
    else if ((m = /^create (?:or replace )?function ([\w."]+)\s*\(/i.exec(s))) { const n = norm(m[1]); if (n) mk({ kind: "function", name: n }) }
    else if ((m = /^create (?:or replace )?(?:materialized )?(?:temp(?:orary)? |recursive )?view ([\w."]+)/i.exec(s))) { const n = norm(m[1]); if (n) mk({ kind: "view", name: n }) }
    else if ((m = /^create type ([\w."]+)/i.exec(s))) { const n = norm(m[1]); if (n) mk({ kind: "type", name: n }) }
    else if ((m = /^create extension (?:if not exists )?"?([\w-]+)"?/i.exec(s))) mk({ kind: "extension", name: m[1].toLowerCase() })
    else if ((m = /^alter table (?:if exists )?(?:only )?([\w."]+) (.*)$/i.exec(s))) {
      const t = norm(m[1]); if (!t) continue
      const rest = m[2]
      let r
      if ((r = /^rename to ([\w"]+)$/i.exec(rest))) { rm({ kind: "table", name: t }); const n = norm(r[1]); if (n) mk({ kind: "table", name: n }); continue }
      if ((r = /^rename (?:column )?([\w"]+) to ([\w"]+)$/i.exec(rest))) { rm({ kind: "column", name: norm(r[1]), table: t }); mk({ kind: "column", name: norm(r[2]), table: t }); continue }
      for (const clause of topLevelSplit(rest)) {
        if ((r = /^add constraint ([\w"]+)/i.exec(clause))) mk({ kind: "constraint", name: norm(r[1]) })
        else if (/^add (?:primary key|unique|foreign key|check|exclude)\b/i.test(clause)) continue
        else if ((r = /^add (?:column )?(?:if not exists )?([\w"]+)/i.exec(clause))) mk({ kind: "column", name: norm(r[1]), table: t })
        else if ((r = /^drop column (?:if exists )?([\w"]+)/i.exec(clause))) rm({ kind: "column", name: norm(r[1]), table: t })
        else if ((r = /^drop constraint (?:if exists )?([\w"]+)/i.exec(clause))) rm({ kind: "constraint", name: norm(r[1]) })
      }
    } else if ((m = /^drop (table|index|view|materialized view|function|type|extension) (?:if exists )?([\w."]+)/i.exec(s))) {
      const kind = m[1].toLowerCase().replace("materialized ", ""), n = kind === "extension" ? m[2].toLowerCase() : norm(m[2]); if (n) rm({ kind, name: n })
    }
  }
  // Dropped and then created again in the same file (the usual way to change a constraint) is not a removal.
  const lastMade = new Map(created.map((o) => [keyOf(o), o.seq]))
  const strip = ({ seq, ...o }) => o
  return { created: created.map(strip), dropped: dropped.filter((d) => !((lastMade.get(keyOf(d)) ?? -1) > d.seq)).map(strip) }
}

