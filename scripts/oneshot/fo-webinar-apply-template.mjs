// Apply the SVS managing partner's two-event template to every email + DM.
// Overwrites subject + body + dm in /tmp/fo-compare/webinar-drafts.jsonl
// while preserving all other fields (name, email, voice, etc.).
//
// Events:
//   1. Using AI in Family Office Operations — Thursday, June 18 at 10:30 AM MT
//      Luma:  https://luma.com/oswlwoe7
//   2. SVS Digital Health Pitch Day — Wednesday, June 24 at 11:00 AM MT
//      Luma:  https://luma.com/hhiepeui
//
// Note: 10:30 AM MT (MDT in June, UTC-6) = 16:30 UTC = 18:30 CEST, which
//       matches the original Luma webinar card time, so the time is correct.
import fs from "fs";

const STATE = "/tmp/fo-compare/webinar-drafts.jsonl";
const URL_AI    = "https://luma.com/oswlwoe7";
const URL_PITCH = "https://luma.com/hhiepeui";
const SUBJECT   = "Update and two June invitations";

function firstNameOf(fullName) {
  // Strip titles/suffixes the source data sometimes embeds in the Name field.
  const cleaned = String(fullName || "")
    .replace(/\s+(MBA|MD|PhD|Ph\.?D\.?|CFA|CPA|JD|Esq|Esq\.|Jr|Sr|II|III|IV)\.?(\s|,|$)/gi, " ")
    .replace(/\s+(Founder|Owner|CEO|CFO|CIO|COO|CTO|President|Principal|Chairman|Director|Managing Director|Investor|Trustee|Partner|Senior Managing Director|Chief Investment Officer|Investment Research Manager)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const tok = cleaned.split(" ")[0] || "there";
  // If first token looks like a firm name (institutional row), fall back to "there".
  if (/college|capital|group|family|office|trust|wealth|fund|advisors?|holdings?|university|endowment|partners?|enterprises?/i.test(tok)) return "there";
  return tok;
}

function buildEmail(firstName) {
  return [
    `${firstName},`,
    ``,
    `Quick update, and two invitations.`,
    ``,
    `We are now three and a half years into the official SVS investment period, and the model is doing what we built it to do. Our active companies are generating revenue and starting to leave the SVS nest, heading toward exit or independent scaling. This is the part we have been working toward since day one, and it is energizing to watch it happen.`,
    ``,
    `I'd love to invite you to two events we are hosting this month (both via Zoom):`,
    ``,
    `1. Using AI in Family Office Operations - Thursday, June 18 at 10:30 AM MT.`,
    ``,
    `Practical ways family offices can apply AI across due diligence, deal tracking, portfolio tracking, and daily operations. This session is prompted by some of our LPs asking our approach to AI and how to use it in your investing operations.`,
    ``,
    `Register: ${URL_AI}`,
    ``,
    `2. SVS Digital Health Pitch Day - Wednesday, June 24 at 11:00 AM MT.`,
    ``,
    `Three of our healthcare companies will pitch, each with an open round.`,
    ``,
    `Register: ${URL_PITCH}`,
    ``,
    `A few things worth knowing about these three rounds before Pitch Day:`,
    ``,
    `- Each company already has committed or closed investment in these rounds.`,
    `- The capital being raised lets management increase their ownership by investing into their own companies. That is exactly the alignment we want as these teams drive toward exit.`,
    `- Given the push toward exit, these may be the last rounds these companies raise. If you want additional exposure to them, this is likely the window.`,
    ``,
    `The three presenting companies are Salus, Losai Health, and Posognos (FKA RedFlag).`,
    ``,
    `You are welcome to register for both of the sessions mentioned above and we hope to see you there.`,
    ``,
    `Thanks,`,
    ``,
    `Philippe M Masindet`,
    `Founder, Anker AI`,
    `Berlin, Germany`,
    ``,
    `Vice President, Investor Relations`,
    `Summit Venture Studios`,
    `https://www.summitventurestudio.com/`,
    `Utah, USA`,
    ``,
    `linkedin.com/in/philippe-m-masindet`,
    `Tel: +49 174 681 3185`,
    ``,
    `CONFIDENTIALITY NOTICE: This message is intended only for the use of the individual or entity to which it is addressed and may contain information that is legally privileged and confidential. If the reader of this message is not the intended recipient, you are hereby notified that any dissemination, distribution or copying of this communication is strictly prohibited. If you have received this message in error, please immediately notify us by telephone and return the original message to us. Thank you for your cooperation in this regard.`,
  ].join("\n");
}

function buildDm(firstName) {
  // Two-event DM within LinkedIn's 300-char connection-request limit.
  // Trimmed format keeps both URLs intact (51 chars) + opener + sign-off.
  return `Hi ${firstName}, Philippe here, VP at Summit Venture Studio. Two June invites: Jun 18 AI in Family Office Ops ${URL_AI} and Jun 24 SVS Digital Health Pitch Day ${URL_PITCH}. Hope to see you. Philippe, Anker AI`;
}

// --------- run ---------
const lines = fs.readFileSync(STATE, "utf8").split("\n").filter(Boolean);
const out = [];
let emailsRewritten = 0, dmsRewritten = 0, dmsOver = 0;
let maxDm = 0, longestDmName = "";

for (const line of lines) {
  const r = JSON.parse(line);
  const fn = firstNameOf(r.name);
  if (r.subject !== undefined) {
    r.subject = SUBJECT;
    r.body = buildEmail(fn);
    emailsRewritten++;
  }
  if (r.dm !== undefined) {
    r.dm = buildDm(fn);
    dmsRewritten++;
    if (r.dm.length > 300) dmsOver++;
    if (r.dm.length > maxDm) { maxDm = r.dm.length; longestDmName = fn; }
  }
  out.push(JSON.stringify(r));
}
fs.writeFileSync(STATE, out.join("\n") + "\n");

console.log(`emails rewritten:  ${emailsRewritten}`);
console.log(`DMs rewritten:     ${dmsRewritten}`);
console.log(`DMs > 300 chars:   ${dmsOver}`);
console.log(`longest DM:        ${maxDm} chars (first name "${longestDmName}")`);

// Sample
const sample = buildEmail("Anne");
console.log(`\nsample email body: ${sample.length} chars, ${sample.split(/\s+/).filter(Boolean).length} words`);
