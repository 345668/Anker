// Build /tmp/fo-compare/webinar-drafts.jsonl from scratch, using the source
// SVS_Fund_II_Enriched_Outreach_282.xlsx and the SVS managing partner's two-event
// template. No LLM calls.
import XLSX from "xlsx";
import fs from "fs";
import path from "path";

const SRC = "/Users/RalfMersch/Library/Application Support/Claude/local-agent-mode-sessions/5de569ee-c7d0-4b34-a8aa-3aacf7dc6d5f/ece6cd9a-b92c-42bd-95bc-3281402726de/local_ca9a506c-f3bd-4c01-a7ba-55f6bd30c1be/uploads/SVS_Fund_II_Enriched_Outreach_282.xlsx";
const STATE = "/tmp/fo-compare/webinar-drafts.jsonl";
const URL_AI = "https://luma.com/oswlwoe7";
const URL_PITCH = "https://luma.com/hhiepeui";
const SUBJECT = "Update and two June invitations";

fs.mkdirSync(path.dirname(STATE), { recursive: true });

function firstNameOf(fullName) {
  const cleaned = String(fullName || "")
    .replace(/\s+(MBA|MD|PhD|Ph\.?D\.?|CFA|CPA|JD|Esq\.?|Jr|Sr|II|III|IV)\.?(\s|,|$)/gi, " ")
    .replace(/\s+(Founder|Owner|CEO|CFO|CIO|COO|CTO|President|Principal|Chairman|Director|Managing Director|Investor|Trustee|Partner|Senior Managing Director|Chief Investment Officer|Investment Research Manager|Investment Manager)\b/gi, "")
    .replace(/\s+/g, " ").trim();
  const tok = cleaned.split(" ")[0] || "there";
  if (/^(college|capital|group|family|office|trust|wealth|fund|advisors?|holdings?|university|endowment|partners?|enterprises?|the)$/i.test(tok)) return "there";
  return tok;
}
function buildEmail(firstName) {
  return [
    `${firstName},`, ``,
    `Quick update, and two invitations.`, ``,
    `We are now three and a half years into the official SVS investment period, and the model is doing what we built it to do. Our active companies are generating revenue and starting to leave the SVS nest, heading toward exit or independent scaling. This is the part we have been working toward since day one, and it is energizing to watch it happen.`, ``,
    `I'd love to invite you to two events we are hosting this month (both via Zoom):`, ``,
    `1. Using AI in Family Office Operations - Thursday, June 18 at 10:30 AM MT.`, ``,
    `Practical ways family offices can apply AI across due diligence, deal tracking, portfolio tracking, and daily operations. This session is prompted by some of our LPs asking our approach to AI and how to use it in your investing operations.`, ``,
    `Register: ${URL_AI}`, ``,
    `2. SVS Digital Health Pitch Day - Wednesday, June 24 at 11:00 AM MT.`, ``,
    `Three of our healthcare companies will pitch, each with an open round.`, ``,
    `Register: ${URL_PITCH}`, ``,
    `A few things worth knowing about these three rounds before Pitch Day:`, ``,
    `- Each company already has committed or closed investment in these rounds.`,
    `- The capital being raised lets management increase their ownership by investing into their own companies. That is exactly the alignment we want as these teams drive toward exit.`,
    `- Given the push toward exit, these may be the last rounds these companies raise. If you want additional exposure to them, this is likely the window.`, ``,
    `The three presenting companies are Salus, Losai Health, and Posognos (FKA RedFlag).`, ``,
    `You are welcome to register for both of the sessions mentioned above and we hope to see you there.`, ``,
    `Thanks,`, ``,
    `Philippe M Masindet`, `Founder, Anker AI`, `Berlin, Germany`, ``,
    `Vice President, Investor Relations`, `Summit Venture Studios`,
    `https://www.summitventurestudio.com/`, `Utah, USA`, ``,
    `linkedin.com/in/philippe-m-masindet`, `Tel: +49 174 681 3185`, ``,
    `CONFIDENTIALITY NOTICE: This message is intended only for the use of the individual or entity to which it is addressed and may contain information that is legally privileged and confidential. If the reader of this message is not the intended recipient, you are hereby notified that any dissemination, distribution or copying of this communication is strictly prohibited. If you have received this message in error, please immediately notify us by telephone and return the original message to us. Thank you for your cooperation in this regard.`,
  ].join("\n");
}
function buildDm(firstName) {
  return `Hi ${firstName}, Philippe here, VP at Summit Venture Studio. Two June invites: Jun 18 AI in Family Office Ops ${URL_AI} and Jun 24 SVS Digital Health Pitch Day ${URL_PITCH}. Hope to see you. Philippe, Anker AI`;
}
function isAngelOrHnw(lpType, tags) {
  const t = ((lpType || "") + " " + (tags || "")).toLowerCase();
  return t.includes("angel") || t.includes("hnw") || /\boperator\b/.test(t);
}

const wb = XLSX.readFile(SRC);
const curated = XLSX.utils.sheet_to_json(wb.Sheets["Curated Profiles (Enriched)"], { defval: "" });
const origDms = XLSX.utils.sheet_to_json(wb.Sheets["LinkedIn DMs"], { defval: "" });
const dmNums = new Set(origDms.map(r => String(r["#"])));

const out = [];
let maxDm = 0, longestDmName = "";
for (const r of curated) {
  const num = String(r["#"]);
  const fn = firstNameOf(r["Name"]);
  const hasDm = dmNums.has(num);
  const rec = {
    num, name: r["Name"], generated_at: new Date().toISOString(),
    voice: isAngelOrHnw(r["LP Type"], r["Tags"]) ? "operator-first" : "formal-warm",
    email_recipient: r["Email"] || "",
    linkedin_url: r["LinkedIn"] || "",
    primary_channel: hasDm ? "linkedin" : "email",
    subject: SUBJECT,
    body: buildEmail(fn),
  };
  if (hasDm) {
    rec.dm = buildDm(fn);
    if (rec.dm.length > maxDm) { maxDm = rec.dm.length; longestDmName = fn; }
  }
  out.push(JSON.stringify(rec));
}
fs.writeFileSync(STATE, out.join("\n") + "\n");

console.log(`records written:   ${out.length}`);
console.log(`with DMs:          ${out.filter(l => JSON.parse(l).dm).length}`);
console.log(`longest DM:        ${maxDm} chars (first name "${longestDmName}")`);
console.log(`sample email body: ${buildEmail("Anne").length} chars, ${buildEmail("Anne").split(/\s+/).filter(Boolean).length} words`);
