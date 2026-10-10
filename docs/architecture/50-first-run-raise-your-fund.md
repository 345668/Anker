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
Built in this slice: the state computation and its API (`GET /api/vc/raise-path`), the draft step (`POST /api/vc/raise-path/drafts`), the LP drafting prompt, and the home card. Tests cover the state steps from records, the prompt's refusal to invent facts, the bounds, idempotency, and that every draft is a pending proposal and nothing is sent. Not built: automatic shortlist in one click (step 3 uses the existing ranked-list screen).
