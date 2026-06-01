/**
 * Built-in outreach template library — ships as code (no DB rows) and
 * is merged with the user's saved templates at /api/outreach/templates.
 *
 * Templates use the {{varName}} syntax so they don't collide with JS
 * template literals.  Recognised variables (renderTemplate substitutes,
 * unknown vars are left as [varName] to surface obvious gaps):
 *
 *   firstName    — investor first name
 *   fullName     — investor full name
 *   title        — investor title / role
 *   firmName     — investor's firm (or "their fund" if unknown)
 *   investorType — type label (VC, family office, etc.)
 *   founderName  — sender's name
 *   companyName  — sender's company
 *   oneLiner     — sender's one-line pitch
 *   traction     — a recent traction fact (picks first founder.facts)
 *   stage        — round / fund stage
 *   ask          — round ask (text like "$3M seed")
 *   calendarUrl  — sender's scheduling link
 *   whyMatch     — denormalised "why this matches" string from CRM
 *   recentPost   — pasted LinkedIn / blog post (optional)
 *   thesis       — sender's thesis
 *   location     — investor location
 */

export type TemplateChannel = "email" | "linkedin" | "multi"

export interface TemplateDef {
  id: string             // "builtin:cold_intro_v1"
  name: string
  category: string       // grouping label for the picker
  channel: TemplateChannel
  /** Email subject template — required for `channel === "email"`. */
  subject?: string
  body: string
  variables: string[]    // detected variables for substitution
  builtin: true
  description?: string
}

const all = (s: string): string[] =>
  Array.from(s.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1])

function mk(
  id: string, name: string, category: string, channel: TemplateChannel,
  body: string, subject?: string, description?: string,
): TemplateDef {
  const variables = Array.from(new Set([...all(body), ...(subject ? all(subject) : [])]))
  return { id: `builtin:${id}`, name, category, channel, subject, body, variables, builtin: true, description }
}

// ─── COLD INTRO (no prior relationship) ──────────────────────────────────
const COLD_INTRO_EMAIL = mk(
  "cold_intro_email_v1",
  "Cold intro — email",
  "Cold intro",
  "email",
  `Hi {{firstName}},

{{oneLiner}}. {{traction}}.

I noticed {{firmName}} backs {{stage}}-stage companies in this space — would you be open to a 15-minute call to compare notes? {{calendarUrl}}

Best,
{{founderName}}`,
  `{{companyName}} <> {{firmName}}`,
  "Tight cold email — one specific reason, one ask.",
)

const COLD_INTRO_DM = mk(
  "cold_intro_dm_v1",
  "Cold intro — LinkedIn DM",
  "Cold intro",
  "linkedin",
  `{{firstName}} — {{oneLiner}}. {{traction}}. Saw {{firmName}} backs this space. Open to a 15-min call?`,
  undefined,
  "Under 300 chars. One fact, one ask.",
)

const COLD_INTRO_POST_HOOK = mk(
  "cold_intro_post_hook_v1",
  "Cold intro — hook off a recent post",
  "Cold intro",
  "linkedin",
  `{{firstName}}, your post on {{recentPost}} mirrors what we're seeing building {{companyName}}. {{traction}}. Worth a 15-min walkthrough?`,
  undefined,
  "Personalize the hook with a pasted recent post topic.",
)

// ─── WARM INTRO REQUEST ──────────────────────────────────────────────────
const WARM_INTRO_REQUEST = mk(
  "warm_intro_request_v1",
  "Warm intro request — to a mutual",
  "Warm intro",
  "email",
  `Hi {{firstName}},

Quick favor — I'm raising for {{companyName}}: {{oneLiner}}. {{traction}}.

I noticed you're connected to {{fullName}} at {{firmName}}. Would you be comfortable making a one-line intro? Below is a forwardable snippet:

---
{{founderName}} runs {{companyName}} — {{oneLiner}}. They're raising {{ask}} and {{firmName}} fits their thesis because {{whyMatch}}. Happy to share the deck on request.
---

Thanks either way.
{{founderName}}`,
  `Quick intro ask — {{firmName}}`,
  "Includes a forwardable snippet so the mutual barely has to write.",
)

const WARM_INTRO_BLURB = mk(
  "warm_intro_blurb_v1",
  "Warm intro — forwardable blurb only",
  "Warm intro",
  "email",
  `{{founderName}} runs {{companyName}} — {{oneLiner}}. {{traction}}. Raising {{ask}}; {{firmName}} fits because {{whyMatch}}. Calendar: {{calendarUrl}}`,
  `Intro: {{companyName}} <> {{firmName}}`,
  "Just the snippet — paste into a mutual's email thread.",
)

// ─── FOLLOW-UP CADENCE ───────────────────────────────────────────────────
const FOLLOWUP_DAY3 = mk(
  "followup_day3_v1",
  "Follow-up — Day 3",
  "Follow-up",
  "email",
  `Hi {{firstName}},

Bumping this up — happy to keep it short. {{traction}}. {{calendarUrl}}

{{founderName}}`,
  `Re: {{companyName}} <> {{firmName}}`,
)

const FOLLOWUP_DAY7 = mk(
  "followup_day7_v1",
  "Follow-up — Day 7 (different angle)",
  "Follow-up",
  "email",
  `Hi {{firstName}},

Different angle — given {{firmName}}'s {{whyMatch}}, the most relevant slice of what we're doing is probably {{oneLiner}}. {{traction}}.

If a call's not the right format, would a 1-pager land better?

{{founderName}}`,
  `One more — {{companyName}}`,
)

const FOLLOWUP_DAY14 = mk(
  "followup_day14_v1",
  "Follow-up — Day 14 (close the loop)",
  "Follow-up",
  "email",
  `Hi {{firstName}},

Last note from me — happy to circle back when timing's better. If now isn't the moment, no reply needed.

{{founderName}}`,
  `Closing the loop — {{companyName}}`,
  "Polite drop-off. No further sends after this.",
)

const FOLLOWUP_DM = mk(
  "followup_dm_v1",
  "Follow-up — LinkedIn DM",
  "Follow-up",
  "linkedin",
  `{{firstName}} — bumping this up given {{traction}}. 15-min call worth your time?`,
)

// ─── PARTNER MEETING RECAP ───────────────────────────────────────────────
const RECAP_THANKS = mk(
  "recap_thanks_v1",
  "Meeting recap — thanks + recap",
  "Meeting recap",
  "email",
  `Hi {{firstName}},

Thanks for the time today. Quick recap:

- What we discussed: {{oneLiner}}, traction ({{traction}}), and how {{firmName}} typically engages at {{stage}}.
- Open items I'm sending over: deck, data room invite, founder references.
- Next step on your side: {{whyMatch}}

Let me know if anything's missing — happy to keep moving.

{{founderName}}`,
  `Recap + next steps — {{companyName}}`,
)

const RECAP_REFERENCES = mk(
  "recap_references_v1",
  "Meeting recap — references intro",
  "Meeting recap",
  "email",
  `Hi {{firstName}},

Per our call, sharing 3 references you can reach directly — I've cc'd each so feel free to reply-all:

- [Customer A — context]
- [Customer B — context]
- [Operator/advisor C — context]

Let me know what else would be useful.

{{founderName}}`,
  `References for {{companyName}}`,
  "Replace the [...] with real contacts before sending.",
)

const RECAP_DATAROOM = mk(
  "recap_dataroom_v1",
  "Meeting recap — data room send",
  "Meeting recap",
  "email",
  `Hi {{firstName}},

Sharing the data room — access link will arrive separately from the data-room tool. The folders are: deck, model, metrics, customer references, team.

Happy to walk you through anything by call.

{{founderName}}`,
  `Data room — {{companyName}}`,
)

// ─── RE-ENGAGEMENT ───────────────────────────────────────────────────────
const REENGAGE_QUARTER = mk(
  "reengage_quarter_v1",
  "Re-engagement — quarterly update",
  "Re-engagement",
  "email",
  `Hi {{firstName}},

Quick quarterly update on {{companyName}}: {{traction}}.

Closing the round soon — happy to share where we are if {{firmName}} still has appetite at {{stage}}.

{{founderName}}`,
  `Update — {{companyName}}`,
  "For people who passed-with-interest. Lead with the new data point.",
)

const REENGAGE_MILESTONE = mk(
  "reengage_milestone_v1",
  "Re-engagement — milestone trigger",
  "Re-engagement",
  "email",
  `Hi {{firstName}},

{{traction}} — wanted to flag this since {{firmName}}'s {{whyMatch}}.

Would now be a better moment to talk? {{calendarUrl}}

{{founderName}}`,
  `{{traction}} — {{companyName}}`,
)

const REENGAGE_INTRO_FROM_PORTFOLIO = mk(
  "reengage_intro_portfolio_v1",
  "Re-engagement — quoting a portfolio CEO",
  "Re-engagement",
  "email",
  `Hi {{firstName}},

We've been working closely with [PortfolioCo CEO] (your portfolio at {{firmName}}). They suggested I share where we got to since our last conversation: {{traction}}.

Worth a quick re-look?

{{founderName}}`,
  `[PortfolioCo] suggested I share an update`,
  "Replace [PortfolioCo CEO] / [PortfolioCo] before sending.",
)

// ─── MATERIAL SEND ───────────────────────────────────────────────────────
const MATERIAL_DECK = mk(
  "material_deck_v1",
  "Material — send the deck",
  "Material send",
  "email",
  `Hi {{firstName}},

As promised — attaching the deck for {{companyName}}. Key page is the traction slide.

Happy to take questions live: {{calendarUrl}}

{{founderName}}`,
  `Deck — {{companyName}}`,
)

const MATERIAL_ONEPAGER = mk(
  "material_onepager_v1",
  "Material — send a one-pager",
  "Material send",
  "email",
  `Hi {{firstName}},

Smaller bite: one-page summary of {{companyName}} attached. {{oneLiner}}. {{traction}}.

Reach out if it sparks anything.

{{founderName}}`,
  `One-pager — {{companyName}}`,
)

// ─── CLOSE / DECISION ────────────────────────────────────────────────────
const CLOSE_TERM_SHEET = mk(
  "close_term_sheet_v1",
  "Close — term sheet shared",
  "Close",
  "email",
  `Hi {{firstName}},

Quick heads-up: we have a term sheet circulating. If {{firmName}} wants to participate at {{stage}}, the window to confirm is short — happy to share the structure on a call this week.

{{founderName}}`,
  `Term sheet — {{companyName}}`,
  "Use sparingly. Don't bluff a term sheet you don't have.",
)

const CLOSE_LOST = mk(
  "close_lost_v1",
  "Close — polite no",
  "Close",
  "email",
  `Hi {{firstName}},

Closing the loop — we're going in a different direction for this round and won't be moving forward with {{firmName}}.

Really appreciated the time and the honest feedback — I'll keep you posted on milestones.

{{founderName}}`,
  `Update — {{companyName}}`,
)

const CLOSE_WON = mk(
  "close_won_v1",
  "Close — round closed announcement",
  "Close",
  "email",
  `Hi {{firstName}},

Quick note: we just closed the {{stage}} round at {{companyName}}. Thanks for the time you gave us along the way — putting you on the next update list since {{whyMatch}}.

{{founderName}}`,
  `Round closed — {{companyName}}`,
)

// ─── LP-SPECIFIC (matchmaking page) ──────────────────────────────────────
const LP_FAMILY_OFFICE = mk(
  "lp_family_office_v1",
  "LP — family office intro",
  "LP / family office",
  "email",
  `Dear {{firstName}},

I run {{companyName}} — {{thesis}}. Writing because {{firmName}} sits in the {{investorType}} bucket I most respect: patient capital with operator pedigree.

Our Fund {{stage}} is {{ask}}, anchor commitments are at [X]%, and {{traction}}.

If a quiet introductory call makes sense, happy to share the deck and references first.

{{founderName}}`,
  `{{companyName}} — quiet intro`,
  "LP voice. Email-only. No cold LinkedIn for family offices.",
)

const LP_FOF = mk(
  "lp_fof_v1",
  "LP — Fund-of-Funds intro",
  "LP / FoF",
  "email",
  `Dear {{firstName}},

{{companyName}} — {{thesis}}. Sharing because {{firmName}} backs emerging managers in this lane.

Fund {{stage}}, target {{ask}}. Differentiator: {{whyMatch}}.

Open to a 30-min introductory call?

{{founderName}}`,
  `{{companyName}} — intro for {{firmName}}`,
)

const LP_ENDOWMENT = mk(
  "lp_endowment_v1",
  "LP — endowment intro",
  "LP / endowment",
  "email",
  `Dear {{firstName}},

I'm writing on behalf of {{companyName}}.  Our thesis: {{thesis}}.

Given {{firmName}}'s {{whyMatch}}, I'd value a brief introductory call to share Fund {{stage}}'s structure and anchor list. Happy to send pre-read first.

{{founderName}}`,
  `Introductory call — {{companyName}}`,
  "Formal voice. Endowments expect a measured tone.",
)

const LP_OPERATOR_LP = mk(
  "lp_operator_lp_v1",
  "LP — operator-LP intro",
  "LP / operator-LP",
  "email",
  `Hi {{firstName}},

{{companyName}} here — {{thesis}}. You operate in the same space we invest in ({{whyMatch}}) and historically we've found operator-LPs add the most signal on diligence.

Open to a short call this week or next? {{calendarUrl}}

{{founderName}}`,
  `Operator-LP intro — {{companyName}}`,
)

const LP_UPDATE_RECAP = mk(
  "lp_update_recap_v1",
  "LP — quarterly update",
  "LP / update",
  "email",
  `Dear {{firstName}},

Fund {{stage}} quarterly update — short version:

- Deployments: [N] new investments this quarter
- Reserves: deployed against [X]
- Portfolio milestones: [highlights]
- Next quarter: [focus]

Happy to share the full report on request.

{{founderName}}`,
  `Q{{stage}} update — {{companyName}}`,
  "Use for existing LPs or warm prospects you're nurturing.",
)

export const BUILTIN_TEMPLATES: TemplateDef[] = [
  COLD_INTRO_EMAIL, COLD_INTRO_DM, COLD_INTRO_POST_HOOK,
  WARM_INTRO_REQUEST, WARM_INTRO_BLURB,
  FOLLOWUP_DAY3, FOLLOWUP_DAY7, FOLLOWUP_DAY14, FOLLOWUP_DM,
  RECAP_THANKS, RECAP_REFERENCES, RECAP_DATAROOM,
  REENGAGE_QUARTER, REENGAGE_MILESTONE, REENGAGE_INTRO_FROM_PORTFOLIO,
  MATERIAL_DECK, MATERIAL_ONEPAGER,
  CLOSE_TERM_SHEET, CLOSE_LOST, CLOSE_WON,
  LP_FAMILY_OFFICE, LP_FOF, LP_ENDOWMENT, LP_OPERATOR_LP, LP_UPDATE_RECAP,
]

export const TEMPLATE_CATEGORIES = Array.from(
  new Set(BUILTIN_TEMPLATES.map((t) => t.category)),
)

/** Substitute {{var}} placeholders.  Unknown vars become "[var]" so the
 *  user sees obvious gaps before sending.  Null-safe. */
export function renderTemplate(s: string, vars: Record<string, string | null | undefined>): string {
  if (!s) return ""
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k]
    if (v == null || v === "") return `[${k}]`
    return String(v)
  })
}

/** All variables a template references (subject + body, deduped). */
export function templateVariables(t: { subject?: string; body: string }): string[] {
  const set = new Set<string>()
  for (const m of (t.subject ?? "").matchAll(/\{\{(\w+)\}\}/g)) set.add(m[1])
  for (const m of (t.body ?? "").matchAll(/\{\{(\w+)\}\}/g)) set.add(m[1])
  return [...set]
}

/** Build the variable map used by renderTemplate from a CRM-member row
 *  + the sender's founder context.  Missing values are left undefined so
 *  the [var] placeholder surfaces in the rendered output. */
export function buildTemplateVars(input: {
  member: {
    displayName?: string | null
    displayTitle?: string | null
    displayType?: string | null
    displayLocation?: string | null
    whyMatch?: string | null
    researchSummary?: string | null
  }
  founder?: {
    founderName?: string | null
    companyName?: string | null
    oneLiner?: string | null
    facts?: string[] | null
    calendarUrl?: string | null
    currency?: string | null
  } | null
  extras?: { stage?: string; ask?: string; thesis?: string; recentPost?: string } | null
}): Record<string, string | undefined> {
  const m = input.member ?? {}
  const f = input.founder ?? {}
  const x = input.extras ?? {}
  const firstName = (m.displayName ?? "").trim().split(/\s+/)[0] || undefined
  const traction = (f.facts ?? [])[0] || undefined
  const firmName = (m.displayName ?? "").trim() || undefined
  return {
    firstName,
    fullName: m.displayName ?? undefined,
    title: m.displayTitle ?? undefined,
    firmName,
    investorType: m.displayType ?? undefined,
    founderName: f.founderName ?? undefined,
    companyName: f.companyName ?? undefined,
    oneLiner: f.oneLiner ?? undefined,
    traction,
    calendarUrl: f.calendarUrl ?? undefined,
    whyMatch: m.whyMatch ?? undefined,
    location: m.displayLocation ?? undefined,
    recentPost: x.recentPost,
    stage: x.stage,
    ask: x.ask,
    thesis: x.thesis,
  }
}
