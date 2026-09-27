#!/usr/bin/env node
/**
 * Rebuild the white paper's tracked build outputs from their sources.
 *
 * docs/ tracks three generated files next to the two sources that produce
 * them. There was no command to rebuild them, so they drifted: all five were
 * committed together in 7814bd8 (2026-08-21) and the PDF and DOCX were still
 * that August build on 2026-09-27, a roadmap edit later. Anyone who opened the
 * PDF read a paper that no longer matched the Markdown. This is the command.
 *
 * Run it in the same commit as any edit to a source below, so the generated
 * file never lags the prose it is made from.
 *
 *   pnpm docs:whitepaper           # all three outputs
 *   pnpm docs:whitepaper --pdf     # the two PDFs only
 *   pnpm docs:whitepaper --docx    # the DOCX only
 *
 * Needs tectonic and pandoc:  brew install tectonic pandoc
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const ROOT = process.cwd()
const DOCS = "docs"

/**
 * The main paper and the figure supplement are separate documents — the
 * supplement has its own \documentclass and is not \input by the paper — so
 * each is its own target.
 */
const TARGETS = [
  {
    kind: "pdf",
    source: `${DOCS}/anker-whitepaper.tex`,
    output: `${DOCS}/anker-whitepaper.pdf`,
  },
  {
    kind: "pdf",
    source: `${DOCS}/anker-whitepaper-figures.tex`,
    output: `${DOCS}/anker-whitepaper-figures.pdf`,
  },
  {
    kind: "docx",
    source: `${DOCS}/anker-whitepaper.md`,
    output: `${DOCS}/anker-whitepaper.docx`,
  },
]

const size = (file) => {
  try { return fs.statSync(path.join(ROOT, file)).size } catch { return 0 }
}

/**
 * Both engines stamp a build date and a random document ID, so an unchanged
 * source still produced different bytes every run — three tracked binaries
 * turning up modified in `git status` with nothing actually changed, which
 * hides the one that did change. Both honour SOURCE_DATE_EPOCH, and with it
 * set the output is byte-identical; deriving it from the source's own mtime
 * keeps the stamp roughly honest while making a no-op rebuild a true no-op.
 *
 * This holds within a working copy, which is where the noise was. It is not a
 * cross-machine guarantee: git does not preserve mtimes, so a fresh clone
 * stamps the checkout time instead. Export SOURCE_DATE_EPOCH to pin it.
 */
function sourceEpoch(source) {
  if (process.env.SOURCE_DATE_EPOCH) return process.env.SOURCE_DATE_EPOCH
  return String(Math.floor(fs.statSync(path.join(ROOT, source)).mtimeMs / 1000))
}

function have(tool) {
  try {
    execFileSync("command", ["-v", tool], { shell: "/bin/sh", stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

/**
 * tectonic resolves \includegraphics relative to the .tex, so the brand logos
 * in docs/brand-logos are found without help. It writes the .aux and friends
 * to a temporary area rather than docs/, which keeps the build out of git.
 */
function buildPdf({ source, output }) {
  execFileSync("tectonic", ["-X", "compile", source, "--outdir", path.dirname(output)], {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
    env: { ...process.env, SOURCE_DATE_EPOCH: sourceEpoch(source) },
  })
}

/**
 * -f markdown, not gfm: the paper uses $$ display math, which the gfm reader
 * passes through as literal text. Pandoc's own reader turns it into native
 * Word equations. The file this replaced was an ad-hoc python-docx dump that
 * dropped all nine equations and left "**" bold markers in the prose.
 */
function buildDocx({ source, output }) {
  execFileSync("pandoc", [source, "-f", "markdown", "-o", output], {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
    env: { ...process.env, SOURCE_DATE_EPOCH: sourceEpoch(source) },
  })
}

export function main(argv = []) {
  const only = argv.filter((a) => a === "--pdf" || a === "--docx").map((a) => a.slice(2))
  const targets = only.length ? TARGETS.filter((t) => only.includes(t.kind)) : TARGETS

  const unknown = argv.filter((a) => a.startsWith("-") && a !== "--pdf" && a !== "--docx")
  if (unknown.length) {
    console.error(`whitepaper: unknown option ${unknown[0]}\n\nusage: pnpm docs:whitepaper [--pdf] [--docx]`)
    return 2
  }

  const needed = [...new Set(targets.map((t) => (t.kind === "pdf" ? "tectonic" : "pandoc")))]
  const missing = needed.filter((tool) => !have(tool))
  if (missing.length) {
    console.error(`whitepaper: ${missing.join(" and ")} not installed.\n`)
    console.error(`  brew install ${missing.join(" ")}\n`)
    return 1
  }

  const failures = []
  for (const target of targets) {
    const before = size(target.output)
    process.stdout.write(`whitepaper: ${target.source} → ${target.output} … `)
    try {
      if (target.kind === "pdf") buildPdf(target)
      else buildDocx(target)
    } catch (err) {
      console.log("failed")
      // The engine's own diagnostics are the only useful thing here, and they
      // go to stderr; surface them rather than a wrapped exit code.
      const detail = [err.stderr, err.stdout].filter(Boolean).join("\n").trim()
      failures.push({ target, detail: detail || err.message })
      continue
    }
    const after = size(target.output)
    const delta = after - before
    const shown = before === 0 ? "new" : `${before} → ${after} bytes, ${delta >= 0 ? "+" : ""}${delta}`
    console.log(`ok (${shown})`)
  }

  if (failures.length) {
    for (const { target, detail } of failures) {
      console.error(`\nwhitepaper: ${target.source} failed to build.\n`)
      console.error(detail)
    }
    return 1
  }

  console.log(`\nwhitepaper: ${targets.length} output(s) rebuilt. Commit them with the source edit.`)
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)))
}
