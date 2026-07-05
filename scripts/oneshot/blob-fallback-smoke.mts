import * as fs from "node:fs";
import { FO_TOOLS } from "../../lib/assistant/tools-fo";
const SRC = "/Users/RalfMersch/Library/Application Support/Claude/local-agent-mode-sessions/5de569ee-c7d0-4b34-a8aa-3aacf7dc6d5f/ece6cd9a-b92c-42bd-95bc-3281402726de/local_ca9a506c-f3bd-4c01-a7ba-55f6bd30c1be/uploads/SVS_Fund_II_Enriched_Outreach_282.xlsx";
const res = await FO_TOOLS.apply_template_to_outreach_drafts.run({
  xlsxBase64: fs.readFileSync(SRC).toString("base64"),
  subject: "Blob fallback smoke test",
  emailTemplate: "{firstName},\nTest.\n\nPhilippe\n{senderSignature}",
  dmTemplate: "Hi {firstName}, test https://luma.com/oswlwoe7",
  senderSignature: "Philippe",
  registrationUrls: ["https://luma.com/oswlwoe7"],
  campaignTitle: "blob smoke",
});
console.log("env: BLOB_READ_WRITE_TOKEN=", process.env.BLOB_READ_WRITE_TOKEN ? "(set)" : "(unset)");
console.log("env: VERCEL=", process.env.VERCEL || "(unset)");
console.log("observation:", res.observation);
console.log("url:", res.artifact?.url);
// Verify the file actually exists at the returned URL path (local).
if (res.artifact?.url?.startsWith("/generated/")) {
  const local = "public" + res.artifact.url;
  console.log("local path exists:", fs.existsSync(local), "size:", fs.statSync(local).size, "bytes");
}
