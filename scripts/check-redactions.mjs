#!/usr/bin/env node
/**
 * Fail if a redacted term is back in the repository (docs/architecture/23).
 *
 * A founder's deck and a GP's deck are confidential. Their contents were
 * removed once; since then the name has returned twice in new work, caught
 * both times only by someone reading the diff. This is the floor under that.
 *
 * The list holds sha256 hashes, never the terms — a plaintext list of what
 * must not appear would publish exactly what it suppresses. So this can say
 * that something is wrong and where, but not what: whoever sees the failure
 * has the document and knows the word; the repository never does.
 *
 *   pnpm redaction:check
 *   pnpm redaction:add "<term>"   # prints a hash to paste into the list
 */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const ROOT = process.cwd()
const LIST = "scripts/redactions.json"
// Long enough for a quoted sentence fragment from a deck ("performance os for
// athletic programs"). Costs nothing on the common path: phrases are only
// built where a word already matched the first-word set.
const MAX_WORDS = 6
const MAX_BYTES = 2 * 1024 * 1024

/** Binaries, lockfiles and the list itself — nothing a term hides in usefully. */
const SKIP_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".svg", ".pdf",
  ".woff", ".woff2", ".ttf", ".otf", ".eot", ".zip", ".gz", ".mp4", ".mov",
  ".xlsx", ".xls", ".docx", ".pptx", ".node", ".wasm",
])
const SKIP_FILE = new Set([LIST, "pnpm-lock.yaml", "package-lock.json", "yarn.lock"])

const sha = (s) => createHash("sha256").update(s).digest("hex")

/** The same normalisation on both sides: lowercase, split on non-alphanumerics. */
export function tokenize(text) {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

export function hashTerm(term) {
  return sha(tokenize(term).join(" "))
}

function loadList() {
  const file = path.join(ROOT, LIST)
  if (!fs.existsSync(file)) return { terms: [], firstWords: [] }
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"))
  return { terms: new Set(parsed.terms ?? []), firstWords: new Set(parsed.firstWords ?? []) }
}

/**
 * Scan one file's text.
 *
 * Two stages, because hashing every n-gram of ~2,000 files is slow: hash each
 * word and test it against the first-word set, and only where that hits build
 * the longer phrases.
 */
export function findHits(text, list) {
  const lines = text.split("\n")
  const hits = []
  for (let n = 0; n < lines.length; n++) {
    const words = tokenize(lines[n])
    for (let i = 0; i < words.length; i++) {
      if (!list.firstWords.has(sha(words[i]))) continue
      for (let len = 1; len <= MAX_WORDS && i + len <= words.length; len++) {
        if (list.terms.has(sha(words.slice(i, i + len).join(" ")))) {
          hits.push({ line: n + 1, words: len })
          break
        }
      }
    }
  }
  return hits
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString("utf8").split("\0").filter(Boolean)
}

function main() {
  const list = loadList()
  if (!list.terms?.size) {
    console.log("redaction: no terms configured — nothing to check.")
    return 0
  }

  const failures = []
  let scanned = 0
  for (const file of trackedFiles()) {
    if (SKIP_FILE.has(file) || SKIP_EXT.has(path.extname(file).toLowerCase())) continue
    const full = path.join(ROOT, file)
    let stat
    try { stat = fs.statSync(full) } catch { continue }
    if (!stat.isFile() || stat.size > MAX_BYTES) continue
    let text
    try { text = fs.readFileSync(full, "utf8") } catch { continue }
    if (text.includes("\u0000")) continue // binary in disguise
    scanned++
    for (const hit of findHits(text, list)) failures.push({ file, ...hit })
  }

  if (!failures.length) {
    console.log(`redaction: ${scanned} files scanned, nothing redacted found.`)
    return 0
  }

  console.error(`\nredaction: ${failures.length} occurrence(s) of a redacted term.\n`)
  for (const f of failures) console.error(`  ${f.file}:${f.line}`)
  console.error(`
These terms were removed from this repository on purpose (docs/architecture/23).
The term itself is not printed — the list holds hashes only. Open the file at
the line above; you will recognise it.

Replace it with a neutral fixture, then re-run: pnpm redaction:check
`)
  return 1
}

// pathToFileURL, not string concatenation: a path containing a space is
// percent-encoded in import.meta.url and the comparison silently fails —
// which made this script exit doing nothing at all.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , cmd, ...rest] = process.argv
  if (cmd === "add") {
    const term = rest.join(" ").trim()
    if (!term) { console.error('usage: pnpm redaction:add "<term>"'); process.exit(2) }
    const words = tokenize(term)
    console.log(`\nAdd these to ${LIST} — the term itself is never written down.\n`)
    console.log(`  "terms":      "${hashTerm(term)}"`)
    console.log(`  "firstWords": "${sha(words[0])}"\n`)
    process.exit(0)
  }
  process.exit(main())
}
