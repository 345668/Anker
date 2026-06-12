// Build a verification XLSX of every row inserted by fo-enrich.mjs.
import pg from "pg";
import XLSX from "xlsx";
const OUT = process.env.OUT_PATH || "/tmp/fo-compare/FO_Enrichment_Inserted_Rows.xlsx";
const cli = new pg.Client({ connectionString: process.env.NEON_DSN, ssl: { rejectUnauthorized: false }});
await cli.connect();
const firms = (await cli.query(`
  select id, name, website, type, hq_location, industry, source, created_at
  from investment_firms
  where source = 'svs_fund2_fo_webinar_invite+fo_ai_webinar_2026_06_18'
  order by name`)).rows;
const investors = (await cli.query(`
  select i.id, i.first_name, i.last_name, i.email, i.title, i.linkedin_url,
         i.location, i.source, i.created_at, f.name as firm_name, f.website as firm_website,
         i.metadata
  from investors i
  left join investment_firms f on f.id = i.firm_id
  where i.source like '%svs_fund2_fo_webinar%' or i.source like '%fo_ai_webinar_2026_06_18%'
  order by i.source, lower(coalesce(f.name, '')), lower(i.last_name), lower(i.first_name)`)).rows;
const wb = XLSX.utils.book_new();

// Summary
const summary = [
  ["FO Webinar-Invite Enrichment — verification of inserted rows", ""],
  ["Target database", "Neon"],
  ["Run at (server now)", new Date().toISOString().slice(0, 19) + "Z"],
  ["Source uploads", "SVS_Fund2_FO_Webinar_Invite_List_TRIMMED.xlsx + FO AI Webinar Invite for 6-18-26.xlsx"],
  ["Source tag (firms)", "svs_fund2_fo_webinar_invite+fo_ai_webinar_2026_06_18"],
  ["Source tag (investors, SVS)", "svs_fund2_fo_webinar_invite"],
  ["Source tag (investors, FO AI)", "fo_ai_webinar_2026_06_18"],
  ["Source tag (investors, merged across both)", "svs_fund2_fo_webinar_invite+fo_ai_webinar_2026_06_18"],
  ["", ""],
  ["Firms inserted", firms.length],
  ["Investors inserted (total)", investors.length],
  ["  - investors with email", investors.filter(r => r.email).length],
  ["  - investors with no email", investors.filter(r => !r.email).length],
  ["  - investors with LinkedIn URL", investors.filter(r => r.linkedin_url).length],
  ["  - investors with SVS scoring blob", investors.filter(r => r.metadata && r.metadata.svs_fund2_fo_webinar_invite).length],
  ["  - investors with FO AI email-confidence blob", investors.filter(r => r.metadata && r.metadata.fo_ai_webinar_2026_06_18).length],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");

XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(firms.map(r => ({
  "Firm ID": r.id, "Firm Name": r.name, "Website": r.website || "",
  "Type": r.type || "", "HQ Location": r.hq_location || "",
  "Industry": r.industry || "", "Source": r.source, "Created": r.created_at,
}))), "Firms Inserted");

XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(investors.map(r => ({
  "Investor ID": r.id, "First Name": r.first_name, "Last Name": r.last_name,
  "Email": r.email || "", "Title": r.title || "",
  "Firm": r.firm_name || "", "Firm Website": r.firm_website || "",
  "LinkedIn": r.linkedin_url || "", "Location": r.location || "",
  "Source": r.source,
  "SVS Tier": r.metadata?.svs_fund2_fo_webinar_invite?.tier || "",
  "SVS Score": r.metadata?.svs_fund2_fo_webinar_invite?.score || "",
  "SVS Rank": r.metadata?.svs_fund2_fo_webinar_invite?.rank || "",
  "SVS Thesis Match": r.metadata?.svs_fund2_fo_webinar_invite?.svs_thesis_match || "",
  "FO AI Email Confidence": r.metadata?.fo_ai_webinar_2026_06_18?.email_confidence || "",
  "Created": r.created_at,
}))), "Investors Inserted");

wb.SheetNames = ["Summary", "Firms Inserted", "Investors Inserted"];
XLSX.writeFile(wb, OUT);
console.log("wrote:", OUT, "(firms:", firms.length, "investors:", investors.length, ")");
await cli.end();
