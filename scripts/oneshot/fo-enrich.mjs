// FO webinar-invite enrichment importer.
// Usage:
//   node fo-enrich.mjs              # dry-run against NEON_DSN
//   node fo-enrich.mjs --apply      # write to NEON_DSN
//   DSN=$LOCAL_DSN node fo-enrich.mjs --apply  # write to a different DB
// Reads SVS_Fund2_FO_Webinar_Invite_List_TRIMMED.xlsx (sheet: Ranked Master)
// and  FO AI Webinar Invite for 6-18-26.xlsx          (sheet: Sheet1)
// Insert-only-new. Match firms by normalized name → website domain. Match
// investors by lower(email), with (first, last, firm) fallback for blank emails.
import XLSX from "xlsx";
import pg from "pg";
import { randomUUID } from "crypto";

const APPLY = process.argv.includes("--apply");
const DSN = process.env.DSN || process.env.NEON_DSN;
if (!DSN) { console.error("No DSN set (use NEON_DSN or DSN env)."); process.exit(1); }
const DSN_LABEL = process.env.DSN_LABEL || (DSN.includes("neon") ? "NEON" : "LOCAL");

const UPLOADS = "/Users/RalfMersch/Library/Application Support/Claude/local-agent-mode-sessions/5de569ee-c7d0-4b34-a8aa-3aacf7dc6d5f/ece6cd9a-b92c-42bd-95bc-3281402726de/local_ca9a506c-f3bd-4c01-a7ba-55f6bd30c1be/uploads";
const SVS_PATH  = `${UPLOADS}/SVS_Fund2_FO_Webinar_Invite_List_TRIMMED.xlsx`;
const FOAI_PATH = `${UPLOADS}/FO AI Webinar Invite for 6-18-26.xlsx`;
const SVS_SOURCE  = "svs_fund2_fo_webinar_invite";
const FOAI_SOURCE = "fo_ai_webinar_2026_06_18";

// -------- normalization helpers --------
const STOP = /\b(family|office|capital|partners?|holdings?|management|advisors?|group|llc|inc|ltd|llp|limited|corp|company|co|gmbh|sarl|ag|sa|the|of|and|fund|ventures?|investments?|investment|mfo|sfo|fo|wealth)\b/gi;
function normFirm(s) {
  if (!s) return "";
  return String(s).toLowerCase()
    .replace(/[\-_\/.,'"`(){}\[\]!?]/g, " ").replace(/&/g, " ")
    .replace(STOP, " ").replace(/\s+/g, " ").trim();
}
function emailDomain(e) {
  if (!e) return "";
  const at = String(e).indexOf("@");
  return at >= 0 ? String(e).slice(at + 1).toLowerCase().trim() : "";
}
function siteDomain(u) {
  if (!u) return "";
  return String(u).toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].trim();
}
function clean(s) { return s == null ? "" : String(s).trim(); }
function low(s)   { return clean(s).toLowerCase(); }

const GENERIC_FIRMS = new Set([
  "", "private family office", "single family office",
  "private multi family office (mfo)", "private multi-family office",
  "multi family office", "single-family office", "self employed", "self-employed",
  "private mfo", "private sfo", "n/a", "na", "none", "-", "—",
]);
function isGenericFirm(name) {
  return GENERIC_FIRMS.has(low(name));
}

// -------- parse uploads --------
function parseSvs() {
  const wb = XLSX.readFile(SVS_PATH);
  const ws = wb.Sheets["Ranked Master"];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const out = [];
  for (const r of rows) {
    const firstName = clean(r["First Name"]);
    const lastName  = clean(r["Last Name"]);
    const firmName  = clean(r["Firm Name"]);
    const email     = low(r["Email"]);
    if (!firstName && !lastName) continue;
    if (isGenericFirm(firmName)) continue;
    out.push({
      source: SVS_SOURCE,
      firstName, lastName, email,
      title: clean(r["Title"]),
      firmName,
      firmWebsite: clean(r["Website"]),
      linkedin_url: clean(r["LinkedIn"]),
      location: clean(r["Location"]),
      industry: clean(r["Industry"]),
      companyType: clean(r["Company Type"]),
      // SVS scoring blob → metadata.svs_fund2_fo_webinar_invite
      scoring: {
        rank: r["Rank"] || null, tier: r["Tier"] || null, score: r["Score"] || null,
        role_fit_35: r["Role Fit /35"] || null,
        entity_25:   r["Entity /25"] || null,
        thesis_15:   r["Thesis /15"] || null,
        capital_10:  r["Capital /10"] || null,
        reach_10:    r["Reach /10"] || null,
        geo_5:       r["Geo /5"] || null,
        svs_thesis_match: clean(r["SVS Thesis Match"]) || null,
        linkedin_connection: clean(r["LinkedIn Connection"]) || null,
        source_list: clean(r["Source List"]) || null,
        source_status: clean(r["Source Status"]) || null,
        email_check: clean(r["Email Check"]) || null,
        segment: clean(r["Segment"]) || null,
      },
    });
  }
  return out;
}
function parseFoAi() {
  const wb = XLSX.readFile(FOAI_PATH);
  const ws = wb.Sheets["Sheet1"];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const out = [];
  for (const r of rows) {
    const firstName = clean(r["First Name"]);
    const lastName  = clean(r["Last Name"]);
    const firmName  = clean(r["Firm"]);
    const email     = low(r["Email"]);
    if (!firstName && !lastName) continue;
    if (isGenericFirm(firmName)) continue;
    out.push({
      source: FOAI_SOURCE,
      firstName, lastName, email,
      title: "", firmName, firmWebsite: "",
      linkedin_url: "", location: "", industry: "", companyType: "",
      scoring: {
        email_confidence: clean(r["Email Confidence"]) || null,
        subject: clean(r["Subject"]) || null,
        template_excerpt: (clean(r["Template"]) || "").slice(0, 200) || null,
      },
    });
  }
  return out;
}

// -------- merge across files (same email or same name+firm) --------
function mergeAcrossFiles(svs, foai) {
  // Use email as primary key; fall back to firstName|lastName|firmName_normalized
  const keyOf = c => c.email
    ? `e:${c.email}`
    : `n:${low(c.firstName)}|${low(c.lastName)}|${normFirm(c.firmName)}`;
  const merged = new Map();
  for (const c of [...svs, ...foai]) {
    const k = keyOf(c);
    if (!merged.has(k)) { merged.set(k, { ...c, sources: [c.source], metadata: { [c.source]: c.scoring } }); continue; }
    const cur = merged.get(k);
    // Prefer non-blank fields from later entries; remember every source.
    if (!cur.sources.includes(c.source)) cur.sources.push(c.source);
    cur.metadata[c.source] = c.scoring;
    for (const f of ["firstName","lastName","email","title","firmName","firmWebsite","linkedin_url","location","industry","companyType"]) {
      if (!cur[f] && c[f]) cur[f] = c[f];
    }
  }
  return [...merged.values()];
}

// -------- DB-side --------
const { Client } = pg;
const cli = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await cli.connect();

console.log(`\n=== ${DSN_LABEL} — fo-enrich (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

// Ensure investors.metadata JSONB exists. Idempotent.
await cli.query(`alter table investors        add column if not exists metadata jsonb default '{}'::jsonb`);
await cli.query(`alter table investment_firms add column if not exists metadata jsonb default '{}'::jsonb`);
console.log("schema: ensured metadata JSONB on investors + investment_firms");

// Load existing firms (id, name normalized, website domain, lowered name) into memory.
const firmRows = await cli.query(`select id, name, website from investment_firms`);
const firmByNorm = new Map();
const firmByDomain = new Map();
for (const r of firmRows.rows) {
  const n = normFirm(r.name);
  if (n && !firmByNorm.has(n)) firmByNorm.set(n, r.id);
  const d = siteDomain(r.website);
  if (d && !firmByDomain.has(d)) firmByDomain.set(d, r.id);
}
console.log(`existing firms loaded: ${firmRows.rowCount}`);

// Load existing investors keyed by lower(email) AND by (lower(first)|lower(last)|firm_id).
const invRows = await cli.query(`select id, lower(email) as email_l, lower(first_name) as fn, lower(last_name) as ln, firm_id from investors`);
const invByEmail = new Map();
const invByFio   = new Map();
for (const r of invRows.rows) {
  if (r.email_l) invByEmail.set(r.email_l, r.id);
  const k = `${r.fn}|${r.ln}|${r.firm_id || ""}`;
  if (!invByFio.has(k)) invByFio.set(k, r.id);
}
console.log(`existing investors loaded: ${invRows.rowCount}`);

// -------- parse + merge --------
const svsRows  = parseSvs();
const foaiRows = parseFoAi();
const merged   = mergeAcrossFiles(svsRows, foaiRows);
console.log(`\nupload rows: SVS Ranked Master ${svsRows.length}, FO AI Sheet1 ${foaiRows.length}, merged ${merged.length}`);

// Plan: resolve each contact to (firm_id existing|to-create) and (skip|insert).
const firmsToCreate = new Map(); // key=normFirm, value={name, website, etc.}
const peopleToInsert = [];
let skipMatchedEmail = 0;
let skipMatchedNameFirm = 0;

for (const c of merged) {
  // Resolve firm
  const nrm = normFirm(c.firmName);
  const dom = siteDomain(c.firmWebsite) || emailDomain(c.email);
  let firmId = firmByNorm.get(nrm) || (dom ? firmByDomain.get(dom) : null) || null;
  if (!firmId && nrm) {
    // queue for creation if we haven't already
    if (!firmsToCreate.has(nrm)) {
      firmsToCreate.set(nrm, {
        name: c.firmName,
        website: c.firmWebsite || (dom ? `https://${dom}` : ""),
        location: c.location || "",
        industry: c.industry || "",
        type: c.companyType || "",
      });
    }
  }
  // Resolve person
  let existingPersonId = null;
  if (c.email && invByEmail.has(c.email)) {
    existingPersonId = invByEmail.get(c.email);
    skipMatchedEmail++;
    continue;
  }
  // Name+firm fallback only useful if firm is already known (or will be created)
  if (!c.email) {
    const targetFirmId = firmId || (nrm && firmsToCreate.has(nrm) ? `NEW:${nrm}` : "");
    const k = `${low(c.firstName)}|${low(c.lastName)}|${targetFirmId}`;
    if (invByFio.has(k)) { skipMatchedNameFirm++; continue; }
  }
  peopleToInsert.push({ contact: c, firmId, firmNormKey: nrm });
}

console.log(`\n--- plan ---`);
console.log(`merged unique contacts:           ${merged.length}`);
console.log(`already in DB (email match):      ${skipMatchedEmail}`);
console.log(`already in DB (name+firm match):  ${skipMatchedNameFirm}`);
console.log(`new firms to create:              ${firmsToCreate.size}`);
console.log(`new investors to insert:          ${peopleToInsert.length}`);
console.log(`  - with email:                   ${peopleToInsert.filter(p => p.contact.email).length}`);
console.log(`  - without email:                ${peopleToInsert.filter(p => !p.contact.email).length}`);

if (!APPLY) {
  console.log("\nDRY-RUN. Re-run with --apply to write.");
  await cli.end(); process.exit(0);
}

// -------- APPLY --------
const insertedFirmIds = [];
const insertedInvestorIds = [];
await cli.query("begin");
try {
  for (const [nrm, f] of firmsToCreate) {
    const id = randomUUID();
    await cli.query(
      `insert into investment_firms
         (id, name, website, type, location, hq_location, industry, source, created_at, updated_at, metadata)
       values ($1,$2,$3,$4,$5,$5,$6,$7, now(), now(), $8::jsonb)`,
      [id, f.name, f.website || null, f.type || null, f.location || null, f.industry || null,
       SVS_SOURCE + "+" + FOAI_SOURCE,
       JSON.stringify({ imported_from: "fo-webinar-uploads-2026-06-11" })]
    );
    firmByNorm.set(nrm, id);
    insertedFirmIds.push(id);
  }
  for (const p of peopleToInsert) {
    const c = p.contact;
    const firmId = p.firmId || firmByNorm.get(p.firmNormKey) || null;
    const id = randomUUID();
    await cli.query(
      `insert into investors
         (id, firm_id, first_name, last_name, email, title, linkedin_url, person_linkedin_url,
          location, hq_location, source, investor_type, is_active, status,
          created_at, updated_at, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$7,$8,$8,$9,$10, true,'active',
               now(), now(), $11::jsonb)`,
      [id, firmId, c.firstName || "(unknown)", c.lastName || null,
       c.email || null, c.title || null, c.linkedin_url || null,
       c.location || null, c.sources.join("+"),
       c.industry?.toLowerCase().includes("family") ? "family_office" : null,
       JSON.stringify(c.metadata)]
    );
    insertedInvestorIds.push(id);
  }
  await cli.query("commit");
} catch (e) {
  await cli.query("rollback");
  console.error("ROLLBACK:", e.message);
  await cli.end(); process.exit(1);
}

console.log(`\n=== APPLIED on ${DSN_LABEL} ===`);
console.log(`firms inserted:     ${insertedFirmIds.length}`);
console.log(`investors inserted: ${insertedInvestorIds.length}`);
// Print first 5 inserted ids for spot-check
console.log("sample new firm ids:    ", insertedFirmIds.slice(0, 5));
console.log("sample new investor ids:", insertedInvestorIds.slice(0, 5));

// Persist the inserted IDs for the audit XLSX step
const fs = await import("fs");
const auditPath = `/tmp/fo-compare/inserted-ids-${DSN_LABEL}.json`;
fs.writeFileSync(auditPath, JSON.stringify({
  dsn_label: DSN_LABEL, when: new Date().toISOString(),
  firmIds: insertedFirmIds, investorIds: insertedInvestorIds,
}, null, 2));
console.log("audit ids written to:", auditPath);

await cli.end();
