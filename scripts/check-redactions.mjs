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
import { inflateRawSync } from "node:zlib"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const ROOT = process.cwd()
const LIST = "scripts/redactions.json"
// Long enough for a quoted sentence fragment from a deck. Costs nothing on the
// common path: phrases are only built where a word already matched.
const MAX_WORDS = 6
const MAX_BYTES = 8 * 1024 * 1024

/** Office files are ZIPs of XML — their text is readable with zlib alone. */
const OFFICE_EXT = new Set([".docx", ".xlsx", ".pptx"])
/** Formats whose text cannot be read here. Counted and reported, never silent. */
const OPAQUE_EXT = new Set([".pdf", ".key", ".numbers", ".pages", ".zip", ".gz", ".mp4", ".mov", ".node", ".wasm", ".xls"])
/** Binary media with no text worth scanning. */
const SKIP_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
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

/**
 * Tokens with the line each came from.
 *
 * Scanning line by line missed any phrase a line break fell inside — and prose
 * wraps at eighty characters, so documents, where the leak happened before,
 * were the likeliest place to miss one. The stream crosses lines; the line
 * number is kept for the report.
 */
export function tokensWithLines(text) {
  const out = []
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    for (const t of tokenize(lines[i])) out.push({ t, line: i + 1 })
  }
  return out
}

export function findHits(text, list) {
  const tokens = tokensWithLines(text)
  const hits = []
  for (let i = 0; i < tokens.length; i++) {
    if (!list.firstWords.has(sha(tokens[i].t))) continue
    for (let len = 1; len <= MAX_WORDS && i + len <= tokens.length; len++) {
      const phrase = tokens.slice(i, i + len).map((x) => x.t).join(" ")
      if (list.terms.has(sha(phrase))) {
        hits.push({ line: tokens[i].line, words: len })
        break
      }
    }
  }
  return hits
}

/** A file whose *name* carries a term — a committed deck, most obviously. */
export function nameHits(file, list) {
  return findHits(file.replace(/[\\/]/g, " "), list).length > 0
}

/**
 * Text inside a .docx / .xlsx / .pptx, which are ZIP archives of XML.
 *
 * Reads local file headers and inflates the deflated entries with zlib. No
 * dependency, and a malformed archive yields nothing rather than failing the
 * run. Without this, 44 tracked documents — including a fund's outreach
 * spreadsheet — were never looked at.
 */
export function officeText(buffer) {
  const parts = []
  const SIG = 0x04034b50
  for (let i = 0; i + 30 <= buffer.length; i++) {
    if (buffer.readUInt32LE(i) !== SIG) continue
    try {
      const method = buffer.readUInt16LE(i + 8)
      const compressed = buffer.readUInt32LE(i + 18)
      const nameLen = buffer.readUInt16LE(i + 26)
      const extraLen = buffer.readUInt16LE(i + 28)
      const start = i + 30 + nameLen + extraLen
      const name = buffer.toString("utf8", i + 30, i + 30 + nameLen)
      if (!/\.(xml|rels|txt)$/i.test(name)) continue
      if (!compressed || start + compressed > buffer.length) continue
      const raw = buffer.subarray(start, start + compressed)
      const xml = (method === 8 ? inflateRawSync(raw) : raw).toString("utf8")
      // Tags out, text in — attribute values carry content in xlsx too.
      parts.push(xml.replace(/<[^>]*>/g, " "))
    } catch { /* one unreadable entry does not spoil the file */ }
  }
  return parts.join("\n")
}

function loadList() {
  const file = path.join(ROOT, LIST)
  if (!fs.existsSync(file)) return { terms: new Set(), firstWords: new Set(), allowPaths: [] }
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"))
  return {
    terms: new Set(parsed.terms ?? []),
    firstWords: new Set(parsed.firstWords ?? []),
    // Paths reviewed and accepted — a data fixture that legitimately holds a
    // term. A path list, not an inline marker, so an exception is visible in
    // review rather than buried in the file it excuses.
    allowPaths: parsed.allowPaths ?? [],
  }
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString("utf8").split("\0").filter(Boolean)
}

function main() {
  const list = loadList()
  if (!list.terms.size) {
    console.log("redaction: no terms configured — nothing to check.")
    return 0
  }

  const failures = []
  const opaque = []
  let scanned = 0

  for (const file of trackedFiles()) {
    if (SKIP_FILE.has(file)) continue
    if (list.allowPaths.includes(file)) continue
    const ext = path.extname(file).toLowerCase()

    // The name itself, before anything about the contents.
    if (nameHits(file, list)) failures.push({ file, line: 0, where: "file name" })

    if (SKIP_EXT.has(ext)) continue
    if (OPAQUE_EXT.has(ext)) { opaque.push(file); continue }

    const full = path.join(ROOT, file)
    let stat
    try { stat = fs.statSync(full) } catch { continue }
    if (!stat.isFile()) continue
    if (stat.size > MAX_BYTES) { opaque.push(file); continue }

    let text
    try {
      if (OFFICE_EXT.has(ext)) text = officeText(fs.readFileSync(full))
      else {
        text = fs.readFileSync(full, "utf8")
        if (text.includes("\u0000")) { opaque.push(file); continue }
      }
    } catch { opaque.push(file); continue }

    scanned++
    for (const hit of findHits(text, list)) failures.push({ file, line: hit.line, where: "contents" })
  }

  if (opaque.length) {
    // Never silent: a format this cannot read is a gap in the check, and the
    // reader should know how big it is (doc 23 §4).
    console.log(`redaction: ${opaque.length} file(s) could not be read as text and were not scanned:`)
    for (const f of opaque.slice(0, 10)) console.log(`    ${f}`)
    if (opaque.length > 10) console.log(`    … and ${opaque.length - 10} more`)
  }

  if (!failures.length) {
    console.log(`redaction: ${scanned} files scanned, nothing redacted found.`)
    return 0
  }

  console.error(`\nredaction: ${failures.length} occurrence(s) of a redacted term.\n`)
  for (const f of failures) console.error(`  ${f.file}${f.line ? `:${f.line}` : ""}  (${f.where})`)
  console.error(`
These terms were removed from this repository on purpose (docs/architecture/23).
The term itself is not printed — the list holds hashes only. Open the file at
the line above; you will recognise it.

Replace it with a neutral fixture, then re-run: pnpm redaction:check
If a file legitimately needs the term, add its path to allowPaths in
${LIST}, so the exception is visible in review.
`)
  return 1
}

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
