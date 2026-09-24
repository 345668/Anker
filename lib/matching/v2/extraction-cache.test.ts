/**
 * The same deck must give the same shortlist (docs/architecture/21 §5).
 *
 * Extraction was recomputed on every run, and because the semantic query
 * vector is built from the prose the model writes, two runs of one deck
 * scored the whole directory differently — 10,000 firm groups one time and
 * 9,239 the next.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
vi.mock("server-only", () => ({}))

const state = vi.hoisted(() => ({ query: null as any }))
vi.mock("@/lib/db", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values),
    { unsafe: (query: string, values: unknown[] = []) => state.query(query, values) },
  ),
}))

import { documentHash, extractOnce, forgetExtraction, EXTRACTOR_VERSION } from "./extraction-cache"
import { canonicalSectors } from "../normalize/sectors"

let db: PGlite
const deck = Buffer.from("%PDF-1.7 a founder's deck").toString("base64")
const other = Buffer.from("%PDF-1.7 a different deck").toString("base64")

beforeAll(async () => {
  db = new PGlite()
  state.query = async (q: string, v: unknown[]) => (await db.query(q, v)).rows
  await db.exec(`
    CREATE TABLE organizations (id text PRIMARY KEY, kind text, name text);
    INSERT INTO organizations VALUES ('org-a','company','A'), ('org-b','company','B');
    CREATE TABLE document_extractions (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      doc_hash text NOT NULL, kind text NOT NULL, version text NOT NULL,
      fields jsonb NOT NULL, model text,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL DEFAULT now() + interval '180 days');
    CREATE UNIQUE INDEX document_extractions_key_idx ON document_extractions (org_id, doc_hash, kind, version);
  `)
})
afterAll(async () => db.close())
beforeEach(async () => { await db.exec("DELETE FROM document_extractions") })

/** A model that writes different prose every time — the actual behaviour. */
function drifting() {
  let n = 0
  return async () => ({ name: "Northwind Sports", oneLiner: `a sentence, written attempt ${++n}`, calls: n })
}

describe("extractOnce", () => {
  it("reads a document once and reuses it", async () => {
    const extract = drifting()
    const first = await extractOnce({ scope: { orgId: "org-a" }, hash: documentHash(deck), kind: "startup" }, extract)
    const second = await extractOnce({ scope: { orgId: "org-a" }, hash: documentHash(deck), kind: "startup" }, extract)

    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    // The point of the whole exercise: identical prose, so an identical query
    // vector, so an identical shortlist.
    expect(second.fields).toEqual(first.fields)
    expect((second.fields as any).calls).toBe(1)
  })

  it("re-reads a different document", async () => {
    const extract = drifting()
    await extractOnce({ scope: { orgId: "org-a" }, hash: documentHash(deck), kind: "startup" }, extract)
    const second = await extractOnce({ scope: { orgId: "org-a" }, hash: documentHash(other), kind: "startup" }, extract)
    expect(second.cached).toBe(false)
    expect((second.fields as any).calls).toBe(2)
  })

  it("never lets one workspace read another's extraction", async () => {
    const extract = drifting()
    await extractOnce({ scope: { orgId: "org-a" }, hash: documentHash(deck), kind: "startup" }, extract)
    const b = await extractOnce({ scope: { orgId: "org-b" }, hash: documentHash(deck), kind: "startup" }, extract)
    expect(b.cached).toBe(false)
    const rows = (await db.query<any>("SELECT org_id FROM document_extractions ORDER BY org_id")).rows
    expect(rows.map((r) => r.org_id)).toEqual(["org-a", "org-b"])
  })

  it("keeps a fund deck apart from a startup deck", async () => {
    const extract = drifting()
    await extractOnce({ scope: { orgId: "org-a" }, hash: documentHash(deck), kind: "startup" }, extract)
    const fund = await extractOnce({ scope: { orgId: "org-a" }, hash: documentHash(deck), kind: "fund" }, extract)
    expect(fund.cached).toBe(false)
  })

  it("misses when the extractor version moves on", async () => {
    const extract = drifting()
    await extractOnce({ scope: { orgId: "org-a" }, hash: documentHash(deck), kind: "startup" }, extract)
    await db.query("UPDATE document_extractions SET version = $1", ["an-older-extractor"])
    const again = await extractOnce({ scope: { orgId: "org-a" }, hash: documentHash(deck), kind: "startup" }, extract)
    expect(again.cached).toBe(false)
    expect(EXTRACTOR_VERSION).toBeTruthy()
  })

  it("does not cache an extraction with no workspace to own it", async () => {
    const extract = drifting()
    const out = await extractOnce({ scope: { orgId: null }, hash: documentHash(deck), kind: "startup" }, extract)
    expect(out.cached).toBe(false)
    expect((await db.query<any>("SELECT count(*)::int n FROM document_extractions")).rows[0].n).toBe(0)
  })

  it("still extracts when the cache itself is broken", async () => {
    const extract = drifting()
    const working = state.query
    state.query = async () => { throw new Error("relation \"document_extractions\" does not exist") }
    const out = await extractOnce({ scope: { orgId: "org-a" }, hash: documentHash(deck), kind: "startup" }, extract)
    state.query = working
    expect(out.cached).toBe(false)
    expect((out.fields as any).name).toBe("Northwind Sports")
  })

  it("forgets one document when the read was wrong", async () => {
    const extract = drifting()
    await extractOnce({ scope: { orgId: "org-a" }, hash: documentHash(deck), kind: "startup" }, extract)
    expect(await forgetExtraction({ orgId: "org-a" }, documentHash(deck), "startup")).toBe(1)
    const again = await extractOnce({ scope: { orgId: "org-a" }, hash: documentHash(deck), kind: "startup" }, extract)
    expect(again.cached).toBe(false)
  })

  it("hashes the bytes, not the encoding", () => {
    expect(documentHash(deck)).toBe(documentHash(Buffer.from(deck, "base64")))
    expect(documentHash(deck)).not.toBe(documentHash(other))
  })
})

// ─── The sector vocabulary ──────────────────────────────────────────────────

describe("canonicalSectors", () => {
  it("gives one answer for the two readings that caused the drift", () => {
    const a = canonicalSectors(["sports technology", "healthtech", "ai", "saaS"], "sports technology")
    const b = canonicalSectors(["sports technology", "healthtech", "enterprise software", "ai"], "sports technology")
    expect(a).toEqual(b)
    expect(a).toEqual(["sports", "healthcare", "ai", "saas"])
  })

  it("is stable however the model orders its answer", () => {
    const forwards = canonicalSectors(["fintech", "healthtech", "ai"])
    const backwards = canonicalSectors(["ai", "healthtech", "fintech"])
    expect(forwards).toEqual(backwards)
  })

  it("drops what says nothing about a market", () => {
    expect(canonicalSectors(["technology", "platform", "b2b", "innovation"])).toEqual([])
  })

  it("keeps the primary sector at the head", () => {
    expect(canonicalSectors(["fintech", "healthtech"], "healthtech")[0]).toBe("healthcare")
  })

  it("puts markets before delivery models", () => {
    // Verticals say who the investor backs; horizontals describe everyone.
    const out = canonicalSectors(["saas", "ai", "fintech", "healthtech"])
    expect(out.indexOf("fintech")).toBeLessThan(out.indexOf("saas"))
    expect(out.indexOf("healthcare")).toBeLessThan(out.indexOf("ai"))
  })
})
