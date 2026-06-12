// End-to-end assistant chain on the new Philippe Outreach List:
//   enrich_xlsx_with_llm    -> 282 enriched rows (Personalisation Hook etc)
//   generate_event_outreach_drafts  -> 282 emails + DMs from the enriched set
// Output: two XLSX artifacts in public/generated/ (URLs logged).
import * as fs from "node:fs";
import { FO_TOOLS } from "../../lib/assistant/tools-fo";

const SRC = "/Users/RalfMersch/Library/Application Support/Claude/local-agent-mode-sessions/5de569ee-c7d0-4b34-a8aa-3aacf7dc6d5f/ece6cd9a-b92c-42bd-95bc-3281402726de/local_ca9a506c-f3bd-4c01-a7ba-55f6bd30c1be/uploads/Philippe Outreach List — 282 Not Yet Contacted.xlsx";
const STATE = "/tmp/fo-compare/chain-state.json";

const startTs = Date.now();
const elapsed = () => `${((Date.now() - startTs) / 1000).toFixed(0)}s`;
const write = (msg: string) => { console.log(`[${elapsed()}] ${msg}`); fs.appendFileSync("/tmp/fo-compare/chain-log.txt", `[${elapsed()}] ${msg}\n`); };
fs.mkdirSync("/tmp/fo-compare", { recursive: true });
fs.writeFileSync("/tmp/fo-compare/chain-log.txt", "");

const xlsxBase64 = fs.readFileSync(SRC).toString("base64");
write(`loaded thin XLSX (${(fs.statSync(SRC).size / 1024).toFixed(0)} KB)`);

// --- step 1: enrich ---
const SENDER_CONTEXT = "Summit Venture Studio (SVS) is a venture-studio-plus-fund commercialising university-developed software. 200+ university partnerships, ~1000 opportunities screened/month via proprietary AI triage, each company led by a proven industry CEO, ~90% formation ownership and ~3-year exit timeline. Raising Fund II from family offices, HNW LPs and endowments. We are inviting curated investors to two June 2026 events: (1) Using AI in Family Office Operations webinar (Jun 18); (2) SVS Digital Health Pitch Day (Jun 24).";

write("step 1/2: enrich_xlsx_with_llm (282 rows, concurrency 8)");
const enrichRes = await FO_TOOLS.enrich_xlsx_with_llm.run({
  xlsxBase64,
  senderContext: SENDER_CONTEXT,
  limit: 300,
  concurrency: 8,
});
write(`enrich done. ${enrichRes.observation.slice(0, 200)}`);
write(`enrich artifact: ${enrichRes.artifact?.url}`);
if (!enrichRes.artifact) { write("FAIL: no enrich artifact"); process.exit(1); }

// --- step 2: feed enriched output into draft generator ---
const enrichedPath = "public" + enrichRes.artifact.url;
const enrichedBase64 = fs.readFileSync(enrichedPath).toString("base64");
write(`re-attached enriched XLSX (${(fs.statSync(enrichedPath).size / 1024).toFixed(0)} KB) for step 2`);

write("step 2/2: generate_event_outreach_drafts (282 emails, concurrency 8)");
const draftRes = await FO_TOOLS.generate_event_outreach_drafts.run({
  xlsxBase64: enrichedBase64,
  event: {
    title: "Using AI in Family Office Operations + SVS Digital Health Pitch Day",
    when: "Thu Jun 18 (AI in FO Ops, 10:30 AM MT) and Wed Jun 24 (SVS Pitch Day, 11:00 AM MT)",
    presenters: "Phil Alves (CTO SVS), Alex Felman (2nd-gen FO)",
    registrationUrl: "https://luma.com/oswlwoe7",
    extra: "Second event: SVS Digital Health Pitch Day registration https://luma.com/hhiepeui. Mention both events in the body.",
  },
  sender: {
    name: "Philippe",
    role: "VP, Summit Venture Studio",
    signatureBlock: "Philippe M Masindet\nFounder, Anker AI\nBerlin, Germany\n\nVice President, Investor Relations\nSummit Venture Studios\nhttps://www.summitventurestudio.com/\nUtah, USA\n\nlinkedin.com/in/philippe-m-masindet\nTel: +49 174 681 3185",
  },
  limit: 300,
  concurrency: 8,
});
write(`draft done. ${draftRes.observation.slice(0, 200)}`);
write(`draft artifact: ${draftRes.artifact?.url}`);

fs.writeFileSync(STATE, JSON.stringify({
  enrichUrl: enrichRes.artifact?.url,
  draftUrl: draftRes.artifact?.url,
  enrichObservation: enrichRes.observation,
  draftObservation: draftRes.observation,
  finishedAt: new Date().toISOString(),
}, null, 2));
write("DONE.");
