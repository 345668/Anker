/**
 * Campaign curate engine — productized from the one-off SVS scripts.
 *
 * Three responsibilities, all deterministic (no AI dependency required):
 *
 *   1. tieredCrawl()      — for each member with a usable email domain,
 *                            fetch the firm's landing page (and a few
 *                            common sub-paths for the deep tier),
 *                            extract title / meta description / a
 *                            focus-laden sentence / any on-page emails.
 *                            Concurrency 4, 10s timeout per request.
 *
 *   2. buildMessage()     — render a relationship-building first-touch
 *                            email + (for angels) a LinkedIn DM, routed
 *                            by LP type.  Voice + routing rules ported
 *                            verbatim from the SVS playbook:
 *                              Family Office   → email only
 *                              Angel / HNW     → LinkedIn DM + email
 *                              Institutional / SWF / FoF / Endowment → formal email only
 *                              Hedge / public market                  → measured email only
 *
 *   3. buildCuratedWorkbook() + buildCuratedBrief() —
 *                            6-sheet XLSX and DOCX brief assembled from
 *                            campaign members + crawl results + sender
 *                            context.
 *
 * Sender context is parameterized: callers pass whichever founder /
 * fund facts they have.  Sane defaults fill in the rest so the
 * templates still read naturally even on a thin profile.
 */

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
} from "docx"
import * as XLSX from "xlsx"

// ─── shared types ─────────────────────────────────────────────────────────

export interface CurateMember {
  /** outreach_campaign_members.id */
  id: string
  /** crm_entries.id */
  crmEntryId: string
  displayName: string
  displayTitle?: string | null
  displayEmail?: string | null
  displayLinkedin?: string | null
  displayLocation?: string | null
  displayType?: string | null
  displayScore?: number | null
  displayTier?: string | null
  whyMatch?: string | null
  /** Existing CRM research cache (we'll overwrite this for crawled rows). */
  researchSummary?: string | null
  researchUrl?: string | null
  sectorsCsv?: string | null
  status?: string | null
}

export interface SenderContext {
  founderName?: string
  founderTitle?: string
  founderLinkedin?: string
  companyName?: string
  companyUrl?: string
  companyHq?: string
  /** One-line pitch — used in Angel + Family Office openers. */
  oneLiner?: string
  /** Bulleted proof points — first 1–2 surface in messages. */
  facts?: string[]
  /** Sector keywords the campaign prioritises (e.g. SVS uses Health, Biotech, AI, …). */
  prioritySectors?: string[]
  /** Vehicle / size / minimum — used in Institutional emails. */
  vehicle?: string
  target?: string
  minimum?: string
  calendarUrl?: string
}

export interface CrawlResult {
  memberId: string
  crmEntryId: string
  domain: string | null
  url: string | null
  ok: boolean
  status?: number
  error: string | null
  title: string | null
  description: string | null
  /** First focus-laden sentence pulled from the combined site text. */
  focus: string | null
  /** Page emails found beyond the row's primary contact. */
  emails: string[]
  /** Sub-paths visited during the deep crawl. */
  paths: string[]
  tier: 1 | 2 | 3
}

export type LpBucket = "family_office" | "angel" | "institutional" | "hedge" | "other"

export interface BuiltMessage {
  subject: string
  body: string
  /** Under 300 chars; null for buckets that don't get cold LinkedIn DMs. */
  dm: string | null
  primaryChannel: "email" | "linkedin"
  voiceNotes: string
  bucket: LpBucket
}

// ─── crawl ────────────────────────────────────────────────────────────────

const GENERIC_DOMAINS = new Set([
  "gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com",
  "me.com", "msn.com", "live.com", "aol.com", "protonmail.com", "pm.me", "mac.com",
])
const DEEP_SUBPATHS = [
  "/about", "/team", "/contact", "/portfolio",
  "/investment", "/thesis", "/approach", "/strategy",
]
const CRAWL_TIMEOUT_MS = 10_000
const CRAWL_CONCURRENCY = 4

function emailDomainOf(email: string | null | undefined): string | null {
  if (!email) return null
  const m = String(email).match(/@([\w.-]+)/)
  if (!m) return null
  const d = m[1].toLowerCase()
  return GENERIC_DOMAINS.has(d) ? null : d
}

function siteUrlFromDomain(domain: string): string {
  return `https://www.${domain.replace(/^www\./, "")}`
}

function stripHtml(html: string): string {
  if (!html) return ""
  let s = String(html)
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
  s = s.replace(/<[^>]+>/g, " ")
  s = decodeEntities(s)
  s = s.replace(/\s+/g, " ").trim()
  return s
}
function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&apos;/g, "'").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
}
function extractTitle(html: string): string | null {
  const m = (html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? decodeEntities(m[1].trim()).slice(0, 200) : null
}
function extractMetaDescription(html: string): string | null {
  const m = (html || "").match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || (html || "").match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
  return m ? decodeEntities(m[1]).trim().slice(0, 600) : null
}
function extractEmails(text: string): string[] {
  const set = new Set<string>()
  const rx = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  const m = String(text || "").matchAll(rx)
  for (const x of m) {
    const e = x[0].toLowerCase()
    if (!/(example|sentry|wixpress|jpg|png|svg)/.test(e)) set.add(e)
  }
  return [...set].slice(0, 10)
}
function extractFocusBlurb(text: string): string | null {
  const SIGNALS = ["invest", "thesis", "focus", "stage", "sector", "portfolio", "fund", "family office", "capital", "wealth"]
  const sentences = (text || "").split(/(?<=[.!?])\s+/).slice(0, 80)
  for (const s of sentences) {
    const l = s.toLowerCase()
    if (s.length > 60 && s.length < 360 && SIGNALS.some((k) => l.includes(k))) return s.trim()
  }
  return null
}

async function fetchOne(url: string): Promise<{ ok: boolean; status: number; finalUrl: string; html: string; title: string | null; error: string | null }> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), CRAWL_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    })
    if (!res.ok) return { ok: false, status: res.status, finalUrl: res.url, html: "", title: null, error: `HTTP ${res.status}` }
    const html = await res.text()
    return { ok: true, status: res.status, finalUrl: res.url, html, title: extractTitle(html), error: null }
  } catch (e: any) {
    return { ok: false, status: 0, finalUrl: url, html: "", title: null, error: e?.name === "AbortError" ? "timeout" : (e?.message ?? "error") }
  } finally {
    clearTimeout(t)
  }
}

async function crawlOne(member: CurateMember, tier: 1 | 2 | 3): Promise<CrawlResult> {
  const domain = emailDomainOf(member.displayEmail)
  if (!domain || tier === 3) {
    return {
      memberId: member.id, crmEntryId: member.crmEntryId,
      domain, url: null, ok: false,
      error: tier === 3 ? "tier3-no-crawl" : "generic-or-missing-email-domain",
      title: null, description: null, focus: null, emails: [], paths: [], tier,
    }
  }
  const base = siteUrlFromDomain(domain)
  const root = await fetchOne(base)
  if (!root.ok) {
    return {
      memberId: member.id, crmEntryId: member.crmEntryId,
      domain, url: base, ok: false, status: root.status, error: root.error,
      title: null, description: null, focus: null, emails: [], paths: ["/"], tier,
    }
  }

  let combinedText = stripHtml(root.html).slice(0, 12_000)
  const description = extractMetaDescription(root.html)
  const paths = ["/"]

  if (tier === 1) {
    // Try a few candidate sub-paths.  One 404 doesn't fail the whole crawl.
    for (const p of DEEP_SUBPATHS) {
      try {
        const u = new URL(p, root.finalUrl).toString()
        const r = await fetchOne(u)
        paths.push(p)
        if (r.ok && r.html) {
          const t = stripHtml(r.html)
          if (t && t.length > 200) combinedText += "\n\n" + t.slice(0, 8_000)
        }
      } catch {/* swallow */}
      if (combinedText.length > 30_000) break
    }
  }

  const text = combinedText.slice(0, 40_000)
  return {
    memberId: member.id, crmEntryId: member.crmEntryId,
    domain, url: root.finalUrl, ok: true, status: root.status, error: null,
    title: root.title, description,
    focus: extractFocusBlurb(text),
    emails: extractEmails(text),
    paths, tier,
  }
}

async function pool<T, R>(items: T[], concurrency: number, worker: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let i = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = i++
      if (idx >= items.length) return
      results[idx] = await worker(items[idx], idx)
    }
  }))
  return results
}

export interface TieredCrawlOpts {
  /** How many of the highest-score members go through the deep crawl. */
  tier1Deep: number
  /** How many of the next members go through the light landing-only crawl. */
  tier2Light: number
}

export async function tieredCrawl(
  members: CurateMember[],
  opts: TieredCrawlOpts,
): Promise<{ results: CrawlResult[]; stats: { ok: number; fail: number; no_domain: number; tier1: number; tier2: number; tier3: number } }> {
  // Sort highest score first; assign tiers by position.
  const sorted = [...members].sort((a, b) => (Number(b.displayScore) || 0) - (Number(a.displayScore) || 0))
  const cutoff1 = Math.max(0, opts.tier1Deep)
  const cutoff2 = cutoff1 + Math.max(0, opts.tier2Light)
  const withTier = sorted.map((m, i) => ({ m, tier: (i < cutoff1 ? 1 : i < cutoff2 ? 2 : 3) as 1 | 2 | 3 }))

  const results = await pool(withTier, CRAWL_CONCURRENCY, async ({ m, tier }) => crawlOne(m, tier))
  const stats = { ok: 0, fail: 0, no_domain: 0, tier1: cutoff1, tier2: Math.min(opts.tier2Light, Math.max(0, sorted.length - cutoff1)), tier3: Math.max(0, sorted.length - cutoff2) }
  for (const r of results) {
    if (r.ok) stats.ok++
    else if (r.error === "generic-or-missing-email-domain") stats.no_domain++
    else if (r.error === "tier3-no-crawl") {/* not counted */}
    else stats.fail++
  }
  return { results, stats }
}

// ─── messages (per-LP-type, relationship-first) ───────────────────────────

function firstNameOf(name: string | null | undefined): string {
  if (!name) return ""
  return String(name).split(",")[0].trim().split(/\s+/)[0]
}
function locationCityOf(loc: string | null | undefined): string | null {
  if (!loc) return null
  const c = String(loc).split(",")[0].trim()
  return c || null
}
function sectorOverlapOf(sectorsCsv: string | null | undefined, priority: string[]): string | null {
  if (!sectorsCsv || !priority?.length) return null
  const sectors = String(sectorsCsv).split(",").map((s) => s.trim()).filter(Boolean)
  const hits = sectors.filter((s) => priority.some((p) => s.toLowerCase().includes(p.toLowerCase()))).slice(0, 2)
  return hits.length ? hits.join(" + ") : null
}

export function classifyLpType(t: string | null | undefined): LpBucket {
  const s = (t ?? "").toLowerCase()
  if (s.includes("family office")) return "family_office"
  if (s.includes("angel")) return "angel"
  if (/endowment|sovereign|fund of funds|institutional|\bfof\b/i.test(s)) return "institutional"
  if (/hedge|public market|credit|activist/i.test(s)) return "hedge"
  return "other"
}

function commonOpenerLine(member: CurateMember, priority: string[], companyName: string): string {
  const sectorHit = sectorOverlapOf(member.sectorsCsv, priority)
  if (sectorHit) return `Your interest in ${sectorHit} sits squarely where we tend to spend most of our time at ${companyName}.`
  const city = locationCityOf(member.displayLocation)
  if (city) return `I came across your name while mapping investors based in ${city} who think about formation-stage opportunities.`
  return `I came across your name while mapping investors who think differently about formation-stage opportunities.`
}

function senderSignoff(s: SenderContext, formal: boolean): string {
  const closer = formal ? "With respect," : "Best,"
  const lines = [
    closer,
    s.founderName ?? "",
    s.founderTitle ?? "",
  ].filter(Boolean)
  if (s.founderLinkedin) lines.push(s.founderLinkedin)
  if (s.companyUrl) lines.push(s.companyUrl)
  return lines.join("\n")
}

function firstFact(s: SenderContext): string | null {
  return (s.facts ?? []).filter(Boolean)[0] ?? null
}

export function buildMessage(member: CurateMember, sender: SenderContext): BuiltMessage {
  const bucket = classifyLpType(member.displayType)
  const company = sender.companyName ?? "our studio"
  const priority = sender.prioritySectors ?? []
  const fn = firstNameOf(member.displayName) || "there"
  const opener = commonOpenerLine(member, priority, company)
  const oneLiner = sender.oneLiner ?? `${company} commercialises early-stage opportunities through a hands-on operating model.`
  const traction = firstFact(sender)

  if (bucket === "family_office") {
    const subject = `Brief introduction — ${company}`
    const body =
`Dear ${fn},

${opener}

I'm ${sender.founderName ?? "—"}, ${sender.founderTitle ?? "—"}. Quick context, not a pitch: ${oneLiner}${traction ? `  ${traction}.` : ""}

I'm not writing to ask for a commitment. I'd value a 20–30 minute introductory call to learn how you think about formation-stage allocations and whether the model is one your family is comfortable looking at over time. Even if the answer is "not for us right now", the relationship would be valuable.

If a call doesn't fit, I'm equally happy to send a short summary and stay in touch quietly.

Warmly,
${[sender.founderName, sender.founderTitle, sender.founderLinkedin, sender.companyUrl].filter(Boolean).join("\n")}`
    return { subject, body, dm: null, primaryChannel: "email", voiceNotes: "family-office: quiet, credibility-first, no LinkedIn DM", bucket }
  }

  if (bucket === "angel") {
    const subject = `Brief introduction — ${company}`
    const body =
`Hi ${fn},

${opener}

I'm ${sender.founderName ?? "—"}, ${sender.founderTitle ?? "—"}. Short version: ${oneLiner}${traction ? `  ${traction}.` : ""}

I'm not writing to ask for a commitment. I'd value a 20–30 minute call to compare notes on how you're thinking about formation-stage exposure right now.

If the timing is off, no pressure — happy to send a short summary and circle back.

${senderSignoff(sender, false)}`
    const sectorHit = sectorOverlapOf(member.sectorsCsv, priority)
    const city = locationCityOf(member.displayLocation)
    const dmHook = sectorHit
      ? `noticed ${sectorHit} is in your focus`
      : city
        ? `mapping investors based in ${city} who think about formation-stage`
        : `mapping investors who think differently about formation-stage`
    const dm = `Hi ${fn} — ${sender.founderName ?? "Philippe"} here${sender.founderTitle ? ", " + sender.founderTitle : ""}. I ${dmHook}. ${oneLiner.slice(0, 110)} Open to a 20-min call? No ask attached.`
    return { subject, body, dm: dm.slice(0, 300), primaryChannel: "linkedin", voiceNotes: "angel: warm + conversational, LinkedIn-first with email mirror", bucket }
  }

  if (bucket === "institutional") {
    const subject = `Introduction — ${company}`
    const vehicleLine = [sender.vehicle, sender.target ? `target ${sender.target}` : "", sender.minimum ? `minimum ${sender.minimum}` : ""].filter(Boolean).join("; ")
    const body =
`Dear ${fn},

${opener}

I'm ${sender.founderName ?? "—"}, ${sender.founderTitle ?? "—"}. ${oneLiner}${traction ? `  ${traction}.` : ""}${vehicleLine ? `  Vehicle context: ${vehicleLine}.` : ""}

I'm not writing with a specific ask. I would value an introductory 30-minute call to share more of the model and learn how your team thinks about formation-stage exposure. If a call isn't appropriate at this stage I'm equally glad to share a short summary on request and remain in dialogue.

With respect,
${[sender.founderName, sender.founderTitle, sender.founderLinkedin, sender.companyUrl].filter(Boolean).join("\n")}`
    return { subject, body, dm: null, primaryChannel: "email", voiceNotes: "institutional: formal, no LinkedIn DM", bucket }
  }

  // hedge / other
  const subject = `Brief introduction — ${company}`
  const body =
`Dear ${fn},

${opener}

I'm ${sender.founderName ?? "—"}, ${sender.founderTitle ?? "—"}. Short version: ${oneLiner}${traction ? `  ${traction}.` : ""}

I'd value a 20–30 minute call if you're open — not to pitch, but to share the model and learn how you think about formation-stage exposure.

${senderSignoff(sender, false)}`
  return { subject, body, dm: null, primaryChannel: "email", voiceNotes: "hedge / public-market: measured, no LinkedIn DM", bucket }
}

// ─── XLSX builder ─────────────────────────────────────────────────────────

export interface BuildWorkbookInput {
  campaignName: string
  members: CurateMember[]
  crawls: Map<string, CrawlResult>
  messages: Map<string, BuiltMessage>
  sender: SenderContext
  tierOpts: TieredCrawlOpts
  generatedAt?: Date
}

export function buildCuratedWorkbook(input: BuildWorkbookInput): Buffer {
  const { campaignName, members, crawls, messages, sender, tierOpts } = input
  const generatedAt = input.generatedAt ?? new Date()

  // Sort + tier assignment (mirrors tieredCrawl).
  const sorted = [...members].sort((a, b) => (Number(b.displayScore) || 0) - (Number(a.displayScore) || 0))
  const tierOf = new Map<string, 1 | 2 | 3>()
  sorted.forEach((m, i) => tierOf.set(m.id, (i < tierOpts.tier1Deep ? 1 : i < tierOpts.tier1Deep + tierOpts.tier2Light ? 2 : 3) as 1 | 2 | 3))

  const byType: Record<string, number> = {}
  for (const m of members) byType[m.displayType || "Unknown"] = (byType[m.displayType || "Unknown"] || 0) + 1
  const okCount = [...crawls.values()].filter((r) => r.ok).length
  const failCount = [...crawls.values()].filter((r) => !r.ok && r.error !== "generic-or-missing-email-domain" && r.error !== "tier3-no-crawl").length
  const noDom = [...crawls.values()].filter((r) => r.error === "generic-or-missing-email-domain").length

  // ── Sheet 1 — Overview
  const overview: any[][] = [
    ["Campaign", campaignName],
    ["Generated", generatedAt.toISOString().slice(0, 10)],
    ["Sender", `${sender.founderName ?? "—"} (${sender.founderTitle ?? "—"})`],
    ["Sender LinkedIn", sender.founderLinkedin ?? "—"],
    [],
    ["Cohort"],
    ["Total members", members.length],
    ["With email", members.filter((m) => m.displayEmail).length],
    ["With LinkedIn", members.filter((m) => m.displayLinkedin).length],
    [],
    ["By LP type"],
    ...Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => [`  ${k}`, v]),
    [],
    ["Crawl tiers"],
    [`  Tier 1 (top ${tierOpts.tier1Deep}, deep)`, tierOpts.tier1Deep],
    [`  Tier 2 (next ${tierOpts.tier2Light}, light)`, Math.min(tierOpts.tier2Light, Math.max(0, members.length - tierOpts.tier1Deep))],
    [`  Tier 3 (rest, metadata only)`, Math.max(0, members.length - tierOpts.tier1Deep - tierOpts.tier2Light)],
    [],
    ["Crawl results"],
    ["  Sites reached", okCount],
    ["  Crawl failed / blocked", failCount],
    ["  Generic email domain (no firm site)", noDom],
  ]
  const wsOverview = XLSX.utils.aoa_to_sheet(overview)
  wsOverview["!cols"] = [{ wch: 40 }, { wch: 70 }]

  // ── Sheet 2 — Curated profiles
  const profileHeader = [
    "#", "Tier", "Score", "Name", "Title/Role", "LP Type", "Location",
    "Email", "LinkedIn", "Sectors", "Why match",
    "Inferred Website", "Crawl Status", "Website Title", "Investment Focus (extracted)",
    "Meta Description", "Other Emails on Site", "Crawl Paths Tried",
  ]
  const profileRows: any[][] = [profileHeader]
  sorted.forEach((m, i) => {
    const cr = crawls.get(m.id)
    profileRows.push([
      i + 1,
      tierOf.get(m.id) ?? 3,
      m.displayScore ?? "",
      m.displayName,
      m.displayTitle ?? "",
      m.displayType ?? "",
      m.displayLocation ?? "",
      m.displayEmail ?? "",
      m.displayLinkedin ?? "",
      m.sectorsCsv ?? "",
      m.whyMatch ?? "",
      cr?.url ?? "",
      cr ? (cr.ok ? "ok" : cr.error ?? "fail") : "no-crawl",
      cr?.title ?? "",
      cr?.focus ?? "",
      cr?.description ?? "",
      (cr?.emails ?? []).join("; "),
      (cr?.paths ?? []).join("; "),
    ])
  })
  const wsProfiles = XLSX.utils.aoa_to_sheet(profileRows)
  wsProfiles["!cols"] = [
    { wch: 5 }, { wch: 5 }, { wch: 6 }, { wch: 24 }, { wch: 32 }, { wch: 18 }, { wch: 28 },
    { wch: 36 }, { wch: 40 }, { wch: 28 }, { wch: 42 },
    { wch: 32 }, { wch: 12 }, { wch: 32 }, { wch: 60 },
    { wch: 50 }, { wch: 36 }, { wch: 28 },
  ]
  ;(wsProfiles as any)["!freeze"] = { ySplit: 1 }

  // ── Sheet 3 — LinkedIn DMs (angels with LinkedIn URL only)
  const dmRows: any[][] = [["#", "Name", "LP Type", "LinkedIn URL", "DM (first touch)", "Chars", "Voice notes"]]
  sorted.forEach((m, i) => {
    const gen = messages.get(m.id)
    if (!gen?.dm) return
    if (!m.displayLinkedin) return
    dmRows.push([i + 1, m.displayName, m.displayType ?? "", m.displayLinkedin, gen.dm, gen.dm.length, gen.voiceNotes])
  })
  const wsDMs = XLSX.utils.aoa_to_sheet(dmRows)
  wsDMs["!cols"] = [{ wch: 5 }, { wch: 24 }, { wch: 18 }, { wch: 40 }, { wch: 90 }, { wch: 7 }, { wch: 50 }]

  // ── Sheet 4 — Email drafts
  const emailRows: any[][] = [["#", "Name", "LP Type", "Email", "Subject", "Body", "Primary channel", "Voice notes"]]
  sorted.forEach((m, i) => {
    const gen = messages.get(m.id)
    if (!gen) return
    emailRows.push([i + 1, m.displayName, m.displayType ?? "", m.displayEmail ?? "", gen.subject, gen.body, gen.primaryChannel, gen.voiceNotes])
  })
  const wsEmails = XLSX.utils.aoa_to_sheet(emailRows)
  wsEmails["!cols"] = [{ wch: 5 }, { wch: 24 }, { wch: 18 }, { wch: 36 }, { wch: 58 }, { wch: 110 }, { wch: 14 }, { wch: 50 }]

  // ── Sheet 5 — Methodology
  const method: any[][] = [
    [`Methodology — ${campaignName}`], [],
    ["1. Cohort source"],
    [`This sheet is generated directly from the campaign's planned + drafted members in the Anker outreach engine.`],
    [],
    ["2. Tiering"],
    [`Members are sorted by displayScore descending. Tier 1 = top ${tierOpts.tier1Deep} (deep crawl of`],
    [`landing + /about, /team, /contact, /portfolio, /investment, /thesis, /approach, /strategy);`],
    [`Tier 2 = next ${tierOpts.tier2Light} (single-page landing crawl); Tier 3 = rest (no crawl).`],
    [],
    ["3. Enrichment"],
    [`The crawler infers each member's primary website from their email domain, skipping generic`],
    [`providers (gmail, outlook, yahoo, icloud, etc.).  For each reachable site we extract:`],
    [`  • <title> and <meta description>`],
    [`  • the first focus-laden sentence containing investment / thesis / portfolio / sector terms`],
    [`  • on-page email addresses (additional contact discovery)`],
    [`  • the sub-paths visited`],
    [],
    ["4. Voice and routing"],
    [`First contact is relationship-building, not a fund pitch. Each message references one specific`],
    [`signal (sector overlap → geography → neutral) and asks for a 20–30 minute introductory call`],
    [`without any commitment ask attached.`],
    [],
    ["Routing by LP type:"],
    [`  • Family Office                     → email only, no cold LinkedIn DM`],
    [`  • Angel / HNW                        → LinkedIn DM + email mirror`],
    [`  • Institutional / Endowment / SWF / FoF → formal email only`],
    [`  • Hedge / public market / credit     → measured email only`],
    [],
    ["5. Cadence (suggested)"],
    [`Day 0   — first contact (this workbook)`],
    [`Day 3   — light bump if no reply`],
    [`Day 10  — different-angle follow-up`],
    [`Day 24  — close-the-loop`],
    [`Day 90  — quarterly re-engagement`],
  ]
  const wsMethod = XLSX.utils.aoa_to_sheet(method)
  wsMethod["!cols"] = [{ wch: 110 }]

  // ── Sheet 6 — Sender brief
  const sb: any[][] = [
    ["Sender Brief"], [],
    ["Name", sender.founderName ?? "—"],
    ["Role", sender.founderTitle ?? "—"],
    ["LinkedIn", sender.founderLinkedin ?? "—"],
    ["Company", sender.companyName ?? "—"],
    ["Company URL", sender.companyUrl ?? "—"],
    ["Company HQ", sender.companyHq ?? "—"],
    ["One-liner", sender.oneLiner ?? "—"],
    ["Vehicle", sender.vehicle ?? "—"],
    ["Target", sender.target ?? "—"],
    ["Minimum", sender.minimum ?? "—"],
    ["Calendar", sender.calendarUrl ?? "—"],
    ["Priority sectors", (sender.prioritySectors ?? []).join(", ") || "—"],
    [],
    ["Proof points"],
    ...((sender.facts ?? []).map((f) => [`  • ${f}`])),
  ]
  const wsSender = XLSX.utils.aoa_to_sheet(sb)
  wsSender["!cols"] = [{ wch: 26 }, { wch: 110 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsOverview, "Overview")
  XLSX.utils.book_append_sheet(wb, wsProfiles, "Curated Profiles")
  XLSX.utils.book_append_sheet(wb, wsDMs, "LinkedIn DMs")
  XLSX.utils.book_append_sheet(wb, wsEmails, "Email Drafts")
  XLSX.utils.book_append_sheet(wb, wsMethod, "Methodology")
  XLSX.utils.book_append_sheet(wb, wsSender, "Sender Brief")

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
}

// ─── DOCX brief ───────────────────────────────────────────────────────────

export interface BuildBriefInput {
  campaignName: string
  members: CurateMember[]
  sender: SenderContext
  tierOpts: TieredCrawlOpts
}

export async function buildCuratedBrief(input: BuildBriefInput): Promise<Buffer> {
  const { campaignName, members, sender, tierOpts } = input
  const byType: Record<string, number> = {}
  for (const m of members) byType[m.displayType || "Unknown"] = (byType[m.displayType || "Unknown"] || 0) + 1

  const h1 = (t: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, bold: true })] })
  const p  = (t: string) => new Paragraph({ children: [new TextRun(t)] })
  const li = (t: string) => new Paragraph({ children: [new TextRun(t)], bullet: { level: 0 } })

  const sections: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: campaignName, bold: true, size: 36 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Curated outreach campaign", italics: true, size: 22 })] }),
    p(""),
    h1("1 · Purpose"),
    p(`This campaign opens warm relationships with the ${members.length} planned members. First contact is relationship-building, not a pitch — every message proposes a 20–30 minute introductory call with no commitment ask attached.`),
    h1("2 · Sender"),
    p(`${sender.founderName ?? "—"} — ${sender.founderTitle ?? "—"}`),
    sender.founderLinkedin ? p(`LinkedIn: ${sender.founderLinkedin}`) : p(""),
    sender.oneLiner ? p(`One-liner: ${sender.oneLiner}`) : p(""),
    h1("3 · Cohort"),
    p(`${members.length} members; ${members.filter((m) => m.displayEmail).length} with email; ${members.filter((m) => m.displayLinkedin).length} with LinkedIn URLs.`),
    ...Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => li(`${k}: ${v}`)),
    h1("4 · Tiering and crawl"),
    li(`Tier 1 — Top ${tierOpts.tier1Deep} by score. Deep crawl: landing + /about, /team, /contact, /portfolio, /investment, /thesis, /approach, /strategy.`),
    li(`Tier 2 — Next ${tierOpts.tier2Light}. Single-page landing crawl.`),
    li(`Tier 3 — Remaining ${Math.max(0, members.length - tierOpts.tier1Deep - tierOpts.tier2Light)}. No crawl (metadata-only enrichment).`),
    h1("5 · Routing by LP type"),
    li("Family Office — email only, no cold LinkedIn DM."),
    li("Angel / HNW — LinkedIn DM + email mirror."),
    li("Institutional / Endowment / Sovereign Wealth / FoF — formal email only."),
    li("Hedge / public market / credit — measured email only."),
    h1("6 · Send cadence (suggested)"),
    li("Day 0 — first contact (this workbook)."),
    li("Day 3 — light bump for no-replies."),
    li("Day 10 — different-angle follow-up."),
    li("Day 24 — close-the-loop."),
    li("Day 90 — quarterly re-engagement with a milestone trigger."),
    h1("7 · Quality safeguards"),
    li("No em-dashes, no superlatives, no fabricated traction figures."),
    li("Each first-touch message anchors on one specific signal about the investor (sector overlap, geography, or neutral)."),
    li("Family-office and institutional messages stay email-only."),
    li("Every message ends with a low-friction fallback so a 'not now' doesn't close the door."),
  ]

  const doc = new Document({
    creator: "Anker",
    title: `${campaignName} — campaign brief`,
    description: "Plan, voice, cohort and routing for the campaign first-contact",
    sections: [{ properties: {}, children: sections }],
  })
  return Packer.toBuffer(doc) as unknown as Buffer
}

/** Convenience: build messages for an entire member list at once. */
export function buildMessagesAll(members: CurateMember[], sender: SenderContext): Map<string, BuiltMessage> {
  const out = new Map<string, BuiltMessage>()
  for (const m of members) out.set(m.id, buildMessage(m, sender))
  return out
}
