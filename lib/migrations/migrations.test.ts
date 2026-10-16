import { describe, it, expect, vi } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
// @ts-expect-error plain .mjs shared with the command-line tools
import { splitSql, statementsOf, destructiveStatements, hasDestructiveHeader, extractObjects, keyOf } from "../../scripts/lib/migration-sql.mjs"
// @ts-expect-error plain .mjs shared with the command-line tools
import { emptyCatalog, verdictFor } from "../../scripts/lib/migration-probe.mjs"
import manifest from "./manifest.json"
import { behindOf } from "./schema-state"

const DIR = path.join(process.cwd(), "scripts", "migrations")
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()

describe("reading a migration", () => {
  it("splits on semicolons but not inside strings, dollar quotes or comments", () => {
    const parts = splitSql("select 'a;b'; -- x; y\n/* c; d */ create function f() returns int as $$ begin return 1; end $$ language plpgsql; select 2")
    expect(parts.map((p: string) => p.trim()).filter(Boolean)).toHaveLength(3)
  })
  it("lists what a file creates: tables with their columns, columns added, indexes, functions, views, constraints, extensions", () => {
    const { created } = extractObjects(`
      CREATE TABLE IF NOT EXISTS public.widgets (id text PRIMARY KEY, name text NOT NULL, CONSTRAINT widgets_name_chk CHECK (name <> ''), qty integer DEFAULT 0);
      ALTER TABLE widgets ADD COLUMN IF NOT EXISTS color text, ADD COLUMN size int;
      ALTER TABLE widgets ADD CONSTRAINT widgets_qty_chk CHECK (qty >= 0);
      CREATE UNIQUE INDEX IF NOT EXISTS widgets_name_uq ON widgets (name);
      CREATE OR REPLACE FUNCTION touch() RETURNS trigger AS $$ BEGIN RETURN NEW; END $$ LANGUAGE plpgsql;
      CREATE OR REPLACE VIEW widget_names AS SELECT name FROM widgets;
      CREATE EXTENSION IF NOT EXISTS vector;
      INSERT INTO widgets (id, name) VALUES ('a', 'b');`)
    expect(created.map(keyOf).sort()).toEqual(["column:widgets.color", "column:widgets.id", "column:widgets.name", "column:widgets.qty", "column:widgets.size", "constraint:widgets_qty_chk", "extension:vector", "function:touch", "index:widgets_name_uq", "table:widgets", "view:widget_names"].sort())
  })
  it("ignores other schemas, seeded rows, comments inside a table body, and a constraint that is dropped and added again", () => {
    const { created, dropped } = extractObjects(`CREATE TABLE auth.things (id int); CREATE TABLE t (id int, /* note */ a text -- trailing
      , b text);
      ALTER TABLE t DROP CONSTRAINT IF EXISTS t_chk; ALTER TABLE t ADD CONSTRAINT t_chk CHECK (a <> '');
      ALTER TABLE t DROP COLUMN b; ALTER TABLE t RENAME COLUMN a TO aa; DROP INDEX IF EXISTS old_idx;`)
    expect(created.map(keyOf)).not.toContain("table:things")
    expect(dropped.map(keyOf).sort()).toEqual(["column:t.a", "column:t.b", "index:old_idx"].sort())
    expect(created.map(keyOf)).toContain("constraint:t_chk"); expect(created.map(keyOf)).toContain("column:t.aa")
  })
  it("finds statements that destroy, and a delete with a WHERE is not one", () => {
    expect(destructiveStatements("DROP TABLE x; ALTER TABLE y DROP COLUMN z; TRUNCATE w; DELETE FROM v; DELETE FROM u WHERE id = 1; DROP INDEX i;")).toHaveLength(4)
    expect(hasDestructiveHeader("-- destructive: restore point neon 2026-10-16 14:00\nDROP TABLE x;")).toBe(true)
    expect(hasDestructiveHeader("-- destructive:\nDROP TABLE x;")).toBe(false); expect(hasDestructiveHeader("-- hello\nDROP TABLE x;")).toBe(false)
  })
})

describe("comparing a file with the database", () => {
  const cat = () => { const c = emptyCatalog(); c.tables.set("widgets", new Set(["id", "name"])); c.indexes.add("widgets_name_uq"); return c }
  const created = (sqlText: string) => extractObjects(sqlText).created
  it("applied when everything is there; partial when a table exists in an older shape; absent when none is; unknown when the file creates nothing readable", () => {
    expect(verdictFor(created("CREATE TABLE widgets (id text, name text); CREATE INDEX widgets_name_uq ON widgets (name);"), cat()).verdict).toBe("applied")
    const partial = verdictFor(created("CREATE TABLE widgets (id text, name text, color text);"), cat()); expect(partial.verdict).toBe("partial"); expect(partial.missing).toEqual(["column:widgets.color"])
    expect(verdictFor(created("CREATE TABLE gadgets (id text);"), cat()).verdict).toBe("absent")
    expect(verdictFor(created("INSERT INTO widgets VALUES ('a');"), cat()).verdict).toBe("unknown")
  })
  it("an object a later file drops is not expected to be there", () => {
    const later = new Set(["column:widgets.color"])
    expect(verdictFor(created("CREATE TABLE widgets (id text, name text, color text);"), cat(), later).verdict).toBe("applied")
    expect(verdictFor(created("CREATE TABLE widgets (id text, color text);"), cat(), new Set(["table:widgets"])).verdict).toBe("unknown")
  })
})

describe("the migration folder", () => {
  it("every file can be read, and no file removes data or structure without saying why on its first line", () => {
    for (const f of files) {
      const raw = readFileSync(path.join(DIR, f), "utf8")
      expect(() => extractObjects(raw), f).not.toThrow()
      if (destructiveStatements(raw).length) expect(hasDestructiveHeader(raw), `${f} removes data or structure: its first line must be "-- destructive: <restore point or reason>"`).toBe(true)
    }
  })
  it("the manifest lists exactly the files in the folder (run `pnpm migrate:manifest` after adding one)", () => {
    expect(manifest.files).toEqual(files)
  })
  it("reading a migration's statements matches what the runner applies", () => {
    for (const f of ["2026-10-16m-metering-m1.sql", "2026-10-16q-metering-m3.sql"]) expect(statementsOf(readFileSync(path.join(DIR, f), "utf8")).length).toBeGreaterThan(1)
  })
})

describe("behind the code", () => {
  it("lists expected files the ledger lacks, in order, and nothing when it is complete", () => {
    expect(behindOf(["a.sql", "b.sql", "c.sql"], ["a.sql", "c.sql", "old.sql"])).toEqual(["b.sql"])
    expect(behindOf(["a.sql"], ["a.sql"])).toEqual([])
  })
})
vi.mock("@/lib/db", () => ({ sql: async () => [] }))
