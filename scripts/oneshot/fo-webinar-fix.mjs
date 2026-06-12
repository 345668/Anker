// Regenerate the 11 flagged drafts with tighter prompts.
import XLSX from "xlsx";
import fs from "fs";

const STATE = "/tmp/fo-compare/webinar-drafts.jsonl";
const SRC = "/Users/RalfMersch/Library/Application Support/Claude/local-agent-mode-sessions/5de569ee-c7d0-4b34-a8aa-3aacf7dc6d5f/ece6cd9a-b92c-42bd-95bc-3281402726de/local_ca9a506c-f3bd-4c01-a7ba-55f6bd30c1be/uploads/SVS_Fund_II_Enriched_Outreach_282.xlsx";
const REG_URL = "https://luma.com/oswlwoe7?tk=OdvKag";
const API_KEY = process.env.DASHSCOPE_API_KEY;
const WS = process.env.QWEN_WORKSPACE_ID;
const BASE_URL = `https://${WS}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`;
const MODEL = "qwen-plus";

const wb = XLSX.readFile(SRC);
const curated = XLSX.utils.sheet_to_json(wb.Sheets["Curated Profiles (Enriched)"], { defval: "" });
const profById = new Map(curated.map(r => [String(r["#"]), r]));

const records = [];
for (const line of fs.readFileSync(STATE, "utf8").split("\n")) {
  if (!line.trim()) continue;
  records.push(JSON.parse(line));
}

function wc(s) { return (s || "").split(/\s+/).filter(Boolean).length; }
function flagged(r) {
  return (r.body && wc(r.body) < 80) || (r.dm && r.dm.length > 290);
}
const toFix = records.filter(flagged);
console.log(`flagged for regeneration: ${toFix.length}`);
for (const r of toFix) console.log(`  #${r.num} ${r.name} body=${wc(r.body || "")}w dm=${(r.dm||"").length}c`);

function cleanup(s) {
  return String(s || "")
    .replace(/—/g, ", ").replace(/–/g, ", ").replace(/--/g, ", ")
    .replace(/[ \t]+,/g, ",").replace(/  +/g, " ").replace(/\s+\n/g, "\n");
}

async function callJson(messages, max_tokens) {
  const r = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.4, max_tokens, response_format: { type: "json_object" }}),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  const m = text.match(/\{[\s\S]*\}/);
  return JSON.parse(m[0]);
}

// Regenerate
const fixed = new Map();
for (const r of toFix) {
  const p = profById.get(r.num);
  const firstName = (p["Name"] || "").split(/\s+/)[0];

  // Short body — regenerate with stricter min word count
  if (r.body && wc(r.body) < 80) {
    const operator = r.voice === "operator-first";
    const opener = operator ? `Hi ${firstName}, Philippe here.` : `Dear ${firstName},`;
    const userMsg = `Write a webinar invite email body of EXACTLY 100 to 130 words.
Start with this exact opener: "${opener}"
Then three paragraphs total.

Personalisation: ${p["Personalisation Hook"]}
Recipient: ${p["Name"]} — ${p["Title/Role"]} (${p["LP Type"]}, ${p["Location"]})
Sectors: ${p["Sectors"]}
Why selected: ${p["Why This Contact"]}
Investment mandate: ${p["Investment Mandate"]}

Event: "Using AI in Family Office Operations" — Thursday June 18, 18:30 to 19:30 CEST, Zoom.
Hosts: Summit Venture Studio in collaboration with Anker AI.
Presenters: Phil Alves (CTO SVS), Alex Felman (2nd-gen FO).
Registration URL (single CTA): ${REG_URL}

HARD: no em-dashes, no exclamation marks, no "exclusive", no mention of any fund or capital raise.
Sign with "Philippe" on its own line.

Return only JSON: {"subject":"...","body":"..."}`;
    const out = await callJson([
      { role: "system", content: "Return only valid JSON." },
      { role: "user", content: userMsg }
    ], 700);
    r.subject = cleanup(out.subject);
    r.body = cleanup(out.body);
    if (!r.body.includes(REG_URL)) {
      r.body = r.body.replace(/(Philippe\s*)$/i, `Please register at ${REG_URL}.\n$1`);
    }
    console.log(`  fixed body #${r.num} → ${wc(r.body)} words`);
  }

  // Long DM — regenerate with stricter char count
  if (r.dm && r.dm.length > 290) {
    const userMsg = `Write a LinkedIn connection-request note (MAX 280 chars INCLUDING the URL).
Use this exact opener: "Hi ${firstName}, Philippe here, VP at Summit Venture Studio."
Then ONE personalized sentence tying their work to applied AI for family office operations.
Then event details: Thursday June 18, 18:30 CEST, Zoom.
Then CTA with the link.

Recipient context:
${p["Name"]} — ${p["Title/Role"]} (${p["LP Type"]}, ${p["Location"]})
Why: ${p["Why This Contact"]}
Hook: ${p["Personalisation Hook"]}

Event: "Using AI in Family Office Operations" Thu June 18, 18:30 CEST, Zoom.
URL: ${REG_URL}

HARD: no em-dashes, no exclamation marks, no emojis. MUST be 280 chars or fewer. Be concise.

Return only JSON: {"dm":"..."}`;
    let attempt = 0, ok = false;
    while (attempt < 3 && !ok) {
      attempt++;
      const out = await callJson([
        { role: "system", content: "Return only valid JSON. Strictly enforce the character limit." },
        { role: "user", content: userMsg }
      ], 350);
      let dm = cleanup(out.dm).trim();
      if (!dm.includes(REG_URL)) dm = dm.replace(/\.$/,"") + " " + REG_URL;
      if (dm.length <= 290) { r.dm = dm; ok = true; console.log(`  fixed dm #${r.num} → ${dm.length} chars`); break; }
      console.log(`  retry dm #${r.num} attempt ${attempt} got ${dm.length} chars`);
    }
    if (!ok && r.dm && r.dm.length > 290) {
      // Hard truncate as last resort: keep opener + last sentence with URL.
      const opener = `Hi ${firstName}, Philippe here, VP at Summit Venture Studio.`;
      const tail = ` Webinar Jun 18 18:30 CEST, Zoom: ${REG_URL}`;
      r.dm = `${opener}${tail}`;
      console.log(`  hard-truncated dm #${r.num} → ${r.dm.length} chars`);
    }
  }
  fixed.set(r.num, r);
}

// Rewrite JSONL with updates applied.
const lines = records.map(rec => fixed.has(rec.num) ? JSON.stringify(fixed.get(rec.num)) : JSON.stringify(rec));
fs.writeFileSync(STATE, lines.join("\n") + "\n");
console.log(`\nupdated ${fixed.size} records in ${STATE}`);
