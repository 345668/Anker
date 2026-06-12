import XLSX from "xlsx";
import pg from "pg";

const DSN = process.env.NEON_DSN;
const UPLOADS = [
  "/Users/RalfMersch/Library/Application Support/Claude/local-agent-mode-sessions/5de569ee-c7d0-4b34-a8aa-3aacf7dc6d5f/ece6cd9a-b92c-42bd-95bc-3281402726de/local_ca9a506c-f3bd-4c01-a7ba-55f6bd30c1be/uploads/SVS_Fund2_FO_Webinar_Invite_List_TRIMMED.xlsx",
  "/Users/RalfMersch/Library/Application Support/Claude/local-agent-mode-sessions/5de569ee-c7d0-4b34-a8aa-3aacf7dc6d5f/ece6cd9a-b92c-42bd-95bc-3281402726de/local_ca9a506c-f3bd-4c01-a7ba-55f6bd30c1be/uploads/FO AI Webinar Invite for 6-18-26.xlsx",
];

const STOP = /\b(family|office|capital|partners?|holdings?|management|advisors?|group|llc|inc|ltd|llp|limited|corp|company|co|gmbh|sarl|ag|sa|the|of|and|fund|ventures?|investments?|investment|mfo|sfo|fo|wealth)\b/gi;
function normFirm(s) {
  if (!s) return "";
  return String(s).toLowerCase()
    .replace(/[\-_\/.,'"`(){}\[\]!?]/g, " ")
    .replace(/&/g, " ")
    .replace(STOP, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function emailDomain(e) {
  if (!e) return "";
  const at = String(e).indexOf("@");
  return at >= 0 ? e.slice(at + 1).toLowerCase().trim() : "";
}
function normPerson(first, last) {
  return `${String(first || "").trim().toLowerCase()} ${String(last || "").trim().toLowerCase()}`.trim();
}

const uploadFirmNames = new Set();
const uploadFirmRaw = new Map();
const uploadDomains = new Set();
const uploadPersons = new Set();

for (const p of UPLOADS) {
  const wb = XLSX.readFile(p);
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
    for (const r of rows) {
      const firm = r["Firm Name"] || r["Firm"] || r["Company"] || r["Account"];
      const email = r["Email"];
      const first = r["First Name"];
      const last = r["Last Name"];
      if (firm) {
        const n = normFirm(firm);
        if (n) {
          uploadFirmNames.add(n);
          if (!uploadFirmRaw.has(n)) uploadFirmRaw.set(n, firm);
        }
      }
      const d = emailDomain(email);
      if (d) uploadDomains.add(d);
      if (first || last) uploadPersons.add(normPerson(first, last));
    }
  }
}
for (const junk of ["", "private", "private multi", "single", "multi"]) uploadFirmNames.delete(junk);

console.log(JSON.stringify({
  upload_firm_norm: uploadFirmNames.size,
  upload_domains: uploadDomains.size,
  upload_persons: uploadPersons.size,
}));

const { Client } = pg;
const cli = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await cli.connect();

const sql = `
with fo_firms as (
  select f.id, f.name, f.type, f.website, f.hq_location, f.location, f.aum,
         f.source as firm_source, f.linkedin_url as firm_linkedin,
         f.industry, f.description
    from investment_firms f
    where f.type ilike '%family%'
       or f.name ilike '%family office%'
       or f.name ilike '%family-office%'
)
select
  f.name as firm_name, f.website as firm_website, f.hq_location, f.location as firm_location,
  f.aum, f.type as firm_type, f.firm_source, f.firm_linkedin, f.industry, f.description,
  i.id as investor_id, i.first_name, i.last_name, i.title, i.email, i.phone,
  i.linkedin_url, i.person_linkedin_url, i.location as investor_location,
  i.investor_type, i.source as investor_source
from fo_firms f
left join investors i on i.firm_id = f.id
order by lower(f.name), i.last_name, i.first_name
`;
const dbRows = (await cli.query(sql)).rows;
await cli.end();
console.log("db_rows:", dbRows.length);

const byFirm = new Map();
for (const r of dbRows) {
  const key = r.firm_name || "";
  if (!byFirm.has(key)) byFirm.set(key, { firm: r, contacts: [] });
  if (r.investor_id) byFirm.get(key).contacts.push(r);
}

function firmCovered(firmName, group) {
  const n = normFirm(firmName);
  if (n && uploadFirmNames.has(n)) return "firm-name match";
  const site = group.firm.firm_website || "";
  const siteDomain = site
    ? site.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase()
    : "";
  if (siteDomain && uploadDomains.has(siteDomain)) return "firm-website-domain match";
  for (const c of group.contacts) {
    const d = emailDomain(c.email);
    if (d && uploadDomains.has(d)) return "contact-email-domain match";
  }
  return null;
}

const missing = [];
const matched = [];
for (const [firmName, group] of byFirm) {
  if (!firmName) continue;
  const reason = firmCovered(firmName, group);
  if (reason) matched.push({ firm: firmName, reason });
  else missing.push(group);
}

console.log("firms_total:", byFirm.size, "matched:", matched.length, "missing:", missing.length);

const wb = XLSX.utils.book_new();

const missingFirmRows = missing.map(g => {
  const f = g.firm;
  const c = g.contacts.find(c => c.email && c.email.includes("@")) || g.contacts[0] || {};
  const contactName = [c.first_name, c.last_name].filter(Boolean).join(" ") || "";
  return {
    "Firm Name": f.firm_name || "",
    "Firm Type": f.firm_type || "",
    "Website": f.firm_website || "",
    "HQ Location": f.hq_location || f.firm_location || "",
    "AUM": f.aum || "",
    "Industry": f.industry || "",
    "LinkedIn (firm)": f.firm_linkedin || "",
    "Description": (f.description || "").slice(0, 400),
    "Source": f.firm_source || "",
    "Total contacts in DB": g.contacts.length,
    "Primary contact": contactName,
    "Primary title": c.title || "",
    "Primary email": c.email || "",
    "Primary phone": c.phone || "",
    "Primary LinkedIn": c.person_linkedin_url || c.linkedin_url || "",
    "Primary location": c.investor_location || "",
  };
});
missingFirmRows.sort((a, b) => {
  const ae = a["Primary email"] ? 0 : 1, be = b["Primary email"] ? 0 : 1;
  if (ae !== be) return ae - be;
  return (a["Firm Name"] || "").localeCompare(b["Firm Name"] || "");
});
const ws1 = XLSX.utils.json_to_sheet(missingFirmRows);
XLSX.utils.book_append_sheet(wb, ws1, "Missing FOs");

const missingContactRows = [];
for (const g of missing) {
  if (g.contacts.length === 0) {
    missingContactRows.push({
      "Firm Name": g.firm.firm_name,
      "First Name": "", "Last Name": "", "Title": "",
      "Email": "", "Phone": "", "LinkedIn": "",
      "Location": "", "Investor Type": "",
      "Firm Website": g.firm.firm_website || "",
      "Firm Source": g.firm.firm_source || "",
    });
  } else {
    for (const c of g.contacts) {
      missingContactRows.push({
        "Firm Name": g.firm.firm_name,
        "First Name": c.first_name || "",
        "Last Name": c.last_name || "",
        "Title": c.title || "",
        "Email": c.email || "",
        "Phone": c.phone || "",
        "LinkedIn": c.person_linkedin_url || c.linkedin_url || "",
        "Location": c.investor_location || "",
        "Investor Type": c.investor_type || "",
        "Firm Website": g.firm.firm_website || "",
        "Firm Source": g.firm.firm_source || c.investor_source || "",
      });
    }
  }
}
const ws2 = XLSX.utils.json_to_sheet(missingContactRows);
XLSX.utils.book_append_sheet(wb, ws2, "Missing FO Contacts");

const matchedRows = matched.map(m => ({ "Firm Name": m.firm, "Match reason": m.reason }));
const ws3 = XLSX.utils.json_to_sheet(matchedRows);
XLSX.utils.book_append_sheet(wb, ws3, "Already in Uploads");

const summaryRows = [
  ["Family Office gap analysis - Database vs. uploaded invite lists", ""],
  ["Generated", new Date().toISOString().slice(0, 10)],
  ["", ""],
  ["UPLOADED INVITE LISTS", ""],
  ["File: SVS_Fund2_FO_Webinar_Invite_List_TRIMMED.xlsx", ""],
  ["File: FO AI Webinar Invite for 6-18-26.xlsx", ""],
  ["Distinct upload firm names (normalised)", uploadFirmNames.size],
  ["Distinct upload email domains", uploadDomains.size],
  ["Distinct people in uploads", uploadPersons.size],
  ["", ""],
  ["DATABASE FAMILY OFFICES (Neon)", ""],
  ["Total FO firms in DB", byFirm.size],
  ["FO firms with at least one contact in DB", missing.filter(g => g.contacts.length).length + matched.length],
  ["", ""],
  ["MATCHING", ""],
  ["DB FO firms already covered by uploads", matched.length],
  ["DB FO firms NOT in uploads (the gap)", missing.length],
  ["  - of which with at least one email contact", missing.filter(g => g.contacts.some(c => c.email)).length],
  ["  - of which with NO contact at all", missing.filter(g => g.contacts.length === 0).length],
  ["Total missing FO contacts (rows in 'Missing FO Contacts' sheet)", missingContactRows.length],
];
const ws4 = XLSX.utils.aoa_to_sheet(summaryRows);
XLSX.utils.book_append_sheet(wb, ws4, "Summary");

const order = ["Summary", "Missing FOs", "Missing FO Contacts", "Already in Uploads"];
wb.SheetNames = order;

const OUT = process.env.OUT_PATH || "/tmp/fo-compare/FO_Database_Gap_vs_Webinar_Invites.xlsx";
XLSX.writeFile(wb, OUT);
console.log("wrote:", OUT);
