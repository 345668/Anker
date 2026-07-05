// Smoke test for the new enrich_xlsx_with_llm tool.
// Uses the THIN FO AI Webinar invite list (First/Last/Firm/Email only) as
// input and checks that Qwen produces meaningful enrichment for 5 rows.
import * as fs from "node:fs";
import { FO_TOOLS } from "../../lib/assistant/tools-fo";
import * as XLSX from "xlsx";

const SRC = "/Users/RalfMersch/Library/Application Support/Claude/local-agent-mode-sessions/5de569ee-c7d0-4b34-a8aa-3aacf7dc6d5f/ece6cd9a-b92c-42bd-95bc-3281402726de/local_ca9a506c-f3bd-4c01-a7ba-55f6bd30c1be/uploads/FO AI Webinar Invite for 6-18-26.xlsx";

const xlsxBase64 = fs.readFileSync(SRC).toString("base64");
console.log(`Loaded thin XLSX: ${(fs.statSync(SRC).size / 1024).toFixed(0)} KB`);

const senderContext = "Summit Venture Studio (SVS) is a venture studio commercialising university-developed software, with 200+ university partnerships and a venture-studio-plus-fund model. We are raising Fund II from family offices and HNW LPs and want to introduce ourselves.";

console.log("\n=== running enrich_xlsx_with_llm (limit 5, concurrency 3) ===");
const res = await FO_TOOLS.enrich_xlsx_with_llm.run({
  xlsxBase64,
  senderContext,
  sheet: "Sheet1",
  limit: 5,
  concurrency: 3,
});
console.log("observation:", res.observation);
console.log("artifact:", res.artifact?.url ?? "(none)");

// Read the produced XLSX from the public/generated dir and show the enriched
// columns for a few rows.
if (res.artifact?.url) {
  // url is like /generated/Enriched_...xlsx
  const path = "public" + res.artifact.url;
  console.log(`\n=== inspecting ${path} ===`);
  const wb = XLSX.read(fs.readFileSync(path), { type: "buffer" });
  console.log("sheets:", wb.SheetNames);
  const enriched = XLSX.utils.sheet_to_json(wb.Sheets["Curated Profiles (Enriched)"], { defval: "" }) as any[];
  console.log(`rows in enriched sheet: ${enriched.length}`);
  for (let i = 0; i < Math.min(5, enriched.length); i++) {
    const r = enriched[i];
    if (!r["Name"] && !r["First Name"]) continue;
    console.log(`\n--- row ${i + 1} ---`);
    console.log(`  Name:                  ${r["Name"] || (r["First Name"] + " " + r["Last Name"])}`);
    console.log(`  Firm:                  ${r["Firm"] || r["Firm Name"] || ""}`);
    console.log(`  Why This Contact:      ${(r["Why This Contact"] || "").slice(0, 200)}`);
    console.log(`  Firm Intelligence:     ${(r["Firm Intelligence"] || "").slice(0, 200)}`);
    console.log(`  Investment Mandate:    ${(r["Investment Mandate"] || "").slice(0, 200)}`);
    console.log(`  Personalisation Hook:  ${(r["Personalisation Hook"] || "").slice(0, 200)}`);
  }
}
