import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { retentionMarkdown, POLICY } from "./retention-policy"
import { EMAILS, LEGAL_VERSION, TEXTS, legalCatalogue, wordingMarkdown } from "./legal"

// The keys of the rules the daily job runs (lib/investor/retention.ts); a rule added there without a row in the policy fails the test above.
const RULE_KEYS = ["signup_codes", "claim_codes", "team_invites", "fund_invites_expire", "fund_invite_cards", "passport_archived", "passport_superseded", "attachments_closed", "entity_events"]
const hash = () => createHash("sha256").update(JSON.stringify(legalCatalogue())).digest("hex")

// To change any sentence of legal weight: edit lib/investor/legal.ts, raise LEGAL_VERSION, regenerate the pack
// (npx tsx scripts/legal/gen-investor-pack.ts), send the changed sentences to counsel, and only then update both values below.
const PINNED_VERSION = "2026-10-21"
const PINNED_HASH = "b5bd03836d24d5e80e6ee6fa1196b7aec382515c4ff4a6cffceb63005a538d8c"

describe("the wording counsel reads", () => {
  it("is pinned: a changed sentence fails here until the change is made on purpose", () => {
    expect(LEGAL_VERSION).toBe(PINNED_VERSION)
    expect(hash()).toBe(PINNED_HASH)
  })
  it("has unique ids and no empty text", () => {
    const ids = legalCatalogue().map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(legalCatalogue().every((c) => c.text.trim().length > 0 && c.where && c.audience)).toBe(true)
  })
  it("the generated pack on disk is exactly what the registry generates", () => {
    expect(readFileSync("docs/legal/investor-side/07-wording-as-shipped.md", "utf8")).toBe(wordingMarkdown() + "\n")
  })
  it("the retention table on disk is exactly what the policy generates, and every rule the job runs is described in it", () => {
    expect(readFileSync("docs/legal/investor-side/08-retention-as-configured.md", "utf8")).toBe(retentionMarkdown())
    expect(POLICY.map((p) => p.key).sort()).toEqual(RULE_KEYS.sort())
  })
  it("the screens take their wording from the registry, not their own text", () => {
    const uses: Array<[string, RegExp]> = [
      ["components/investor/sign-up-form.tsx", /TEXTS\.signupConsent/], ["components/investor/start-profile.tsx", /TEXTS\.signupConsent/], ["app/investor/sign-up/page.tsx", /TEXTS\.signupClosedBody/],
      ["components/investor/fund-finder.tsx", /TEXTS\.fitDisclaimer/], ["components/investor/fund-page.tsx", /TEXTS\.requestStatement/], ["components/investor/talk-extras.tsx", /TEXTS\.ndaInvestorNotice/],
      ["components/investor/thread.tsx", /TEXTS\.attachmentWarning/], ["components/investor/passport.tsx", /TEXTS\.passportShareConsent/], ["components/investor/discoverable-toggle.tsx", /TEXTS\.discoverabilityOwner/],
      ["components/investor/fund-side.tsx", /TEXTS\.discoverabilityFund/], ["components/investor/connect-invites.tsx", /TEXTS\.inviteAcceptNote/], ["components/investor/your-data.tsx", /TEXTS\.eraseStatement/],
    ]
    for (const [file, re] of uses) expect(readFileSync(file, "utf8"), file).toMatch(re)
    // and the old hard-coded sentences are gone from the components
    for (const f of ["fund-page", "fund-finder", "passport", "talk-extras", "thread"]) expect(readFileSync(`components/investor/${f}.tsx`, "utf8")).not.toMatch(/not an offer|not advice and not|virus scanner|no automated system reads/)
  })
  it("the emails keep their promises: codes hold the code only, notices carry no content", () => {
    const code = EMAILS.signupCode({ code: "123456", minutes: 10 })
    expect(code.subject).toContain("123456"); expect(code.text).not.toMatch(/fund|invest|name/i)
    for (const m of [EMAILS.newMessage({ url: "https://x" }), EMAILS.fundInvite({ url: "https://x" }), EMAILS.teamInvite({ url: "https://x", days: 14 }), EMAILS.quiet({ url: "https://x" })]) expect(m.subject + m.text).not.toMatch(/\d{3,}|EUR|USD|amount|NDA|passport/i)
  })
  it("states the things counsel is asked to rely on", () => {
    expect(TEXTS.requestStatement.text).toMatch(/not an offer/); expect(TEXTS.fitDisclaimer.text).toMatch(/not advice/)
    expect(TEXTS.ndaInvestorNotice.text).toMatch(/does not review it/); expect(TEXTS.passportIntro.text).toMatch(/no automated system reads them/)
    expect(TEXTS.discoverabilityOwner.text).toMatch(/Never your name, email or team/); expect(TEXTS.eraseStatement.text).toMatch(/cannot be undone/)
  })
})
