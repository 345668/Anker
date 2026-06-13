// Append Philippe's signature block to every email body, and a minimal one-line
// tail to LinkedIn DMs (where char limit allows).
// Mutates /tmp/fo-compare/webinar-drafts.jsonl in place.
import fs from "fs";

const STATE = "/tmp/fo-compare/webinar-drafts.jsonl";

const SIGNATURE = [
  "",
  "Warm regards,",
  "",
  "Philippe M Masindet",
  "Founder, Anker AI",
  "Berlin, Germany",
  "",
  "Vice President, Investor Relations",
  "Summit Venture Studios",
  "https://summitventurestudio.com/",
  "Utah, USA",
  "",
  "linkedin.com/in/philippe-m-masindet",
  "Tel: +49 174 681 3185",
].join("\n");

const DM_TAIL = " - Philippe, Anker AI";  // hyphen, not em-dash, per the no-em-dash rule
const DM_MAX = 300;

const lines = fs.readFileSync(STATE, "utf8").split("\n").filter(Boolean);
let bodiesUpdated = 0, dmsUpdated = 0, dmsSkippedNoRoom = 0;

const out = [];
for (const line of lines) {
  const r = JSON.parse(line);
  if (r.body) {
    // Strip the existing trailing "Philippe" line (case-insensitive, with optional whitespace/newlines)
    let body = r.body
      .replace(/\n+\s*philippe\s*\.?\s*$/i, "")
      .replace(/\n+\s*best,?\s*\n+\s*philippe\s*$/i, "")
      .trimEnd();
    r.body = body + "\n" + SIGNATURE;
    bodiesUpdated++;
  }
  if (r.dm) {
    // Only append the tail if it fits within the 300-char hard limit.
    if (r.dm.length + DM_TAIL.length <= DM_MAX) {
      r.dm = r.dm.trimEnd() + DM_TAIL;
      dmsUpdated++;
    } else {
      dmsSkippedNoRoom++;
    }
  }
  out.push(JSON.stringify(r));
}
fs.writeFileSync(STATE, out.join("\n") + "\n");

console.log(`emails updated:        ${bodiesUpdated}`);
console.log(`DMs with tail added:   ${dmsUpdated}`);
console.log(`DMs left as-is (room): ${dmsSkippedNoRoom}`);
