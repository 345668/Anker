import * as fs from "node:fs";
import { FO_TOOLS } from "../../lib/assistant/tools-fo";

const ENRICHED = "public/generated/Enriched_Summit_Venture_Studio_SVS_is_a_venture_s_e26b941e.xlsx";
const xlsxBase64 = fs.readFileSync(ENRICHED).toString("base64");
console.log(`Loaded enriched XLSX (${(fs.statSync(ENRICHED).size / 1024).toFixed(0)} KB)`);

console.log("running generate_event_outreach_drafts with TWO URLs + DM auto-detect");
const startTs = Date.now();
const res = await FO_TOOLS.generate_event_outreach_drafts.run({
  xlsxBase64,
  event: {
    title: "Two June invitations: AI in Family Office Operations + SVS Digital Health Pitch Day",
    when: "Thursday June 18 at 10:30 AM MT (AI in FO Ops, 60 min Zoom) and Wednesday June 24 at 11:00 AM MT (SVS Pitch Day, 60 min Zoom)",
    presenters: "Phil Alves (CTO, Summit Venture Studio) and Alex Felman (2nd-gen Family Office) for the Jun 18 webinar; Salus, Losai Health, and Posognos (FKA RedFlag) presenting at the Jun 24 Pitch Day",
    registrationUrl: "https://luma.com/oswlwoe7",
    secondaryUrl: "https://luma.com/hhiepeui",
    extra: "Pitch Day note: each presenting company has committed or closed investment, and these may be the last rounds before exit.",
  },
  sender: {
    name: "Philippe",
    role: "VP, Summit Venture Studio",
    signatureBlock: "Philippe M Masindet\nFounder, Anker AI\nBerlin, Germany\n\nVice President, Investor Relations\nSummit Venture Studios\nhttps://www.summitventurestudio.com/\nUtah, USA\n\nlinkedin.com/in/philippe-m-masindet\nTel: +49 174 681 3185",
  },
  limit: 300,
  concurrency: 8,
});
console.log(`done in ${((Date.now()-startTs)/1000).toFixed(0)}s. ${res.observation}`);
fs.writeFileSync("/tmp/fo-compare/redraft-state.json", JSON.stringify({
  url: res.artifact?.url, observation: res.observation, at: new Date().toISOString(),
}, null, 2));
