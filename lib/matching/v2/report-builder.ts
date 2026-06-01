/**
 * Companion documents — methodology + meeting agenda.
 *
 * Anker doesn't have the `docx` package in deps, so these emit Markdown
 * (the in-app Documents area renders MD natively, and the user can
 * convert to DOCX with one click). The Markdown is structured to match
 * the SVS_Scoring_Methodology.docx layout: pipeline-at-a-glance, scoring
 * dimensions table, conversion funnel, sector matching, geographic
 * distribution, segmentation, conference summary.
 */

import {
  FundProfileV2,
  MatchingResultV2,
  OUTREACH_SEGMENTS,
  SEGMENT_META,
  TIER_DEFINITIONS,
} from "./types"
import {
  LP_TYPE_POINTS,
  MAX_THEORETICAL_SCORE,
  MIN_QUALIFICATION_SCORE,
} from "./scoring"

// ─── Methodology document ───────────────────────────────────────────────────
export function buildMethodologyMarkdown(
  result: MatchingResultV2,
  fund: FundProfileV2,
): string {
  const date = result.ranAt.slice(0, 10)
  const sectorList = (fund.primarySectors ?? fund.sectors).slice(0, 6).join(", ")

  return `# ${fund.name} — LP Pipeline Methodology

**Generated:** ${date}
**Engine:** Anker LP Matchmaking v2

---

## Pipeline at a Glance

Scored ${result.totals.rawFirms.toLocaleString()} investment firms and ${result.totals.rawContacts.toLocaleString()} individual investors from the Anker investor database against ${fund.name}'s investment thesis.

| Metric | Count |
|---|---|
| Investment firms scored | ${result.totals.rawFirms.toLocaleString()} |
| Individual investors scored | ${result.totals.rawContacts.toLocaleString()} |
| Qualified LP firms (post-filter) | ${result.totals.qualifiedFirms.toLocaleString()} |
| Qualified LP contacts (post-filter) | ${result.totals.qualifiedContacts.toLocaleString()} |
| Contacts with verified email | ${result.totals.contactsWithEmail.toLocaleString()} |
| Anchor candidates ($500M+ AUM) | ${result.totals.anchorCandidates.toLocaleString()} |
| Duplicates merged | ${result.totals.duplicatesMerged.toLocaleString()} |
| AI-enriched rationales | ${result.totals.aiEnrichmentsApplied.toLocaleString()} |

---

## Scoring Methodology

### Stage 1 — Entity filtering

From the raw databases, only entities that can deploy capital into a fund as LPs were retained. VCs, accelerators, and corporate venture arms were excluded because they invest in startups, not into funds. The qualifying LP types are: family offices, fund of funds, sovereign wealth funds, institutional investors (endowments, pensions), and asset/wealth managers.

For individual investors, angels were only included if their bio showed at least two verified HNW signals (CEO/founder with exits, managing partner, family office principal, serial entrepreneur with acquisition history, etc.).

### Stage 2 — Thesis-alignment scoring

Each qualified entity was scored across six weighted dimensions calibrated to ${fund.name}'s specific thesis: ${sectorList}, ${fund.headquartersLocation ? `headquartered in ${fund.headquartersLocation},` : ""} ${
  fund.targetRaise ? `targeting a $${(fund.targetRaise / 1e6).toFixed(0)}M raise` : ""
}.

### The Six Scoring Dimensions

| # | Dimension | Points | Scoring Logic |
|---|---|---|---|
| 1 | LP Type | +12 to +28 | Fund of Funds: +${LP_TYPE_POINTS.fund_of_funds} | Family Office: +${LP_TYPE_POINTS.family_office} | Sovereign Wealth: +${LP_TYPE_POINTS.sovereign_wealth} | Endowment/Pension: +${LP_TYPE_POINTS.endowment} | Asset/Wealth Manager: +${LP_TYPE_POINTS.asset_wealth_manager} | HNW Angel: +${LP_TYPE_POINTS.hnw_angel} |
| 2 | AUM Capacity | +5 to +25 | $1B+: +25 (anchor) | $500M-$1B: +20 (anchor) | $200M-$500M: +15 | $100M-$200M: +10 | $50M-$100M: +5 |
| 3 | Sector Alignment | +8 to +20 | Sweet-spot overlap (all primary sectors): +20 | 3+ sector match: +15 | 1-2 sector match: +8 |
| 4 | Geography | +1 to +22 | Local (HQ region match): +22 | Regional halo: +15 | US (other): +10 | Gulf/Canada: +6 | DACH/Italy: +5 | UK: +4 | Other intl: +1 |
| 5 | Thesis Signals | +8 to +18 | University/research: +18 | Venture studio: +15 | Emerging manager: +15 | Micro-PE/control: +12 | Acquisition focus: +8 |
| 6 | Contact Quality | +2 to +5 | Verified email: +5 | LinkedIn URL: +2 (individuals only) |

**Minimum qualification threshold:** score ≥ ${MIN_QUALIFICATION_SCORE}. Any entity scoring below was excluded.
**Maximum theoretical score:** ${MAX_THEORETICAL_SCORE} points.

---

## Tier Distribution

| Tier | Range | Firms | Contacts |
|---|---|---|---|
${TIER_DEFINITIONS.map(
  (t) =>
    `| ${t.label} | ${t.min}+ | ${result.tierCounts.firms[t.id]} | ${result.tierCounts.contacts[t.id]} |`,
).join("\n")}

---

## Conversion Funnel — Firms

| Stage | Count | Rate | Notes |
|---|---|---|---|
${result.funnel.firms
  .map((f) => `| ${f.label} | ${f.count.toLocaleString()} | ${f.pct}% | ${f.notes ?? ""} |`)
  .join("\n")}

## Conversion Funnel — Contacts

| Stage | Count | Rate | Notes |
|---|---|---|---|
${result.funnel.contacts
  .map((f) => `| ${f.label} | ${f.count.toLocaleString()} | ${f.pct}% | ${f.notes ?? ""} |`)
  .join("\n")}

---

## Pipeline Segmentation & Outreach Priority

The pipeline is organized into actionable segments, ordered by outreach priority:

| # | Segment | Firms | Contacts | Rationale |
|---|---|---|---|---|
${OUTREACH_SEGMENTS.slice()
  .sort((a, b) => SEGMENT_META[a].priority - SEGMENT_META[b].priority)
  .map(
    (s) =>
      `| ${SEGMENT_META[s].priority} | ${SEGMENT_META[s].label} | ${result.segmentCounts.firms[s]} | ${result.segmentCounts.contacts[s]} | ${SEGMENT_META[s].rationale} |`,
  )
  .join("\n")}

---

## Verbal Summary (60 seconds)

We scored ${result.totals.rawFirms.toLocaleString()} firms and ${result.totals.rawContacts.toLocaleString()} individuals from the Anker investor database against ${fund.name}'s specific thesis — not generic VC matching. The six-dimension scoring model was calibrated to ${
    fund.headquartersLocation ? `${fund.headquartersLocation}-based ` : ""
  }${fund.name} as a fund focused on ${sectorList}.

We filtered out everyone who can't write a check into a fund — no VCs, no accelerators, no corporate venture arms — keeping only family offices, fund of funds, sovereign wealth funds, endowments, and asset managers.

Then we scored each one across six dimensions: LP type, AUM capacity, sector alignment, geographic proximity, thesis-level signals like university research focus or venture studio familiarity, and contact quality.

The result: **${result.totals.qualifiedFirms.toLocaleString()} qualified LP firms** and **${result.totals.qualifiedContacts.toLocaleString()} qualified individual contacts**. **${result.totals.anchorCandidates.toLocaleString()}** of those firms have the AUM to write an anchor check. **${result.totals.contactsWithEmail.toLocaleString()}** contacts have verified email addresses and are ready for outreach today.

The pipeline is segmented, prioritized, and ready to execute.

---

## Deliverables Produced

1. **LP Pipeline Spreadsheet** (5-sheet Excel): Summary, Priority LP Firms, LP Contacts, International LPs, Ready to Contact.
2. **Methodology Document** (this file): Full breakdown of the 6-dimension scoring model, conversion funnel, and pipeline segmentation.
3. **Meeting Agenda** (companion document): Strategy meeting framework with role formalization, outreach coordination, and 30-day sprint plan.

---

*Engine: Anker LP Matchmaking v2 · Run ${result.sessionId} · ${result.durationMs}ms*
`
}

// ─── Meeting agenda ─────────────────────────────────────────────────────────
export function buildMeetingAgendaMarkdown(
  result: MatchingResultV2,
  fund: FundProfileV2,
): string {
  const date = result.ranAt.slice(0, 10)
  const local = result.segmentCounts.firms.local
  const anchor = result.segmentCounts.firms.anchor
  const em = result.segmentCounts.firms.emerging_manager
  const uni = result.segmentCounts.firms.university
  const intl = result.segmentCounts.firms.international
  const ready = result.totals.contactsWithEmail

  return `# ${fund.name} — LP Pipeline Strategy Meeting

**Date:** ${date}
**Duration:** 60 minutes
**Owner:** ${fund.name} GP team

---

## Pre-read Stats

- **${result.totals.qualifiedFirms.toLocaleString()}** qualified LP firms
- **${result.totals.qualifiedContacts.toLocaleString()}** qualified contacts (${ready.toLocaleString()} with email)
- **${anchor.toLocaleString()}** anchor candidates ($500M+ AUM)
- **${local.toLocaleString()}** local LPs
- **${em.toLocaleString()}** emerging-manager programs
- **${uni.toLocaleString()}** university endowments
- **${intl.toLocaleString()}** international LPs

---

## Section 1 — Pipeline Walkthrough (10 min)

- Review the funnel: ${result.totals.rawFirms.toLocaleString()} → ${result.totals.qualifiedFirms.toLocaleString()} firms.
- Walk through tier distribution and identify champion-tier targets for partner-led outreach.
- Confirm Fund I LP re-up list is accurate; flag missing entries.

## Section 2 — Local LPs (10 min)

- Top 10 local LPs by score.
- Assign in-person meeting owner for each.
- Set 2-week meeting target.

## Section 3 — Anchor Strategy (10 min)

- Top 20 anchor candidates ($500M+ AUM).
- Decide which need partner intro vs. cold outreach.
- Identify which require additional diligence material.

## Section 4 — Emerging Manager Programs (5 min)

- ${em} EM programs identified.
- Confirm DDQ readiness for each program's specific format.

## Section 5 — University Endowments (5 min)

- ${uni} endowment leads.
- Cross-reference with portfolio company university partners for warm intros.

## Section 6 — International Coverage (5 min)

- ${intl} international firms across DACH, Gulf, Italy, Canada, UK.
- Confirm coverage owners by region.
- Decide: in-scope or out-of-scope for next close?

## Section 7 — Outreach Sprint Plan (10 min)

- **Week 1:** Local + Fund I re-ups (in person where possible).
- **Week 2:** Anchor candidates (top 20) + EM programs.
- **Week 3:** University endowments + US FoFs.
- **Week 4:** International LPs (Philippe network handoff).

## Section 8 — Tooling & CRM (3 min)

- Confirm pipeline lives in Anker (status updates, notes, commitment amounts).
- Each owner updates daily.
- Weekly sync to recalibrate.

## Section 9 — Decisions Required (2 min)

- [ ] Approve segmentation priorities
- [ ] Confirm in-person meeting calendar for local LPs
- [ ] Approve outreach sequence for ready-to-contact list
- [ ] Lock international scope decision

---

*Generated by Anker LP Matchmaking v2 · Run ${result.sessionId}*
`
}
