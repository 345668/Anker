#!/usr/bin/env node
/**
 * SVS Fund II — Campaign CLI Runner
 *
 * Usage:
 *   npx tsx scripts/run-svs-campaign.mts [input-csv-path]
 *
 * Defaults:
 *   Input:   data/investors_import.csv
 *   Output:  reports/svs-campaign-<timestamp>.xlsx
 *            reports/svs-campaign-<timestamp>.html
 *
 * Requires:
 *   ANTHROPIC_API_KEY in env (or .env.local)
 *
 * Example:
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/run-svs-campaign.mts
 *   npx tsx scripts/run-svs-campaign.mts data/my-lp-list.csv
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Load .env.local if present (mirrors Next.js behaviour)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const envPath = path.join(ROOT, ".env.local")
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^"|"$/g, "")
    if (!process.env[key]) process.env[key] = val
  }
}

import {
  runCampaign,
  parseInputCSV,
  type InputProfile,
} from "../lib/outreach/svs-campaign.js"
import { buildXlsx } from "../lib/outreach/xlsx-export.js"
import { buildHtmlReview } from "../lib/outreach/html-review.js"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[${ts}] ${msg}`)
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/:/g, "-").replace("T", "_")
}

/** Build sample profiles for demo/testing when no CSV is provided */
function sampleProfiles(): InputProfile[] {
  return [
    {
      id: 1,
      name: "Sarah Chen",
      role: "Managing Partner",
      firm: "Horizon Family Office",
      email: "s.chen@horizonfo.com",
      lpType: "family-office",
      location: "San Francisco, CA",
      sectors: ["AI", "FinTech", "Health Tech"],
    },
    {
      id: 2,
      name: "James Okafor",
      role: "Investment Director",
      firm: "Horizon Family Office",
      email: "j.okafor@horizonfo.com",
      lpType: "family-office",
      location: "San Francisco, CA",
      sectors: ["AI", "B2B SaaS"],
    },
    {
      id: 3,
      name: "Mark Rivera",
      role: "Angel Investor",
      firm: "Independent",
      email: "mark@markriveraangel.com",
      lpType: "angel",
      location: "New York, NY",
      sectors: ["FinTech", "Consumer"],
    },
    {
      id: 4,
      name: "Dr. Amira Hassan",
      role: "Head of Alternatives",
      firm: "Nordic Endowment Fund",
      email: "a.hassan@nordicef.org",
      lpType: "endowment",
      location: "Stockholm, Sweden",
      sectors: ["Climate Tech", "Health Tech", "AI"],
    },
    {
      id: 5,
      name: "Wei Zhang",
      role: "Director, Technology Investments",
      firm: "Singapore GIC",
      email: "w.zhang@gic.com.sg",
      lpType: "sovereign",
      location: "Singapore",
      sectors: ["AI", "B2B SaaS", "FinTech"],
    },
  ]
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── Guard ──────────────────────────────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "❌  ANTHROPIC_API_KEY is not set.\n" +
        "    Set it in .env.local or pass it inline:\n" +
        "    ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/run-svs-campaign.mts"
    )
    process.exit(1)
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  const inputArg = process.argv[2]
  let profiles: InputProfile[]

  if (inputArg) {
    const csvPath = path.resolve(inputArg)
    if (!fs.existsSync(csvPath)) {
      console.error(`❌  Input file not found: ${csvPath}`)
      process.exit(1)
    }
    log(`Reading profiles from ${csvPath}`)
    const csv = fs.readFileSync(csvPath, "utf8")
    profiles = parseInputCSV(csv)
    log(`Parsed ${profiles.length} profiles from CSV`)
  } else {
    const defaultCsv = path.join(ROOT, "data", "investors_import.csv")
    if (fs.existsSync(defaultCsv)) {
      log(`No input arg — using ${defaultCsv}`)
      const csv = fs.readFileSync(defaultCsv, "utf8")
      profiles = parseInputCSV(csv)
      // Cap at 30 for demo runs to keep costs reasonable
      if (profiles.length > 30) {
        log(`Capping to first 30 profiles (full run: pass the CSV explicitly)`)
        profiles = profiles.slice(0, 30)
      }
      log(`Parsed ${profiles.length} profiles`)
    } else {
      log("No input CSV found — using 5 sample profiles for demo")
      profiles = sampleProfiles()
    }
  }

  if (profiles.length === 0) {
    console.error("❌  No profiles to process. Check your CSV format.")
    process.exit(1)
  }

  // ── Run pipeline ───────────────────────────────────────────────────────────
  log(`Starting SVS campaign pipeline for ${profiles.length} profiles…`)
  log(`Batch size: 10 · Estimated batches: ${Math.ceil(profiles.length / 10)}`)
  log(`Estimated time: ~${Math.ceil(profiles.length / 10) * 15}s (API latency varies)`)
  log("")

  const bar = {
    done: 0,
    total: profiles.length,
    tick(name: string) {
      this.done++
      const pct = Math.round((this.done / this.total) * 100)
      const filled = Math.round(pct / 4)
      const gauge = "█".repeat(filled) + "░".repeat(25 - filled)
      process.stdout.write(
        `\r  [${gauge}] ${pct}% (${this.done}/${this.total}) — ${name.slice(0, 24).padEnd(24)}`
      )
    },
  }

  const result = await runCampaign(profiles, (done, total, name) => {
    bar.tick(name)
  })

  process.stdout.write("\n")
  log("")
  log("✅  Enrichment complete")
  log(`   Total:         ${result.stats.total}`)
  log(`   Multi-touch:   ${result.stats.multiTouchPairs}`)
  log(`   Avg fit score: ${result.stats.avgFitScore}`)
  log(`   LP types:      ${JSON.stringify(result.stats.byLPType)}`)
  log("")

  // ── Export ─────────────────────────────────────────────────────────────────
  const reportsDir = path.join(ROOT, "reports")
  ensureDir(reportsDir)
  const ts = timestamp()

  // Excel
  log("Building Excel workbook…")
  const xlsxBuf = buildXlsx(result)
  const xlsxPath = path.join(reportsDir, `svs-campaign-${ts}.xlsx`)
  fs.writeFileSync(xlsxPath, xlsxBuf)
  log(`✅  Excel saved → ${path.relative(ROOT, xlsxPath)}`)

  // HTML
  log("Building HTML review UI…")
  const html = buildHtmlReview(result)
  const htmlPath = path.join(reportsDir, `svs-campaign-${ts}.html`)
  fs.writeFileSync(htmlPath, html, "utf8")
  log(`✅  HTML saved  → ${path.relative(ROOT, htmlPath)}`)

  log("")
  log("🎯  Campaign outputs ready:")
  log(`    ${xlsxPath}`)
  log(`    ${htmlPath}`)
}

main().catch((err) => {
  console.error("\n❌  Campaign run failed:", err)
  process.exit(1)
})
