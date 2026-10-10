# 50. First-run value for the fundraising design partners: "Raise your fund"

Status: spec and first slice built (section 8). Closes the first item of doc 37 §19.2. Companion data: `activation_by_workspace` (migration `2026-10-10b`).

## 1. The problem, with evidence (2026-10-10)
- Both design partners are **raising a fund** (doc 37 §7.1: a venture studio raising $40M, a consumer-AI seed fund raising $5M). Their job is the LP loop: find LPs, shortlist, write to them, approve, send, follow up.
- Production: their workspaces have **0 contacts**; across the platform **0 proposals** have ever been made and one agent run has finished. The only workspace that has sent mail is the founder's own.
- What a fund manager sees first (read in the browser on 2026-10-10, workspace "Anker Fund I"): **"Your fund, in focus."**, four cards (active deals 0, pipeline USD 0, closed deals 0), the call to action **"Review deal pipeline"** and quick starts for capital calls, investments and distributions. These are the tools of a fund that is *operating*. None of it helps a fund that is *raising*, and the main button leads to an empty list.
- The tools the partners need **all exist** and work: the fund profile and deck extraction, LP matching v2 (a ranked list), CRM import, drafting, the approval inbox, the send review. They are in five different places in the Investors menu and nothing joins them. The reference workspace shows the cost: it has a fund profile and 50 matched LPs and has gone no further.
- A second finding from the same data: the matched LP contacts are mostly **LinkedIn-only** (the 50 in the reference workspace have no email; across all LP-matched contacts about a quarter have an email). The first wave therefore has to treat LinkedIn as a real channel, and say so.

## 2. The journey (one thread, six steps, one next action)
| # | Step | Done when | The one action offered | Reuses |
|---|---|---|---|---|
| 1 | Describe the fund | an active fund profile with GP name, target raise and a thesis or sectors | open the fund profile (deck extraction fills it) | fund profiles, deck extractor |
| 2 | Find LPs | an LP matching run exists with results | run LP matching | LP matching v2 |
| 3 | Shortlist | at least 10 LP contacts are in the workspace pipeline | open the ranked list and add the top 25 | shortlist import, CRM |
| 4 | Write the first wave | drafts exist for the contacts, or proposals for them are waiting | **write drafts for the top contacts** (the new part) | shared draft writer, `outreach_save_drafts` (R1), approval inbox |
| 5 | Review and send | at least one send authorization approved | approve the drafts, then **Review and send** | inbox, send review (doc 46) |
| 6 | Follow up | a reply has been recorded, or the first wave is 7 days old | open replies and the pipeline | reply keeper, CRM |
Steps are derived from the records the product already writes; nothing new is stored to know where a workspace is. The first step not done is the **next action**.

## 3. Where it appears
- A **"Raise your fund" card at the top of the fund home**, shown while steps 1 to 5 are not complete. It shows the six steps, what is done, and one primary button for the next action. When the raise path is incomplete **and** the workspace has no deals, it replaces "Review deal pipeline" as the home's main call to action, so the first screen leads somewhere useful. The fund-operations quick starts stay below, unchanged.
- The card is for fund workspaces only. A company workspace keeps its existing founder setup.

## 4. The new part: writing the first wave for LPs
A fund manager pitching a prospective LP is not a founder pitching an investor, and the existing writer's prompt says "from a founder to an investor". The first wave therefore needs an LP framing, built from the **fund profile** (no separate sender profile is required):
- Sender context from the profile: fund name and number, GP name, target raise, minimum commitment, thesis, sectors, geography, GP commitment, track record.
- Each draft: a short email and a LinkedIn message for one LP, specific to what is known about them (type, location, why matched, any research summary), plain tone, no hype, one clear ask (a short call), and the fund's real figures only: **the writer may only use facts present in the profile**, and the prompt says so. Missing facts (for example no GP name) stop the step with a clear message instead of inventing a sign-off.
- **Proposals, not sends.** Each pair is a proposal of the `outreach_save_drafts` capability (R1), created in the partner's own name, so it appears in the Actions inbox with a diff and is applied only when approved. Nothing is sent by this step. This is the first real use of the action layer by a person, and it is the point where the approval habit starts.
- **Bounded:** at most 10 contacts per request, at most 25 per day per workspace, contacts with an email first (the email is the sendable channel), the model call capped by the existing AI spend limits, and a contact is skipped, never written to twice, if it already has a draft or a pending proposal.
- **Honest about the model:** a draft the model did not write (an unparseable answer) is not proposed; the contact is listed as skipped with the reason.

## 5. What the partner sees at each moment
Empty fund, first sign-in: the card with step 1 highlighted and a one-line promise ("about 15 minutes to a first wave you can approve"). After the profile: step 2 button. After matching: the ranked list and the shortlist action. After the shortlist: "Write drafts for the top 10". After drafting: the proposals waiting in Actions, with the count. After approval: Review and send. The same card, the same place, every time.

## 6. Measuring it
`activation_by_workspace` already has the first contact, first draft, first authorization, first send and first reply per workspace. The card's step times are the same facts. Target for the two partners: **time from workspace created to first approved send under one working day of their attention**; the SAIL Activation page shows it.

## 7. Not in scope
LP onboarding and the LP portal (doc 37 Phase 6); model-written follow-up sequences (dated sequences exist, doc 46 §18, but the first wave is the goal); enrichment of LPs missing an email (a separate agent job); changing LP matching itself; any founder-persona change.

## 8. Build status (2026-10-10)
**Built and live:** `lib/vc/raise-path.ts` (state from records), `GET /api/vc/raise-path`, `POST /api/vc/raise-path/drafts`, the LP prompt and its figure check (`lib/vc/lp-draft.ts`), the bounded wave writer (`lib/vc/lp-wave.ts`), and the "Raise your fund" card and hero on the fund home (`components/vc/raise-path-card.tsx`). The send step opens the existing send review on the card itself for the sender's own email drafts. 12 tests cover the steps from records, the prompt's refusal to invent facts (including a currency the profile does not state), the bounds (10 per request, 25 per day), idempotency, that every draft is a pending untrusted-source R1 proposal, and that nothing is sent.

**Walked through on production** (a throwaway fund workspace: a thin fund profile, 12 matched LPs, 6 with an email; sending paused; everything removed afterwards):
1. Home: "Raise your fund." with the card; "Complete the fund profile" named what was missing (GP name, target raise).
2. After the profile was completed: step 4 offered "Write drafts for the top LPs". One click: **10 drafts written in about 30 seconds**, each an email and a LinkedIn message, all waiting in Actions as one request with "Approve all". Nothing sent.
3. The drafts used only the fund's facts, with one fault found and fixed: the model added a "€" the profile does not state. The writer is now told not to, and a draft that adds a currency is refused.
4. "Approve all" saved 20 drafts (6 emails to LPs that have an address). The card then offered "Review and send 6 emails"; the review dialog opened on the card, showed the first message, and approving gave "Approved. 6 messages: 0 sent now" (the platform pause was on). The card read 5 of 5 steps.

**Not built yet:** a one-click "add the top 25 to my pipeline" (step 3 uses the existing ranked-list screen); the LinkedIn messages have no equivalent single review here (they go through the LinkedIn review queue); the fund profile is still filled on the matchmaking page (deck extraction fills it); follow-ups. **Not measured:** a real design partner using it.

## 9. Second slice, 2026-10-10: the parts the first walk-through left out
Three things stopped a partner from finishing on the card; each now has its own action there. A fourth, measurement, is already available.
1. **Shortlist in one click (step 3).** After matching, "Add the top 25 to your pipeline" takes the **best contact for each of the top firms** in the latest completed matching run for the fund profile (so a firm is not added twice), prefers a contact with an email, skips anyone already in the workspace (by directory id or email), puts them in a board named for the run, and says how many were added and how many were already there. Matching data shows about half of matched contacts have an email, so this brings the sendable channel with it; the 50 LinkedIn-only contacts in the reference workspace came from a spreadsheet export.
2. **LinkedIn messages (step 5).** The first-wave draft pair includes a LinkedIn message of at most 300 characters. LinkedIn does not allow a message to a stranger, but it does allow a connection request with a note of that length, so each saved message is queued as a **connection request with that note** in the LinkedIn Review Queue (status pending approval, never auto-approved) for the contacts that have a LinkedIn page. The card shows "LinkedIn: N messages ready" with a button that queues them, then "N waiting in the LinkedIn Review Queue". Approving there is the same governed path as before (the approval is recorded, caps and windows apply). Without a connected sender profile the actions wait; the card says so.
3. **The fund profile on the card (step 1).** A short form on the card (fund name, GP name, target raise, a two-to-three sentence thesis, sectors, geography, headquarters) creates the profile or fills only what was typed into the existing one; nothing else in the profile is overwritten. The full profile and deck extraction stay on the matchmaking page for the rest.
4. **Measurement.** `activation_by_workspace` and the SAIL Activation page already show each workspace's first contact, first draft, first approved send and first reply. Nothing new was needed; what is missing is a partner using it.
