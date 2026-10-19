import { describe, expect, it } from "vitest"
import { SENSITIVE_TOOL } from "./sensitive"

describe("which answers stay out of Telegram", () => {
  it("keeps data room, investor records and KYC in the app", () => {
    for (const t of ["dataroom_ingest", "dataroom_questions", "lp_overview", "lp_capital_account", "kyc_status"]) expect(SENSITIVE_TOOL.test(t), t).toBe(true)
  })
  it("lets the LP matching follow-ups answer: they read the shared directory and the workspace's own run", () => {
    for (const t of ["matchmake_lps", "lp_match_status", "lp_match_explain", "lp_match_refine", "lp_match_feedback", "lp_match_draft", "lp_match_to_crm", "crm_search"]) expect(SENSITIVE_TOOL.test(t), t).toBe(false)
  })
})
