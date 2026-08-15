/**
 * Configurable sender / fund profile for LP outreach.
 *
 * Every piece of operator + fund identity that used to be hardcoded across the
 * outreach engine, exports, and the assistant lives here, sourced from env with
 * the current operator as the default (so behaviour is unchanged until the env
 * is set). Person fields reuse ANKER_SIGNATORY (lib/email/signature); fund and
 * thesis fields are their own SENDER_* env vars.
 *
 * To re-point outreach at a different fund/sender, set the SENDER_* env vars —
 * no code changes.
 */
import { ANKER_SIGNATORY } from "@/lib/email/signature"

export interface SenderProfile {
  // person
  name: string
  firstName: string
  title: string
  emails: string[]
  linkedin: string
  website: string
  // fund / firm
  fundName: string
  fundShortName: string
  managerOrg: string
  gpEmail: string
  // thesis brief
  strategy: string
  checkSize: string
  focus: string
  gpBackground: string
  portfolio: string
  aumTarget: string
  fundIReturns: string
  lpRights: string
  minimumCommitment: string
  closeTarget: string
}

const env = process.env
const firstOf = (full: string) => (full.split(" ")[0] || "").trim()

export const SENDER_PROFILE: SenderProfile = {
  name: ANKER_SIGNATORY.name,
  firstName: env.SENDER_FIRST_NAME || firstOf(ANKER_SIGNATORY.name),
  title: ANKER_SIGNATORY.title,
  emails: ANKER_SIGNATORY.emails,
  linkedin: ANKER_SIGNATORY.linkedin,
  website: ANKER_SIGNATORY.website,

  fundName: env.SENDER_FUND_NAME || "Summit Venture Studio Fund II",
  fundShortName: env.SENDER_FUND_SHORT || "SVS Fund II",
  managerOrg: env.SENDER_MANAGER_ORG || "Summit Venture Studio",
  gpEmail: env.SENDER_GP_EMAIL || "invest@svsfund.vc",

  strategy: env.SENDER_STRATEGY || "Sector-agnostic early-stage venture (pre-seed to Series A)",
  checkSize: env.SENDER_CHECK_SIZE || "$250k – $1.5M lead; $50k – $250k follow",
  focus: env.SENDER_FOCUS || "AI infrastructure, fintech, health tech, B2B SaaS, climate tech",
  gpBackground: env.SENDER_GP_BACKGROUND || "Operators-turned-investors; 3 exits (2 SaaS, 1 fintech)",
  portfolio: env.SENDER_PORTFOLIO || "14 companies across 6 sectors; 2 follow-on rounds from Fund I LPs",
  aumTarget: env.SENDER_AUM_TARGET || "$30M Fund II (currently raising)",
  fundIReturns: env.SENDER_FUND_I_RETURNS || "1.8× MOIC unrealised on 4-year-old fund",
  lpRights: env.SENDER_LP_RIGHTS || "Quarterly reports, co-investment rights on deals > $500k",
  minimumCommitment: env.SENDER_MIN_COMMITMENT || "$250k (angels/family offices); $500k (institutional)",
  closeTarget: env.SENDER_CLOSE_TARGET || "Q3 2026",
}

/** The AI sender brief — the fund facts block used in enrichment/drafting prompts. */
export function senderBrief(p: SenderProfile = SENDER_PROFILE): string {
  return [
    `FUND: ${p.fundShortName}`,
    `STRATEGY: ${p.strategy}`,
    `CHECK SIZE: ${p.checkSize}`,
    `FOCUS: ${p.focus}`,
    `GP BACKGROUND: ${p.gpBackground}`,
    `PORTFOLIO: ${p.portfolio}`,
    `AUM TARGET: ${p.aumTarget}`,
    `FUND I RETURNS: ${p.fundIReturns}`,
    `LP RIGHTS: ${p.lpRights}`,
    `MINIMUM COMMITMENT: ${p.minimumCommitment}`,
    `CLOSE TARGET: ${p.closeTarget}`,
    `GP EMAIL: ${p.gpEmail}`,
    `GP NAME: ${p.name}`,
  ].join("\n")
}
