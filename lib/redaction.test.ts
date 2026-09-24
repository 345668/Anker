/**
 * The redaction check (docs/architecture/23 §6).
 *
 * A confidential name was removed from this repository once and came back
 * twice in new work, caught both times only by someone reading the diff.
 * These tests cover the floor under that — including the property that makes
 * the whole thing publishable: the list never contains the terms.
 */
import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
// A plain .mjs script, imported for its pure helpers.
import { findHits, hashTerm, tokenize } from "../scripts/check-redactions.mjs"

const sha = (s: string) => createHash("sha256").update(s).digest("hex")

/** A list built here, so the tests never need a real redacted term. */
function listFor(...terms: string[]) {
  return {
    terms: new Set(terms.map((t) => hashTerm(t))),
    firstWords: new Set(terms.map((t) => sha(tokenize(t)[0]))),
  }
}

describe("tokenize", () => {
  it("reads punctuation and case the same on both sides", () => {
    expect(tokenize("Acme-7")).toEqual(["acme", "7"])
    expect(tokenize("pitch.example.io")).toEqual(["pitch", "example", "io"])
    expect(tokenize("  MiXeD,, Case!  ")).toEqual(["mixed", "case"])
  })
})

describe("findHits", () => {
  const list = listFor("Wingspan", "Northern Skating Union")

  it("finds a term however it is written", () => {
    for (const text of ["const x = \"Wingspan\"", "wingspan", "WINGSPAN.", "a wingspan-branded fixture"]) {
      expect(findHits(text, list), text).toHaveLength(1)
    }
  })

  it("reports where, and nothing else", () => {
    const hits = findHits("clean line\nanother\nthe Wingspan fixture\n", list)
    expect(hits).toEqual([{ line: 3, words: 1 }])
    // The hit carries no copy of the term — that is the point.
    expect(JSON.stringify(hits)).not.toMatch(/wingspan/i)
  })

  it("catches a phrase without catching its ordinary words", () => {
    expect(findHits("the northern skating union met", list)).toHaveLength(1)
    expect(findHits("a union of skating clubs in the northern hills", list)).toEqual([])
    expect(findHits("northern lights", list)).toEqual([])
  })

  it("passes clean text, including near-misses", () => {
    expect(findHits("wing span\nwings\nspanning the union\n", list)).toEqual([])
  })

  it("finds every occurrence, not just the first", () => {
    expect(findHits("Wingspan here\nand Wingspan again\n", list)).toHaveLength(2)
  })
})

describe("the list that ships", () => {
  const file = path.join(process.cwd(), "scripts/redactions.json")
  const raw = fs.readFileSync(file, "utf8")
  const parsed = JSON.parse(raw)

  it("holds hashes and nothing else — a plaintext list would be the leak", () => {
    expect(parsed.terms.length).toBeGreaterThan(0)
    for (const entry of [...parsed.terms, ...parsed.firstWords]) {
      expect(entry).toMatch(/^[0-9a-f]{64}$/)
    }
    // Nothing in the file reads as a word: note aside, it is hex.
    const words = raw.replace(/"note":.*/, "").match(/[A-Za-z]{3,}/g) ?? []
    expect(words.filter((w) => !/^(terms|firstWords|note)$/.test(w) && !/^[0-9a-f]+$/i.test(w))).toEqual([])
  })

  it("has a first-word hash for every term", () => {
    expect(parsed.firstWords.length).toBeGreaterThan(0)
    expect(parsed.firstWords.length).toBeLessThanOrEqual(parsed.terms.length)
  })
})
