// Smoke test for the new crawl integration on enrich_xlsx_with_llm.
// Runs against 5 rows from the Philippe Outreach List with crawl: true and
// prints the new crawl-derived columns side-by-side with the LLM output so
// we can verify Qwen is actually anchoring on the crawled corpus.
import * as fs from "node:fs";
import { FO_TOOLS } from "../../lib/assistant/tools-fo";
import * as XLSX from "xlsx";

const SRC = "/Users/RalfMersch/Library/Application Support/Claude/local-agent-mode-sessions/5de569ee-c7d0-4b34-a8aa-3aacf7dc6d5f/ece6cd9a-b92c-42bd-95bc-3281402726de/local_ca9a506c-f3bd-4c01-a7ba-55f6bd30c1be/uploads/Philippe Outreach List — 282 Not Yet Contacted.xlsx";
const xlsxBase64 = fs.readFileSync(SRC).toString("base64");

const SENDER_CONTEXT = "Summit Venture Studio (SVS) is a venture studio commercialising university-developed software. Raising Fund II from family offices and HNW LPs.";

console.log(`Loaded XLSX (${(fs.statSync(SRC).size / 1024).toFixed(0)} KB)`);
console.log("running enrich_xlsx_with_llm with crawl=true, limit=5");

const startTs = Date.now();
const res = await FO_TOOLS.enrich_xlsx_with_llm.run({
  xlsxBase64,
  senderContext: SENDER_CONTEXT,
  limit: 5,
  concurrency: 3,
  crawl: true,
  crawlMaxPages: 3,
  crawlConcurrency: 4,
});
console.log(`\nelapsed ${((Date.now()-startTs)/1000).toFixed(1)}s`);
console.log("observation:", res.observation);
console.log("artifact:", res.artifact?.url);

if (res.artifact?.url) {
  const path = "public" + res.artifact.url;
  const wb = XLSX.read(fs.readFileSync(path), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Curated Profiles (Enriched)"], { defval: "" }) as any[];
  console.log(`\nenriched rows: ${rows.length}, showing first 5\n`);
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const r = rows[i];
    console.log(`--- ${r.Name || r["First Name"] + " " + r["Last Name"]} ---`);
    console.log(`  Inferred Website:     ${r["Inferred Website"] || "(none)"}`);
    console.log(`  Crawl Status:         ${r["Crawl Status"] || "(n/a)"}`);
    console.log(`  Website Title:        ${(r["Website Title"] || "").slice(0, 120)}`);
    console.log(`  Investment Focus:     ${(r["Investment Focus (extracted)"] || "").slice(0, 220)}`);
    console.log(`  Crawl Paths Tried:    ${r["Crawl Paths Tried"] || "(none)"}`);
    console.log(`  Other Emails on Site: ${r["Other Emails on Site"] || "(none)"}`);
    console.log(`  Firm Intelligence:    ${(r["Firm Intelligence"] || "").slice(0, 220)}`);
    console.log(`  Personalisation Hook: ${(r["Personalisation Hook"] || "").slice(0, 220)}`);
    console.log("");
  }
}
