/**
 * Founder-side companion documents.
 *   1. Methodology  — describes the scoring model + funnel
 *   2. Outreach Plan — week-by-week plan tailored to the matched investors
 */

import {
  FounderMatchingResult,
  INVESTOR_SEGMENTS,
  INVESTOR_SEGMENT_META,
  StartupProfile,
} from "./founder-types"
import { FOUNDER_MAX_SCORE, FOUNDER_MIN_SCORE } from "./founder-scoring"
import { TIER_DEFINITIONS } from "./types"

export function buildFounderMethodology(
  result: FounderMatchingResult,
  startup: StartupProfile,
): string {
  const date = result.ranAt.slice(0, 10)
  return `# ${result.startupName} — Investor Pipeline Methodology

**Generated:** ${date}
**Engine:** Anker Founder Matchmaking v2

---

## Pipeline at a Glance

Scored ${result.totals.rawFirms.toLocaleString()} investment firms and ${result.totals.rawContacts.toLocaleString()} individual investors against ${result.startupName}'s round profile.

| Metric | Count |
|---|---|
| Investment firms scored | ${result.totals.rawFirms.toLocaleString()} |
| Individual investors scored | ${result.totals.rawContacts.toLocaleString()} |
| Qualified firms (post-filter) | ${result.totals.qualifiedFirms.toLocaleString()} |
| Qualified contacts (post-filter) | ${result.totals.qualifiedContacts.toLocaleString()} |
| Contacts with verified email | ${result.totals.contactsWithEmail.toLocaleString()} |
| Lead candidates | ${result.totals.leadCandidates.toLocaleString()} |
| Duplicates merged | ${result.totals.duplicatesMerged.toLocaleString()} |

---

## Startup Profile

| Field | Value |
|---|---|
| Name | ${startup.name} |
| One-liner | ${startup.oneLiner ?? "—"} |
| Stage | ${startup.stage} |
| Location | ${startup.location ?? "—"} |
| Primary sector | ${startup.primarySector ?? "—"} |
| All sectors | ${startup.sectors.join(", ")} |
| Round size | ${startup.askAmount ? `$${(startup.askAmount / 1e6).toFixed(1)}M` : "—"} |
| Pre-money | ${startup.preMoneyValuation ? `$${(startup.preMoneyValuation / 1e6).toFixed(1)}M` : "—"} |
| Ideal check | ${startup.checkSizeIdealMin || startup.checkSizeIdealMax
    ? `$${((startup.checkSizeIdealMin ?? 0) / 1e6).toFixed(1)}M – $${((startup.checkSizeIdealMax ?? 0) / 1e6).toFixed(1)}M`
    : "—"} |
| ARR | ${startup.arr ? `$${(startup.arr / 1e6).toFixed(2)}M` : "—"} |
| Team size | ${startup.teamSize ?? "—"} |

---

## Scoring Methodology

Each investor is scored across six weighted dimensions plus contact quality, using an absolute-points model.

### The Six Dimensions

| # | Dimension | Points | Logic |
|---|---|---|---|
| 1 | Sector fit | +8 to +25 | Primary-sector match: +25 · 3+ overlap: +18 · partial: +8 |
| 2 | Stage fit | +10 to +25 | Invests at stage: +25 · adjacent stage: +12 |
| 3 | Check size fit | +5 to +20 | Lead capacity: +20 · follow-on fit: +15 · ballpark: +5–10 |
| 4 | Geography | +1 to +15 | Local: +15 · same country: +10 · target region: +8 · intl: +4 |
| 5 | Investor type | +5 to +15 | VC w/ portfolio ≥ 20: +15 · CVC: +10 · FO: +8 · angel: +6–10 |
| 6 | Thesis signals | +5 to +15 | Bio mentions sector + lead-investor language |
| 7 | Contact quality | +2 to +3 | Verified email + LinkedIn (persons only) |

**Minimum threshold:** ≥ ${FOUNDER_MIN_SCORE}. **Max possible:** ${FOUNDER_MAX_SCORE}.

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

## Outreach Segments

| # | Segment | Firms | Contacts | Rationale |
|---|---|---|---|---|
${INVESTOR_SEGMENTS.slice()
  .sort((a, b) => INVESTOR_SEGMENT_META[a].priority - INVESTOR_SEGMENT_META[b].priority)
  .map(
    (s) =>
      `| ${INVESTOR_SEGMENT_META[s].priority} | ${INVESTOR_SEGMENT_META[s].label} | ${result.segmentCounts.firms[s]} | ${result.segmentCounts.contacts[s]} | ${INVESTOR_SEGMENT_META[s].rationale} |`,
  )
  .join("\n")}

---

*Engine: Anker Founder Matchmaking v2 · Run ${result.sessionId} · ${result.durationMs}ms*
`
}

export function buildFounderOutreachPlan(
  result: FounderMatchingResult,
  startup: StartupProfile,
): string {
  const top10 = result.firms.slice(0, 10)
  const leads = result.firms.filter((f) => f.tags.includes("LEAD")).slice(0, 5)
  const local = result.firms.filter((f) => f.tags.includes("LOCAL")).slice(0, 5)
  const ready = result.contacts.filter((c) => c.emailVerified).slice(0, 10)

  return `# ${result.startupName} — Investor Outreach Plan

**Date:** ${result.ranAt.slice(0, 10)}
**Round:** ${startup.stage}${startup.askAmount ? ` · $${(startup.askAmount / 1e6).toFixed(1)}M` : ""}
**Total qualified:** ${result.totals.qualifiedFirms} firms · ${result.totals.qualifiedContacts} contacts

---

## Top 10 Targets (overall)

${top10
  .map(
    (f, i) =>
      `${i + 1}. **${f.name}** (${f.score}/${FOUNDER_MAX_SCORE}) — ${f.type}, ${f.location}\n   ${f.whyMatch}`,
  )
  .join("\n\n")}

---

## Lead Candidates (top 5)

${leads.length === 0 ? "_None identified at current minScore. Try lowering the threshold._" : leads
  .map(
    (f, i) =>
      `${i + 1}. **${f.name}** (${f.score}) — check ${formatCheck(f.checkSizeMin ?? null, f.checkSizeMax ?? null)}, ${f.location}`,
  )
  .join("\n")}

---

## Local / Warm-intro Candidates

${local.length === 0 ? "_None local — outreach will be cold or via warm intros._" : local
  .map((f, i) => `${i + 1}. **${f.name}** — ${f.location} (${f.score})`)
  .join("\n")}

---

## Ready to Email — Top 10 Contacts

${ready
  .map(
    (c, i) =>
      `${i + 1}. **${c.name}** — ${c.title ?? c.type}, ${c.location}\n   ${c.email}\n   ${c.whyMatch}`,
  )
  .join("\n\n")}

---

## 4-Week Sprint Plan

### Week 1 — Warm intros + locals
- Send intro requests to mutual connections at the top 5 lead candidates
- Set in-person meetings with all local candidates within 2 weeks
- Tighten the deck based on feedback

### Week 2 — Lead candidates
- Cold-email top 10 lead candidates
- Track responses; re-rank pipeline based on engagement
- Schedule follow-up calls

### Week 3 — Stage match + sector fit
- Outreach to stage-match and sector-match segments
- Focus on those with portfolio velocity (active_recent segment)

### Week 4 — Follow-ons + international
- Backfill the round with follow-on candidates
- International outreach for opportunistic conversations
- Begin DD prep with most engaged investors

---

*Generated by Anker Founder Matchmaking v2 · Run ${result.sessionId}*
`
}

function formatCheck(min: number | null, max: number | null): string {
  if (!min && !max) return "unknown"
  const fmt = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}K`
  if (min && max && min !== max) return `${fmt(min)}–${fmt(max)}`
  return fmt((max ?? min) as number)
}
