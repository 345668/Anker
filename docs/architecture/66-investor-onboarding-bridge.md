# 66. Build plan: from a conversation to onboarding (doc 61 P4)

Status: **built 2026-10-20; migration applied to production; see section 5.** Plan as written: Follows docs 64 and 65. Doc 61 section 6 says the fund's "invite to onboard" creates the fund's investor record from the entity and the relationship and starts doc 60; the stage then follows doc 60 to `active`. This slice builds that and nothing more.

## 1. What happens
1. The fund's owner or admin presses **Invite to onboard** on a relationship that is `in_talks`. Nothing else can start it: an investor cannot move their own request, and a relationship in any other stage cannot be invited.
2. **Exactly one `fund_lps` row** is made for the fund from the entity: name = the entity's legal name; type mapped (individual to `hnwi`, company to `corporate`, fund to `fund_of_funds`, family office to `family_office`, trust left unset); contact email = the investor's confirmed address, which the fund already holds since it accepted. Nothing about tax residence, tax number or identity documents is copied: those are asked by doc 60, per fund. The row records the relationship (`fund_relationships.fund_lp_id`, unique), so a second invitation cannot make a second row.
3. The stage becomes `invited_to_onboard`, and the doc 60 invitation goes out by its own mechanism: a personal link, 30 days, with the emailed six-digit code at the door. If the email cannot be sent the row and stage stay and the fund is told to use "Send a new link" in the LP panel; nothing is rolled back.
4. **The stage follows doc 60.** `onboarding` once the investor has opened the portal; `active` once the fund has countersigned. It is computed from `fund_lps.onboarding_state` whenever either side lists relationships and once a day, never set by the investor.
5. The investor sees, on the request, the stage and the next step in plain words, and is told to use the link in the email. The thread of doc 65 stays open through these stages.

## 2. Not in this slice
Opening the investor's own account to the doc 60 pages without the emailed link (it needs the claim of fund-added records and the migration of `lp_accounts`, P5 and doc 61 section 4); a request appearing as a proposal in the Actions inbox; reversal (taking an invited investor back to talks).

## 3. Data
`fund_relationships.fund_lp_id text` referencing `fund_lps(id)` on delete set null, with a unique index where not null. Migration `2026-10-20c-investor-bridge.sql`, additive.

## 4. Tests
Only an owner or admin may invite; only from `in_talks`; exactly one investor record and a second try is refused; the record carries the name, mapped type and address and none of the investor's tax or identity details; the stage and the next step follow `onboarding_state` to `onboarding` and `active`; the email goes to the investor's address and a failed send leaves the record and stage in place; an investor cannot invite; another fund cannot; the fund's erasure and the registry still pass.

## 5. What was built, and what was not checked (2026-10-20)
- `lib/investor/bridge.ts` (`inviteToOnboard`, `syncStages`, `nextStepFor`); route `POST /api/fund/investor-requests/[id]/invite`; an "Invite to onboard" button on the fund's queue for a relationship in talks; the investor's request shows "Next: ..." in words; the daily cron also runs `syncStages`. Migration `2026-10-20c-investor-bridge.sql` applied to production and recorded.
- Tested: 7 integration tests (one record from the entity, no tax or identity details copied, the stage and invitation, only from `in_talks`, only the fund's own request, no address refused, a failed email keeps record and stage, the stage follows `opened` to `onboarding` and `countersigned` to `active`, both sides see it, the investor sees the next step). Full suite 2287 passing and `tsc` clean. The doc 60 invitation itself is covered by its own tests and is mocked here.
- **Not checked:** a real invitation email from this path, the pages in a browser, or the investor completing doc 60 through the emailed link. The investor reaches onboarding only through that link; opening it from their own account is P5 (it needs the claim of fund-added records).
