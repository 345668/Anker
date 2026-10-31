import { buildReplyPrompt, parseReplyJson, type ReplyContext } from "@/lib/ai/reply-handler"
import type { Suite } from "./evals"

/**
 * The fixed cases (docs/architecture/53 section 8). Replies are written the way investors write them, with the label a person would give, so accuracy is against a human's answer and not
 * against another model's. The reply task uses the PRODUCTION prompt (`buildReplyPrompt`), so what is measured is what would run. The URL and extraction tasks use small stand-in prompts
 * of the same shape (production prompts for them live inside their call sites); replace them with the exported production prompts as those are factored out.
 */
const founder = { companyName: "Lumen Labs", oneLiner: "Cash-flow forecasting for German SMEs.", facts: ["€1.2m ARR, 40% month over month", "seed round open, €3m"], calendarUrl: "https://cal.example/lumen" }
const ctx = (theirReply: string): ReplyContext => ({ partnerName: "Dana Reuter", partnerFirm: "Nordwerk Gründerfonds", partnerTitle: "Partner", ourOriginalDm: "Hi Dana, we are building cash-flow forecasting for German SMEs (€1.2m ARR). Would a short intro call make sense?", theirReply, founder })
const REPLIES: Array<[string, string, string]> = [
  ["r1", "Sounds interesting. Can you send the deck and let's find 20 minutes next week?", "INTERESTED"],
  ["r2", "Yes, happy to talk. Here is my calendar, pick any slot on Thursday.", "INTERESTED"],
  ["r3", "Nice. We are closing our current fund until January though, ping me in Q1 and we can speak properly.", "INTERESTED_LATER"],
  ["r4", "Too early for us right now but I'd like to follow you. Come back after your Series A is in sight.", "WRONG_NOW"],
  ["r5", "Thanks for reaching out, but we only invest in deeptech and biotech. Not a fit, good luck!", "WRONG_FIT"],
  ["r6", "We don't do fintech or anything SaaS-related, sorry. Best of luck.", "WRONG_FIT"],
  ["r7", "What is your net revenue retention, and who are your biggest customers?", "QUESTION"],
  ["r8", "Interesting. How does this differ from DATEV's forecasting module? And is the data hosted in Germany?", "QUESTION"],
  ["r9", "Not now — our investment committee is on break until spring. Maybe worth another look then.", "WRONG_NOW"],
  ["r10", "Love it. Send me the one-pager and I'll forward it to my partners; we could meet this week.", "INTERESTED"],
]
const LABELS = ["INTERESTED", "INTERESTED_LATER", "WRONG_FIT", "WRONG_NOW", "QUESTION"]
const URLS: Array<[string, string, string]> = [
  ["u1", "https://nordwerk.example/about-us", "about"], ["u2", "https://nordwerk.example/team/dana-reuter", "team"], ["u3", "https://nordwerk.example/portfolio", "portfolio"],
  ["u4", "https://nordwerk.example/", "homepage"], ["u5", "https://nordwerk.example/contact", "contact"], ["u6", "https://nordwerk.example/news/2026/fund-ii-closes", "news"],
  ["u7", "https://nordwerk.example/team", "team"], ["u8", "https://nordwerk.example/investments", "portfolio"],
]
const URL_LABELS = ["homepage", "about", "team", "portfolio", "contact", "news", "other"]
const parse = (t: string) => parseReplyJson(t)

export const SUITES: Suite[] = [
  { task: "reply_classify", bars: { validRate: 0.95, accuracy: 0.9, agreement: 0.9 }, cases: REPLIES.map(([id, reply, truth]) => ({
    id, json: true, maxTokens: 400, prompt: buildReplyPrompt(ctx(reply)),
    score: (text) => { const j = parse(text), label = String(j?.classification ?? "").toUpperCase().replace(/[\s-]+/g, "_"), draft = String(j?.draft ?? "")
      if (!j || !LABELS.includes(label)) return { valid: false, correct: null, note: "no_valid_label" }
      if (draft.length > 320) return { valid: false, correct: null, label, note: "draft_over_320" }
      return { valid: true, correct: label === truth, label } } })) },
  { task: "url_classify", bars: { validRate: 0.95, accuracy: 0.9, agreement: 0.9 }, cases: URLS.map(([id, url, truth]) => ({
    id, json: true, maxTokens: 60, prompt: `Classify this web page URL of an investment firm by purpose. Answer with JSON only: {"label": one of ${URL_LABELS.join(" | ")}}.\nURL: ${url}`,
    score: (text) => { const j = parse(text), label = String(j?.label ?? "").toLowerCase(); return j && URL_LABELS.includes(label) ? { valid: true, correct: label === truth, label } : { valid: false, correct: null, note: "no_valid_label" } } })) },
  { task: "structured_json", bars: { validRate: 0.95 }, cases: ["Lumen Labs builds cash-flow forecasting for German SMEs. Founded 2023 in Berlin by Mira Koch and Jan Weber. 14 employees. Raised a €1.5m pre-seed in 2024.", "Atlas Robotics (Zurich, 2021) makes warehouse picking robots. CEO Lena Frei. Series A of CHF 12m led by Summit Capital in 2025. 60 staff.", "Orbit Health is a Munich digital-therapeutics startup, founded 2022 by Dr. Paul Lang. No funding disclosed. 9 people."].map((blurb, i) => ({
    id: `j${i + 1}`, json: true, maxTokens: 300, prompt: `Extract a company profile as JSON with exactly the keys name (string), city (string), founded (integer or null), employees (integer or null), funding_eur (number or null). Use null when unknown; never guess. Answer with JSON only.\n\n${blurb}`,
    score: (text) => { const j = parse(text); const ok = j && typeof j.name === "string" && typeof j.city === "string" && (j.founded === null || Number.isInteger(j.founded)) && (j.employees === null || Number.isInteger(j.employees)) && (j.funding_eur === null || typeof j.funding_eur === "number"); return ok ? { valid: true, correct: null } : { valid: false, correct: null, note: "schema" } } })) },
]
