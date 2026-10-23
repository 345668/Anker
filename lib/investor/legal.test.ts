import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { retentionMarkdown, POLICY } from "./retention-policy"
import { INVESTOR_TERMS_VERSION, TERMS_STATUS, TERMS, NOTICE, termsMarkdown, noticeMarkdown, placeholders, DRAFT_BANNER } from "./terms-text"
import { EMAILS, LEGAL_VERSION, TEXTS, legalCatalogue, wordingMarkdown } from "./legal"

// The keys of the rules the daily job runs (lib/investor/retention.ts); a rule added there without a row in the policy fails the test above.
const RULE_KEYS = ["signup_codes", "claim_codes", "team_invites", "fund_invites_expire", "fund_invite_cards", "passport_archived", "passport_superseded", "attachments_closed", "entity_events"]
const hash = () => createHash("sha256").update(JSON.stringify(legalCatalogue())).digest("hex")

// To change any sentence of legal weight: edit lib/investor/legal.ts, raise LEGAL_VERSION, regenerate the pack
// (npx tsx scripts/legal/gen-investor-pack.ts), send the changed sentences to counsel, and only then update both values below.
const PINNED_VERSION = "2026-10-23"
const PINNED_TERMS_VERSION = "2026-10-23-draft-1"
const PINNED_TERMS_HASH = "5838f107a6df15690ae3174bb6dfd7717c700b8a0b61cd9cb0ec1f6d9e781921"
const PINNED_HASH = "7892bfa03176b4ef57535fdeb6097c4791da85eb7448c1beef570904cf324b4e"

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
    for (const f of ["fund-page", "fund-finder", "passport", "talk-extras", "thread"]) expect(readFileSync(`components/investor/${f}.tsx`, "utf8")).not.toMatch(/not an offer|not advice and not|virus scanner|no automated system reads what/)
  })
  it("the emails keep their promises: codes hold the code only, notices carry no content", () => {
    const code = EMAILS.signupCode({ code: "123456", minutes: 10 })
    expect(code.subject).toContain("123456"); expect(code.text).not.toMatch(/fund|invest|name/i)
    for (const m of [EMAILS.newMessage({ url: "https://x" }), EMAILS.fundInvite({ url: "https://x" }), EMAILS.teamInvite({ url: "https://x", days: 14 }), EMAILS.quiet({ url: "https://x" })]) expect(m.subject + m.text).not.toMatch(/\d{3,}|EUR|USD|amount|NDA|passport/i)
  })
  it("states the things counsel is asked to rely on", () => {
    expect(TEXTS.requestStatement.text).toMatch(/not an offer/); expect(TEXTS.fitDisclaimer.text).toMatch(/not advice/)
    expect(TEXTS.ndaInvestorNotice.text).toMatch(/does not review it/); expect(TEXTS.passportIntro.text).toMatch(/no automated system reads what they say/)
    expect(TEXTS.discoverabilityOwner.text).toMatch(/Never your name, email or team/); expect(TEXTS.eraseStatement.text).toMatch(/cannot be undone/)
  })
  it("the investor terms and notice are pinned like the rest: a changed text needs a new version, and a new version asks everyone to accept again", () => {
    expect(INVESTOR_TERMS_VERSION).toBe(PINNED_TERMS_VERSION)
    expect(createHash("sha256").update(JSON.stringify([TERMS, NOTICE])).digest("hex")).toBe(PINNED_TERMS_HASH)
  })
  it("the terms and notice in the pack are exactly what the pages show", () => {
    const strip = (f: string) => readFileSync(`docs/legal/investor-side/${f}`, "utf8").replace(/^<!--[\s\S]*?-->\n\n/, "")
    expect(strip("10-investor-terms-DRAFT.md")).toBe(termsMarkdown()); expect(strip("09-investor-privacy-notice-DRAFT.md")).toBe(noticeMarkdown())
  })
  it("cannot be marked approved while a placeholder remains, and shows a draft banner while a draft", () => {
    if (TERMS_STATUS === "approved") expect(placeholders()).toEqual([])
    else { expect(DRAFT_BANNER).toMatch(/not yet in force/); expect(placeholders().length).toBeGreaterThan(0) }
    expect(readFileSync("components/investor/legal-doc.tsx", "utf8")).toMatch(/TERMS_STATUS === "draft"/)
  })
  it("the sign-up consent links to the investor terms and notice, and those pages exist", () => {
    expect(TEXTS.signupConsent.text).toContain("(/investor/terms)"); expect(TEXTS.signupConsent.text).toContain("(/investor/privacy)")
    for (const f of ["app/investor/terms/page.tsx", "app/investor/privacy/page.tsx", "app/investor/accept-terms/page.tsx"]) expect(readFileSync(f, "utf8").length).toBeGreaterThan(50)
    expect(readFileSync("app/investor/(area)/layout.tsx", "utf8")).toMatch(/termsCurrent/)
  })
  it("the notice's retention lines come from the policy the job runs", () => {
    for (const p of POLICY) expect(noticeMarkdown()).toContain(p.period)
  })
})
