#!/usr/bin/env node
/**
 * Settle the conflicts an investor-data drop reported (docs/architecture/24 §2, addendum).
 *
 *   node scripts/resolve-import-conflicts.mjs <conflicts.json>            # dry run
 *   node scripts/resolve-import-conflicts.mjs --apply <conflicts.json>    # writes
 *
 * A "conflict" is a field where the directory already had a value and the sheet said something else. Most
 * are not disagreements at all ("New York, NY" and "New York, United States" are one place), a few are the
 * sheet's mistake (a person's LinkedIn profile in a firm's LinkedIn column), and a few are the directory's
 * own placeholders ("View LinkedIn Profile", "US" as a website, a LinkedIn search URL). Those are decided
 * here by rule. What is left is a real difference of opinion, and it stays as it is for a person to settle.
 *
 * Every change keeps the old value in metadata.conflict_resolutions, so it can be put back, and is applied
 * only if the field still holds the value the report saw.
 */
import { createRequire } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

const require = createRequire(import.meta.url)

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()

// ─── places ─────────────────────────────────────────────────────────────────

const US_STATE_LIST = ["alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming", "district of columbia"]
const US_CODES = new Set("al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy dc".split(" "))

/** The country a trailing place word names: "ca" and "california" are the US, "uk" is the UK. */
function countryOf(tail) {
  const t = norm(tail)
  if (!t) return null
  if (/^(us|usa|u s a|u s|united states|united states of america|america)$/.test(t)) return "us"
  if (US_CODES.has(t) || US_STATE_LIST.includes(t)) return "us"
  if (/^(uk|u k|united kingdom|great britain|gb|england|scotland|wales)$/.test(t)) return "uk"
  if (/^(uae|united arab emirates)$/.test(t)) return "uae"
  return t
}

/** "San Francisco, CA" → { city: "san francisco", country: "us" }; "United States" → { city: null, country: "us" }. */
export function placeOf(value) {
  const parts = String(value ?? "").split(",").map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return { city: null, country: null }
  const last = countryOf(parts[parts.length - 1])
  if (parts.length === 1) {
    const only = countryOf(parts[0])
    const isCountry = only === "us" || only === "uk" || only === "uae" || /^(germany|france|spain|italy|canada|india|china|japan|brazil|singapore|sweden|norway|denmark|finland|poland|netherlands|switzerland|australia|ireland|israel|mexico)$/.test(only ?? "")
    return isCountry ? { city: null, country: only } : { city: norm(parts[0]), country: null }
  }
  return { city: norm(parts[0]), country: last }
}

// ─── urls ───────────────────────────────────────────────────────────────────

export function hostOf(url) {
  const raw = String(url ?? "").trim()
  if (!raw || /\s/.test(raw)) return null
  try {
    const host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./i, "").toLowerCase()
    return host.includes(".") ? host : null
  } catch { return null }
}

/** A LinkedIn address read as { kind: "company" | "person" | "search" | "other", slug }. */
export function linkedinKind(url) {
  const raw = String(url ?? "").trim().toLowerCase()
  if (!/linkedin\.com/.test(raw)) return { kind: "other", slug: null }
  if (/linkedin\.com\/search\//.test(raw)) return { kind: "search", slug: null }
  const m = raw.match(/linkedin\.com\/(company|in|pub|school|showcase)\/([^/?#\s]+)/)
  if (!m) return { kind: "other", slug: null }
  return { kind: m[1] === "in" || m[1] === "pub" ? "person" : "company", slug: decodeURIComponent(m[2]) }
}
const compact = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
const cleanLinkedin = (url) => {
  const k = linkedinKind(url)
  return k.slug && (k.kind === "company" || k.kind === "person") ? `https://www.linkedin.com/${k.kind === "company" ? "company" : "in"}/${k.slug}/` : null
}

// ─── placeholders the directory holds instead of a value ────────────────────

const PLACEHOLDER = /^(view linkedin profile|n\/?a|none|unknown|-|—|tbd|us|usa|uk)$/i
const isPlaceholder = (column, value) => {
  const v = String(value ?? "").trim()
  if (!v) return true
  if (column === "website") return PLACEHOLDER.test(v) || !hostOf(v)
  if (column === "linkedin_url") return PLACEHOLDER.test(v) || !/linkedin\.com/i.test(v)
  return PLACEHOLDER.test(v)
}

// ─── the rules ──────────────────────────────────────────────────────────────

/**
 * What to do with one conflicting field.
 *   { action: "same" }                      the two values say the same thing; nothing to do
 *   { action: "apply", value, rule }        the directory's value is a placeholder, worse, or the sheet is clearly better
 *   { action: "ignore", rule }              the sheet's value is wrong for this field; never applied
 *   { action: "review", rule }              a real disagreement; left as it is
 */
export function resolveConflict(kind, column, existing, incoming) {
  const ex = String(existing ?? "").trim(), inc = String(incoming ?? "").trim()
  if (!inc) return { action: "same" }
  if (ex.toLowerCase() === inc.toLowerCase()) return { action: "same" }

  if (column === "hq_location" || column === "location") {
    const a = placeOf(ex), b = placeOf(inc)
    if (a.city && b.city && a.city === b.city && (!a.country || !b.country || a.country === b.country)) return { action: "same" }
    // The directory knows only the country; the sheet names a city in that same country.
    if (!a.city && a.country && b.city && b.country === a.country) return { action: "apply", value: inc, rule: "location: country → city in that country" }
    return { action: "review", rule: "location: different place" }
  }

  if (column === "website") {
    const a = hostOf(ex), b = hostOf(inc)
    if (isPlaceholder(column, ex) && b) return { action: "apply", value: inc, rule: "website: placeholder replaced" }
    if (a && b && a === b) {
      // Same site; the stored address carries a tracking tail or a fragment, so store the clean one.
      if (/[#?]/.test(ex)) return { action: "apply", value: /^https?:/i.test(inc) ? inc : `https://${inc}`, rule: "website: tracking tail removed" }
      return { action: "same" }
    }
    return { action: "review", rule: "website: different site" }
  }

  if (column === "linkedin_url" || column === "person_linkedin_url") {
    const a = linkedinKind(ex), b = linkedinKind(inc)
    if (kind === "firm") {
      if (b.kind === "person") return { action: "ignore", rule: "linkedin: a person's profile is not the firm's page" }
      if (b.kind === "company" && (a.kind === "search" || a.kind === "other" || isPlaceholder(column, ex))) {
        const url = cleanLinkedin(inc)
        return url ? { action: "apply", value: url, rule: "linkedin: placeholder replaced by the company page" } : { action: "review", rule: "linkedin: unreadable" }
      }
      if (a.kind === "company" && b.kind === "company" && compact(a.slug).replace(/vc$|capital$/, "") === compact(b.slug).replace(/vc$|capital$/, "")) return { action: "same" }
      return { action: "review", rule: "linkedin: different page" }
    }
    // a person
    if (b.kind === "person" && (a.kind !== "person" || isPlaceholder(column, ex))) {
      const url = cleanLinkedin(inc)
      return url ? { action: "apply", value: url, rule: "linkedin: a company page or placeholder replaced by the person's profile" } : { action: "review", rule: "linkedin: unreadable" }
    }
    if (a.kind === "person" && b.kind === "person" && compact(a.slug).replace(/\d+$/, "") === compact(b.slug).replace(/\d+$/, "")) return { action: "same" }
    return { action: "review", rule: "linkedin: different profile" }
  }

  if (column === "type" || column === "investor_type") {
    // Only an uninformative stored class gives way; a sheet's class never overrides a real one.
    if (/^(private|other|investor|unknown|n\/?a|-)$/i.test(ex)) return { action: "apply", value: inc, rule: `${column}: uninformative class replaced` }
    return { action: "review", rule: `${column}: different class` }
  }

  if (column === "aum") return { action: "review", rule: "aum: different estimate" }
  if (column === "title") return { action: "review", rule: "title: different role" }
  if (column === "email") return { action: "review", rule: "email: different address" }
  return { action: "review", rule: `${column}: different value` }
}

// ─── running it ─────────────────────────────────────────────────────────────

const TABLE = { firm: "investment_firms", person: "investors" }

async function main() {
  const args = process.argv.slice(2)
  const APPLY = args.includes("--apply")
  const file = args.find((a) => !a.startsWith("--"))
  if (!file) throw new Error("give the conflicts .json the import wrote")
  const records = JSON.parse(fs.readFileSync(file, "utf8"))
  const DB = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
  if (!DB) throw new Error("set NEON_DATABASE_URL")
  const { neon } = require("@neondatabase/serverless")
  const sql = neon(DB)
  const at = new Date().toISOString()

  const tally = {}, review = [], planned = []
  for (const rec of records) {
    for (const c of rec.conflicts) {
      const r = resolveConflict(rec.kind, c.column, c.existing, c.incoming)
      const key = `${r.action}${r.rule ? ` · ${r.rule}` : ""}`
      tally[key] = (tally[key] ?? 0) + 1
      if (r.action === "apply") planned.push({ rec, c, r })
      if (r.action === "review") review.push({ kind: rec.kind, id: rec.id, name: rec.name, file: rec.file, column: c.column, existing: c.existing, incoming: c.incoming, why: r.rule })
    }
  }

  let applied = 0, stale = 0
  if (APPLY) {
    for (const { rec, c, r } of planned) {
      const table = TABLE[rec.kind]
      const entry = JSON.stringify([{ column: c.column, was: c.existing, now: r.value, rule: r.rule, at }])
      // Only if the field still holds what the report saw, and keep the old value in the record.
      const rows = await sql.query(
        `UPDATE ${table} SET ${c.column} = $2, updated_at = now(),
                metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{conflict_resolutions}',
                                     coalesce(metadata->'conflict_resolutions', '[]'::jsonb) || $4::jsonb)
          WHERE id = $1 AND ${c.column} = $3 RETURNING id`,
        [rec.id, r.value, c.existing, entry])
      if (rows.length) applied++; else stale++
    }
  }

  console.log(`\n${APPLY ? "APPLIED" : "DRY RUN — nothing was written"}\n`)
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(5)}  ${k}`)
  console.log(`\nchanges ${planned.length}${APPLY ? `  (written ${applied}, field had changed since ${stale})` : ""}   left for review ${review.length}`)

  const out = path.join(os.homedir(), "Downloads", `import-conflicts-for-review-${at.slice(0, 10)}.csv`)
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`
  fs.writeFileSync(out, ["kind,name,column,directory_has,sheet_says,why,file,id", ...review.map((x) => [x.kind, x.name, x.column, x.existing, x.incoming, x.why, x.file, x.id].map(esc).join(","))].join("\n"))
  console.log(`review list: ${out}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main().catch((e) => { console.error("failed:", e.message); process.exit(1) })
