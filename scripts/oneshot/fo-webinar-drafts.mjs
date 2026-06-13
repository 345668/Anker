// Generate per-profile webinar-invite drafts (email + LinkedIn DM) for the
// June 18 "Using AI in Family Office Operations" webinar using Qwen via the
// DashScope OpenAI-compatible API.
//
// Reads:  uploads/SVS_Fund_II_Enriched_Outreach_282.xlsx
// Writes: state JSONL at /tmp/fo-compare/webinar-drafts.jsonl,
//         logs to /tmp/fo-compare/webinar-drafts.log
// Resumable: skips profiles already in the JSONL.
//
// Usage:
//   DASHSCOPE_API_KEY=... QWEN_WORKSPACE_ID=... node fo-webinar-drafts.mjs [--limit N] [--concurrency N] [--model qwen-plus]
import XLSX from "xlsx";
import fs from "fs";
import path from "path";

const SRC = "/Users/RalfMersch/Library/Application Support/Claude/local-agent-mode-sessions/5de569ee-c7d0-4b34-a8aa-3aacf7dc6d5f/ece6cd9a-b92c-42bd-95bc-3281402726de/local_ca9a506c-f3bd-4c01-a7ba-55f6bd30c1be/uploads/SVS_Fund_II_Enriched_Outreach_282.xlsx";
const STATE = "/tmp/fo-compare/webinar-drafts.jsonl";
const LOG   = "/tmp/fo-compare/webinar-drafts.log";
const REG_URL = "https://luma.com/oswlwoe7?tk=OdvKag";

const ARGS = Object.fromEntries(
  process.argv.slice(2).map(a => a.startsWith("--") ? [a.slice(2).split("=")[0], a.includes("=") ? a.split("=")[1] : true] : []).filter(Boolean)
);
const LIMIT = ARGS.limit ? Number(ARGS.limit) : Infinity;
const CONCURRENCY = ARGS.concurrency ? Number(ARGS.concurrency) : 6;
const MODEL = ARGS.model || process.env.QWEN_MODEL || "qwen-plus";

const API_KEY = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY;
if (!API_KEY) { console.error("DASHSCOPE_API_KEY (or QWEN_API_KEY) is required"); process.exit(1); }
const WS = process.env.QWEN_WORKSPACE_ID;
const BASE_URL = process.env.QWEN_BASE_URL
  || (WS ? `https://${WS}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`
         : "https://dashscope.aliyuncs.com/compatible-mode/v1");

fs.mkdirSync(path.dirname(STATE), { recursive: true });

function loadProfiles() {
  const wb = XLSX.readFile(SRC);
  const curated = XLSX.utils.sheet_to_json(wb.Sheets["Curated Profiles (Enriched)"], { defval: "" });
  const drafts  = XLSX.utils.sheet_to_json(wb.Sheets["Email Drafts (Enriched)"],       { defval: "" });
  const dms     = XLSX.utils.sheet_to_json(wb.Sheets["LinkedIn DMs"],                  { defval: "" });
  const draftBy = new Map(drafts.map(r => [String(r["#"]), r]));
  const dmBy    = new Map(dms.map(r => [String(r["#"]), r]));
  return curated.map(r => {
    const num = String(r["#"]);
    const d = draftBy.get(num) || {};
    const dm = dmBy.get(num);
    return {
      num,
      tier: r["Tier"], score: r["Score"],
      name: String(r["Name"] || "").trim(),
      title: String(r["Title/Role"] || "").trim(),
      lpType: String(r["LP Type"] || "").trim(),
      tags: String(r["Tags"] || "").trim(),
      location: String(r["Location"] || "").trim(),
      email: String(r["Email"] || "").trim(),
      linkedin: String(r["LinkedIn"] || "").trim(),
      sectors: String(r["Sectors"] || "").trim(),
      whyThisContact: String(r["Why This Contact"] || "").trim(),
      firmIntelligence: String(r["Firm Intelligence"] || "").trim(),
      investmentMandate: String(r["Investment Mandate"] || "").trim(),
      personalisationHook: String(r["Personalisation Hook"] || "").trim(),
      primaryChannel: String(d["Primary channel"] || "").toLowerCase() || (dm ? "linkedin" : "email"),
      voiceNotes: String(d["Voice notes"] || "").trim(),
      hasLinkedInDm: !!dm,
      batch: String(r["Batch"] || "").trim(),
      multiTouchNote: String(r["Multi-Touch Note"] || "").trim(),
    };
  });
}

function isAngelOrHnw(p) {
  const t = (p.lpType + " " + p.tags).toLowerCase();
  return t.includes("angel") || t.includes("hnw") || /\boperator\b/.test(t);
}

function emailPrompt(p) {
  const operator = isAngelOrHnw(p);
  const voice = operator
    ? "Operator-first. Open with 'Hi {first} — Philippe here.' Warm, conversational, peer-to-peer. No 'Dear'. Short sentences."
    : "Formal-warm. Open with 'Dear {first},'. Quiet credibility tone. No marketing language. Measured, professional.";
  const firstName = p.name.split(/\s+/)[0];
  const userMsg = `You write outreach for Philippe M. Masindet (VP, Summit Venture Studio).

EVENT
Title: Using AI in Family Office Operations
When: Thursday, June 18, 18:30 to 19:30 CEST. Zoom.
Hosts: Summit Venture Studio in collaboration with Anker AI.
Presenters: Phil Alves (CTO, Summit Venture Studio) and Alex Felman (2nd-gen Family Office).
What attendees leave with: a short list of AI tools they can use immediately; a practical process for applying AI to family office operations; concrete use cases across due diligence, deal tracking, portfolio tracking, and operational workflows; Q&A.
Invitation-only — designed for family offices, HNW individuals, angel investors, and FO service providers who want practical applied AI.
Registration: ${REG_URL}

RECIPIENT
Name: ${p.name}
First name (use this only): ${firstName}
Title/Role: ${p.title}
LP Type: ${p.lpType}
Location: ${p.location}
Sectors of interest: ${p.sectors}
Firm intel: ${p.firmIntelligence}
Investment mandate: ${p.investmentMandate}
Why this contact was selected: ${p.whyThisContact}
Personalisation hook: ${p.personalisationHook}

VOICE
${voice}

HARD RULES
- 90 to 130 words in the body (not counting the signature).
- Three short paragraphs.
  Para 1: Personal opening. Reference the recipient (their role, firm, location, or sector) in ONE specific way using the personalisation hook. Do NOT start with "I hope this finds you well" or any boilerplate.
  Para 2: One-sentence framing of the event (what it is, who is presenting) and one sentence on why it is relevant to THIS recipient given their mandate or role. No hype.
  Para 3: Concrete details (Thursday June 18, 18:30 CEST, Zoom, invitation-only) and a single direct CTA: register at ${REG_URL}. No second ask.
- Sign: "Philippe" on its own line.
- NEVER use em-dashes. Use commas or periods.
- No exclamation marks. No "exclusive". No "I would love to". No "circling back". No "synergy".
- Do NOT mention SVS Fund II, the fund, or any capital raise. This is a webinar invite, full stop.
- Subject line: 5 to 9 words, no question mark, no exclamation. Plain language. Avoid the words "exclusive" or "invitation".

Return EXACTLY this JSON (no markdown fence, no commentary):
{"subject":"...","body":"..."}

The body must include actual newline characters between paragraphs (use \\n in the JSON).`;
  return [
    { role: "system", content: "You return only valid JSON. No markdown fences, no commentary." },
    { role: "user", content: userMsg },
  ];
}

function dmPrompt(p) {
  const firstName = p.name.split(/\s+/)[0];
  const userMsg = `You write LinkedIn DMs for Philippe M. Masindet (VP, Summit Venture Studio).

EVENT
"Using AI in Family Office Operations" — Thursday, June 18, 18:30 to 19:30 CEST, Zoom.
Hosts: Summit Venture Studio in collaboration with Anker AI.
Presenters: Phil Alves (CTO SVS), Alex Felman (2nd-gen FO).
Registration: ${REG_URL}

RECIPIENT
${p.name} — ${p.title} (${p.lpType}, ${p.location})
Sectors: ${p.sectors}
Why selected: ${p.whyThisContact}
Personalisation hook: ${p.personalisationHook}

HARD RULES
- Open with this exact line: "Hi ${firstName}, Philippe here, VP at Summit Venture Studio."
- After the opener, ONE personalized sentence tying their role/sector/mandate to the webinar theme (applied AI for family office operations).
- ONE sentence with event details (Thursday June 18, 18:30 CEST, Zoom).
- ONE sentence CTA with the link: ${REG_URL}
- Maximum 280 characters total INCLUDING the URL.
- No em-dashes. No exclamation marks. No "exclusive". No emojis.
- No "I hope", no "circling back", no "would love to".

Return EXACTLY this JSON (no markdown fence, no commentary):
{"dm":"..."}`;
  return [
    { role: "system", content: "You return only valid JSON. No markdown fences, no commentary." },
    { role: "user", content: userMsg },
  ];
}

async function callJson(messages, max_tokens) {
  const url = `${BASE_URL}/chat/completions`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: 0.7,
          max_tokens,
          response_format: { type: "json_object" },
        }),
      });
    } catch (e) {
      if (attempt === 5) throw e;
      await new Promise(r => setTimeout(r, 1000 * attempt));
      continue;
    }
    if (resp.status === 429 || resp.status >= 500) {
      if (attempt === 5) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      await new Promise(r => setTimeout(r, 1500 * attempt));
      continue;
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("empty completion");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in response: " + text.slice(0, 200));
    return JSON.parse(m[0]);
  }
  throw new Error("unreachable");
}

async function readDone() {
  if (!fs.existsSync(STATE)) return new Map();
  const done = new Map();
  for (const line of fs.readFileSync(STATE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (!r.error) done.set(r.num, r); } catch {}
  }
  return done;
}
function appendState(rec) { fs.appendFileSync(STATE, JSON.stringify(rec) + "\n"); }
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG, line);
  process.stdout.write(line);
}

// Deterministic cleanup: strip em-dashes the model occasionally smuggles in,
// fix double-spaces, ensure the registration URL is present in the body.
function cleanup(rec) {
  const fix = (s) => s == null ? s : String(s)
    .replace(/\u2014/g, ", ")    // em-dash
    .replace(/\u2013/g, ", ")    // en-dash
    .replace(/--/g, ", ")
    .replace(/[ \t]+,/g, ",")
    .replace(/  +/g, " ")
    .replace(/(\w),(\w)/g, "$1, $2")
    .replace(/\s+\n/g, "\n");
  if (rec.subject) rec.subject = fix(rec.subject);
  if (rec.body) {
    rec.body = fix(rec.body);
    if (!rec.body.includes("https://luma.com/oswlwoe7?tk=OdvKag")) {
      rec.body = rec.body.replace(/(Philippe\s*)$/i,
        `Please register at https://luma.com/oswlwoe7?tk=OdvKag.\n$1`);
    }
  }
  if (rec.dm) {
    rec.dm = fix(rec.dm);
    if (!rec.dm.includes("https://luma.com/oswlwoe7?tk=OdvKag")) {
      rec.dm = rec.dm.trimEnd() + " " + "https://luma.com/oswlwoe7?tk=OdvKag";
    }
  }
  return rec;
}

async function runOne(p) {
  const out = {
    num: p.num, name: p.name, generated_at: new Date().toISOString(),
    voice: isAngelOrHnw(p) ? "operator-first" : "formal-warm",
    email_recipient: p.email, linkedin_url: p.linkedin, primary_channel: p.primaryChannel,
  };
  if (p.email) {
    const em = await callJson(emailPrompt(p), 700);
    out.subject = em.subject; out.body = em.body;
  } else { out.subject = ""; out.body = ""; }
  if (p.hasLinkedInDm && p.linkedin) {
    const dm = await callJson(dmPrompt(p), 400);
    out.dm = dm.dm;
  }
  return cleanup(out);
}

async function pool(items, n, fn, onProgress) {
  const iter = items[Symbol.iterator]();
  let active = 0, done = 0;
  return new Promise((resolve) => {
    let resolved = false;
    function next() {
      if (resolved) return;
      const { value, done: end } = iter.next();
      if (end) { if (active === 0 && !resolved) { resolved = true; resolve(); } return; }
      active++;
      Promise.resolve(fn(value)).catch(e => ({ __error: e.message })).then(res => {
        active--; done++; onProgress(done, res, value); next();
      });
    }
    for (let i = 0; i < n; i++) next();
  });
}

// -------- main --------
const all = loadProfiles();
const done = await readDone();
const todo = all.filter(p => !done.has(p.num)).slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined);
log(`profiles: ${all.length}  done: ${done.size}  todo: ${todo.length}  conc: ${CONCURRENCY}  model: ${MODEL}  base: ${BASE_URL}`);

let errCount = 0;
const startTs = Date.now();
await pool(todo, CONCURRENCY, async (p) => {
  try {
    const rec = await runOne(p);
    appendState(rec);
    const n = Number(p.num);
    if (n % 10 === 0 || p.num === todo[0]?.num) {
      const elapsed = ((Date.now() - startTs) / 1000).toFixed(0);
      log(`#${p.num} ${p.name.slice(0,40)} ok  subj="${(rec.subject || "").slice(0, 50)}"  elapsed=${elapsed}s`);
    }
  } catch (e) {
    errCount++;
    log(`#${p.num} ${p.name.slice(0,40)} ERR: ${e.message.slice(0, 200)}`);
    appendState({ num: p.num, name: p.name, error: e.message, generated_at: new Date().toISOString() });
  }
}, () => {});
log(`DONE. errors: ${errCount}  elapsed: ${((Date.now()-startTs)/1000).toFixed(0)}s`);
