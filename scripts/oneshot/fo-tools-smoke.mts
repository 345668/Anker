// End-to-end smoke test for the 4 new FO assistant tools.
// Loads the real uploaded XLSX, calls each tool's run() with the marker
// already resolved (skipping the agent layer). Skips destructive operations.
//
// Requires: DASHSCOPE_API_KEY, QWEN_WORKSPACE_ID, NEON_DATABASE_URL in .env.local.
import * as fs from "node:fs";
import { FO_TOOLS } from "../../lib/assistant/tools-fo";

const SRC = "/Users/RalfMersch/Library/Application Support/Claude/local-agent-mode-sessions/5de569ee-c7d0-4b34-a8aa-3aacf7dc6d5f/ece6cd9a-b92c-42bd-95bc-3281402726de/local_ca9a506c-f3bd-4c01-a7ba-55f6bd30c1be/uploads/SVS_Fund_II_Enriched_Outreach_282.xlsx";
const xlsxBase64 = fs.readFileSync(SRC).toString("base64");
console.log(`Loaded XLSX: ${(fs.statSync(SRC).size / 1024).toFixed(0)} KB`);
console.log(`FO_TOOLS registered: ${Object.keys(FO_TOOLS).join(", ")}`);

function header(s: string) { console.log(`\n${"=".repeat(72)}\n${s}\n${"=".repeat(72)}`); }
function trim(s: string, n = 300) { return s.length > n ? s.slice(0, n) + " ..." : s; }

// ── 1. db_gap_analysis — read-only, safe to run against Neon ────────────────
header("TEST 1: db_gap_analysis (firmType = family-office, limit = 200)");
try {
  const res = await FO_TOOLS.db_gap_analysis.run({ xlsxBase64, firmType: "family-office", limit: 200 });
  console.log("observation:", trim(res.observation));
  console.log("artifact:", res.artifact?.url ?? "(none)");
} catch (e: any) {
  console.error("FAIL:", e?.message);
}

// ── 2. apply_template_to_outreach_drafts — deterministic, full pass ─────────
header("TEST 2: apply_template_to_outreach_drafts (full 282 profiles)");
try {
  const emailTpl = `{firstName},

Quick update, and two invitations.

We are now three and a half years into the official SVS investment period.

1. Using AI in Family Office Operations - Thursday, June 18 at 10:30 AM MT. Register: https://luma.com/oswlwoe7
2. SVS Digital Health Pitch Day - Wednesday, June 24. Register: https://luma.com/hhiepeui

Thanks,
{senderSignature}`;
  const dmTpl = `Hi {firstName}, Philippe here, VP at Summit Venture Studio. Two June invites: Jun 18 AI in FO Ops https://luma.com/oswlwoe7 and Jun 24 SVS Digital Health Pitch Day https://luma.com/hhiepeui. Hope to see you. Philippe, Anker AI`;
  const sig = "Philippe M Masindet\nFounder, Anker AI\nBerlin, Germany";
  const res = await FO_TOOLS.apply_template_to_outreach_drafts.run({
    xlsxBase64,
    subject: "Update and two June invitations",
    emailTemplate: emailTpl,
    dmTemplate: dmTpl,
    senderSignature: sig,
    registrationUrls: ["https://luma.com/oswlwoe7", "https://luma.com/hhiepeui"],
    campaignTitle: "Smoke test - two-event template",
  });
  console.log("observation:", trim(res.observation));
  console.log("artifact:", res.artifact?.url ?? "(none)");
} catch (e: any) {
  console.error("FAIL:", e?.message);
}

// ── 3. generate_event_outreach_drafts — LLM, limit=3 to keep it cheap ───────
header("TEST 3: generate_event_outreach_drafts (limit = 3, Qwen via DashScope)");
try {
  const res = await FO_TOOLS.generate_event_outreach_drafts.run({
    xlsxBase64,
    event: {
      title: "Using AI in Family Office Operations",
      when: "Thursday, June 18 at 10:30 AM MT",
      presenters: "Phil Alves (CTO SVS), Alex Felman (2nd-gen FO)",
      registrationUrl: "https://luma.com/oswlwoe7",
    },
    sender: { name: "Philippe", role: "VP, Summit Venture Studio" },
    limit: 3,
    concurrency: 3,
  });
  console.log("observation:", trim(res.observation));
  console.log("artifact:", res.artifact?.url ?? "(none)");
} catch (e: any) {
  console.error("FAIL:", e?.message);
}

// ── 4. enrich_db_from_xlsx — skipped intentionally ─────────────────────────
header("TEST 4: enrich_db_from_xlsx (SKIPPED - would duplicate prior import)");
console.log("Logic verified by the earlier fo-enrich.mjs run (+452 firms, +561 investors on Neon).");
console.log("The tool wrapper just calls the same insert-only-new path via lib/db's sql template.");
