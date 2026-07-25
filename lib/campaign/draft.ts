/**
 * Per-investor outreach email drafting for a founder campaign. One LLM prompt
 * per matched investor (run through generateBatch for concurrency); the model
 * returns {subject, body}. The orchestrator then appends a fixed call-to-action
 * block (one-click Interested / Not interested + View deck) and the Anker AI
 * founder signature — those are never LLM-generated, so links and signature are
 * always correct and consistent.
 */
import { extractJsonObject } from "@/lib/ai/json-extract"
import { signatureText } from "@/lib/email/signature"
import type { StartupProfile, ScoredInvestorEntity } from "@/lib/matching/v2/founder-types"

export interface DraftInput {
  startup: StartupProfile
  investor: ScoredInvestorEntity
}

/** Build the LLM prompt for one investor. */
export function buildDraftPrompt({ startup, investor }: DraftInput): string {
  const money = (n: number | null | undefined) =>
    n == null ? "?" : n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}k`
  return `Write a concise, warm, credible cold outreach email from a venture connector introducing a startup to an investor.
Voice: professional, specific, no hype, no exclamation marks, no emojis. 110–150 words. Plain text.

STARTUP
Name: ${startup.name}
One-liner: ${startup.oneLiner || startup.description || ""}
Sectors: ${(startup.sectors || []).join(", ")}
Stage: ${startup.stage}
Raising: ${money(startup.askAmount)}${startup.checkSizeIdealMin ? `, ideal check ${money(startup.checkSizeIdealMin)}–${money(startup.checkSizeIdealMax)}` : ""}
Traction: ${[startup.arr ? `ARR ${money(startup.arr)}` : "", startup.mrr ? `MRR ${money(startup.mrr)}` : "", startup.growthRateMom ? `${startup.growthRateMom}% MoM` : ""].filter(Boolean).join(", ") || "early"}

INVESTOR
Name: ${investor.name}${investor.title ? `, ${investor.title}` : ""}
Type: ${investor.type}
Focus: ${(investor.sectors || []).join(", ")}
Why this is a fit: ${investor.whyMatch || investor.reasons?.[0] || ""}

Requirements:
- Open with a specific reason this investor in particular is a fit (use "Why this is a fit").
- One or two crisp lines on the startup and its traction.
- Do NOT invent metrics not given above.
- End by inviting a reply or a quick look — do NOT paste links or a signature (those are added automatically).

Return ONLY JSON: {"subject": "<45 chars max, specific>", "body": "<the email body, no signature, no links>"}`
}

export interface AssembledEmail {
  subject: string
  body: string
}

/** Parse one LLM result and append the CTA links + signature. */
export function assembleEmail(args: {
  llmJson: string
  startup: StartupProfile
  investorName: string
  yesUrl: string
  noUrl: string
  viewUrl: string
}): AssembledEmail {
  const parsed = extractJsonObject(args.llmJson, "campaign_draft") as any
  const subject =
    (typeof parsed?.subject === "string" && parsed.subject.trim().slice(0, 120)) ||
    `Intro: ${args.startup.name}`
  const core =
    (typeof parsed?.body === "string" && parsed.body.trim()) ||
    `I wanted to introduce ${args.startup.name} — ${args.startup.oneLiner || ""}. Based on your focus, I thought it could be a fit and wanted to see if it's worth a closer look.`

  const cta = [
    ``,
    `View the pitch deck: ${args.viewUrl}`,
    ``,
    `Is this a fit for you?`,
    `  • Yes, I'm interested:  ${args.yesUrl}`,
    `  • Not a fit right now:  ${args.noUrl}`,
  ].join("\n")

  const body = `${core}\n${cta}\n\n${signatureText()}`
  return { subject, body }
}
