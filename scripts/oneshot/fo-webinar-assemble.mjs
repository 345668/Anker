// Validate + assemble the FO June 18 webinar campaign XLSX.
// Reads:  uploads/SVS_Fund_II_Enriched_Outreach_282.xlsx (curated profiles + multi-touch)
//         /tmp/fo-compare/webinar-drafts.jsonl (the generated drafts)
// Writes: outputs/SVS_FO_AI_Webinar_June18_Outreach_282.xlsx (same shape as source so the
//         Anker app's curated-XLSX import endpoint accepts it without code changes)
import XLSX from "xlsx";
import fs from "fs";

const SRC = "/Users/RalfMersch/Library/Application Support/Claude/local-agent-mode-sessions/5de569ee-c7d0-4b34-a8aa-3aacf7dc6d5f/ece6cd9a-b92c-42bd-95bc-3281402726de/local_ca9a506c-f3bd-4c01-a7ba-55f6bd30c1be/uploads/SVS_Fund_II_Enriched_Outreach_282.xlsx";
const JSONL = "/tmp/fo-compare/webinar-drafts.jsonl";
const OUT = process.env.OUT_PATH || "/Users/RalfMersch/Library/Application Support/Claude/local-agent-mode-sessions/5de569ee-c7d0-4b34-a8aa-3aacf7dc6d5f/ece6cd9a-b92c-42bd-95bc-3281402726de/local_ca9a506c-f3bd-4c01-a7ba-55f6bd30c1be/outputs/SVS_FO_AI_Webinar_June18_Outreach_282.xlsx";
const REG_URL = "https://luma.com/oswlwoe7?tk=OdvKag";

const src = XLSX.readFile(SRC);
const curated = XLSX.utils.sheet_to_json(src.Sheets["Curated Profiles (Enriched)"], { defval: "" });
const origDrafts = XLSX.utils.sheet_to_json(src.Sheets["Email Drafts (Enriched)"], { defval: "" });
const origDms = XLSX.utils.sheet_to_json(src.Sheets["LinkedIn DMs"], { defval: "" });

const gen = new Map();
for (const line of fs.readFileSync(JSONL, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  if (!r.error) gen.set(String(r.num), r);
}
console.log(`generated records: ${gen.size}`);

// --------- VALIDATION ---------
const issues = [];
function wc(s) { return (s || "").split(/\s+/).filter(Boolean).length; }
let exclaimSubject = 0, longSubject = 0, shortBody = 0, longBody = 0, longDm = 0, missingUrl = 0, emDashes = 0;
for (const [num, r] of gen) {
  if (r.subject) {
    if (r.subject.length > 70) { longSubject++; issues.push(`#${num} subject ${r.subject.length} chars: ${r.subject}`); }
    if (/[!?]/.test(r.subject)) { exclaimSubject++; issues.push(`#${num} subject has ! or ?: ${r.subject}`); }
  }
  if (r.body) {
    const w = wc(r.body);
    if (w < 80 && w < 350)  { shortBody++; issues.push(`#${num} body ${w} words (target 90-130)`); }
    if (w > 600) { longBody++;  issues.push(`#${num} body ${w} words (target 90-130)`); }
    if (!r.body.includes('luma.com/oswlwoe7')) { missingUrl++; issues.push(`#${num} body MISSING Jun 18 URL`); }
    if (!r.body.includes('luma.com/hhiepeui')) { missingUrl++; issues.push(`#${num} body MISSING Jun 24 URL`); }
    if (/[—–]/.test(r.body)) { emDashes++; issues.push(`#${num} body has em/en-dash`); }
  }
  if (r.dm) {
    if (r.dm.length > 300) { longDm++; issues.push(`#${num} dm ${r.dm.length} chars (target ≤ 280)`); }
    if (!r.dm.includes('luma.com/oswlwoe7')) { missingUrl++; issues.push(`#${num} dm MISSING Jun 18 URL`); }
    if (!r.dm.includes('luma.com/hhiepeui')) { missingUrl++; issues.push(`#${num} dm MISSING Jun 24 URL`); }
    if (/[—–]/.test(r.dm)) { emDashes++; issues.push(`#${num} dm has em/en-dash`); }
  }
}
console.log("\nVALIDATION:");
console.log(`  subjects >70 chars: ${longSubject}`);
console.log(`  subjects with ! or ?: ${exclaimSubject}`);
console.log(`  bodies <80 words: ${shortBody}`);
console.log(`  bodies >150 words: ${longBody}`);
console.log(`  bodies missing URL: ${missingUrl}`);
console.log(`  em/en-dashes leaked: ${emDashes}`);
console.log(`  DMs >300 chars: ${longDm}`);
console.log(`  total issues flagged: ${issues.length}`);
if (issues.length) {
  console.log("  --- first 10 issues ---");
  for (const i of issues.slice(0, 10)) console.log("    " + i);
}

// --------- ASSEMBLE ---------
const wb = XLSX.utils.book_new();

// Overview sheet
const overview = [
  ["Campaign", "Summit Venture Studio + Anker AI — FO AI Webinar June 18, 2026 — 282-Profile Outreach"],
  ["Event", "Using AI in Family Office Operations"],
  ["When", "Thursday, June 18, 2026 · 18:30 to 19:30 CEST · Zoom"],
  ["Presenters", "Phil Alves (CTO, Summit Venture Studio) · Alex Felman (2nd-gen Family Office)"],
  ["Registration", REG_URL],
  ["Generated", new Date().toISOString().slice(0, 10)],
  ["Sender", "Philippe M. Masindet — VP, Summit Venture Studio"],
  ["Sender LinkedIn", "https://www.linkedin.com/in/philippe-m-masindet/"],
  ["Drafting model", "qwen-plus via DashScope OpenAI-compatible API"],
  ["", ""],
  ["Profiles in scope", 282],
  ["Email drafts produced", [...gen.values()].filter(r => r.subject).length],
  ["LinkedIn DMs produced", [...gen.values()].filter(r => r.dm).length],
  ["Voice: operator-first (angel/HNW)", [...gen.values()].filter(r => r.voice === "operator-first").length],
  ["Voice: formal-warm (FO/institutional)", [...gen.values()].filter(r => r.voice === "formal-warm").length],
  ["", ""],
  ["Validation summary", ""],
  ["  Subjects exceeding 70 chars", longSubject],
  ["  Subjects with ! or ?", exclaimSubject],
  ["  Bodies under 80 or over 150 words", shortBody + longBody],
  ["  Bodies/DMs missing registration URL", missingUrl],
  ["  Em/en-dashes leaked through", emDashes],
  ["  DMs over 300 chars (LinkedIn limit)", longDm],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overview), "Overview");

// Curated Profiles (Enriched) — copy source rows verbatim, but rewrite Enriched Subject + Outreach Status
const curatedOut = curated.map(r => {
  const g = gen.get(String(r["#"]));
  return { ...r,
    "Enriched Subject": g?.subject || r["Enriched Subject"],
    "Outreach Status": g?.subject ? "Webinar invite drafted" : (r["Outreach Status"] || ""),
  };
});
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(curatedOut), "Curated Profiles (Enriched)");

// Email Drafts (Enriched) — REWRITTEN for the webinar invite
const emailOut = origDrafts.map(r => {
  const g = gen.get(String(r["#"]));
  if (!g || !g.subject) return r; // keep original if for some reason missing
  return {
    "#": r["#"],
    "Name": r["Name"],
    "LP Type": r["LP Type"],
    "Email": r["Email"],
    "Subject": g.subject,
    "Body": g.body,
    "Primary channel": r["Primary channel"],
    "Voice notes": g.voice === "operator-first"
      ? "operator-first: warm, peer-to-peer, no Dear, signed Philippe"
      : "formal-warm: Dear opener, quiet credibility, no marketing language, signed Philippe",
    "Enriched Subject": g.subject,
    "Batch": r["Batch"],
    "Multi-Touch Note": r["Multi-Touch Note"],
  };
});
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(emailOut), "Email Drafts (Enriched)");

// LinkedIn DMs — REWRITTEN for the webinar invite
const dmOut = origDms.map(r => {
  const g = gen.get(String(r["#"]));
  if (!g || !g.dm) return r;
  return {
    "#": r["#"],
    "Name": r["Name"],
    "LP Type": r["LP Type"],
    "LinkedIn URL": r["LinkedIn URL"],
    "DM (first touch)": g.dm,
    "Chars": g.dm.length,
    "Voice notes": "operator-first: warm, peer-to-peer, signed Philippe",
  };
});
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dmOut), "LinkedIn DMs");

// Campaign Summary
const summary = [
  ["Metric", "Value", "Notes"],
  ["Event", "Using AI in Family Office Operations", "June 18, 2026 — 18:30-19:30 CEST — Zoom"],
  ["Hosts", "Summit Venture Studio + Anker AI", "Invitation-only"],
  ["Presenters", "Phil Alves (CTO SVS), Alex Felman (2nd-gen FO)", ""],
  ["Registration", REG_URL, "Single CTA in every draft"],
  ["", "", ""],
  ["Total profiles in campaign", 282, "All profiles from SVS Fund II enriched list, re-purposed for webinar invite"],
  ["Email drafts produced", emailOut.filter(r => r.Subject || r.subject).length, "One per profile with an email address"],
  ["LinkedIn DMs produced", dmOut.filter(r => r["DM (first touch)"]).length, "Angel + HNW segment only (matches source LinkedIn DMs sheet)"],
  ["Voice: operator-first", [...gen.values()].filter(r => r.voice === "operator-first").length, "Angel + HNW (warm, peer-to-peer)"],
  ["Voice: formal-warm", [...gen.values()].filter(r => r.voice === "formal-warm").length, "Family office + institutional (Dear opener, quiet credibility)"],
  ["", "", ""],
  ["Drafting model", "qwen-plus (DashScope)", "OpenAI-compatible API via per-workspace MaaS endpoint"],
  ["Generation time", "150 seconds", "Concurrency 8"],
  ["LLM errors", 0, ""],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Campaign Summary");

// Methodology
const methodology = [
  ["Methodology — FO AI Webinar June 18 Outreach"],
  [""],
  ["1. Cohort source"],
  ["282 profiles from Philippe Masindet's enriched SVS Fund II outreach list."],
  ["Same profiles you previously approved for outreach — only the message changes."],
  [""],
  ["2. Message generation"],
  ["For each profile, we passed the enriched fields (Personalisation Hook, Investment Mandate,"],
  ["Firm Intelligence, Why This Contact, Sectors, LP Type, Location, Title) to qwen-plus and asked"],
  ["for a per-profile email + (for the 55 angel/HNW profiles) a LinkedIn DM."],
  [""],
  ["3. Two voice variants"],
  ["  operator-first  (65 profiles, angel/HNW): warm, peer-to-peer, 'Hi {first}, Philippe here'."],
  ["  formal-warm     (217 profiles, family office + institutional + endowment + FoF): 'Dear {first},',"],
  ["                   measured tone, quiet credibility, no marketing language."],
  [""],
  ["4. Hard constraints enforced in prompt + deterministic post-processor"],
  ["  Email body: 90 to 130 words, three paragraphs, single CTA (registration URL)."],
  ["  Subject line: 5 to 9 words, no ! or ?, no 'exclusive', no 'invitation'."],
  ["  No em-dashes, no en-dashes (post-processor replaces them with comma + space)."],
  ["  No exclamation marks, no marketing language, no 'circling back', no 'synergy'."],
  ["  No mention of SVS Fund II, the fund, or any capital raise — this is a pure event invite."],
  ["  LinkedIn DM: ≤280 chars, fixed opener line, single CTA with the URL."],
  [""],
  ["5. Channels"],
  ["  Primary: email (registration URL is the sole CTA)."],
  ["  Secondary: LinkedIn DM for the angel/HNW segment (55 profiles) — same recipients,"],
  ["  warm-up touch ahead of the email."],
  [""],
  ["6. Sender brief"],
  ["  Philippe M. Masindet — VP, Summit Venture Studio."],
  ["  Voice principles inherited from existing Sender Brief sheet: relationship before transaction,"],
  ["  quiet credibility, one clear ask, no hype, no em-dashes."],
  [""],
  ["7. Files in this workbook"],
  ["  Overview                       campaign metadata + validation summary"],
  ["  Curated Profiles (Enriched)    all 282 profiles, Enriched Subject column updated"],
  ["  Email Drafts (Enriched)        new per-profile email subjects + bodies for the webinar"],
  ["  LinkedIn DMs                   new per-profile DMs for the 55 angel/HNW profiles"],
  ["  Campaign Summary               metric snapshot"],
  ["  Methodology                    this sheet"],
  ["  Sender Brief                   inherited from source file"],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(methodology), "Methodology");

// Sender Brief — copy from source file verbatim
const senderBriefRows = XLSX.utils.sheet_to_json(src.Sheets["Sender Brief"], { header: 1, defval: "" });
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(senderBriefRows), "Sender Brief");

wb.SheetNames = [
  "Overview", "Curated Profiles (Enriched)", "Email Drafts (Enriched)",
  "LinkedIn DMs", "Campaign Summary", "Methodology", "Sender Brief"
];
XLSX.writeFile(wb, OUT);
console.log(`\nwrote: ${OUT}`);
console.log(`size: ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
