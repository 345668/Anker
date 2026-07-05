import Link from "next/link"
import { ArrowRight, Sparkles, Zap, Wrench, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Navigation } from "@/components/landing/navigation"
import { FooterSection } from "@/components/landing/footer-section"
import { cn } from "@/lib/utils"

export const metadata = {
  title: "Changelog — Anker",
  description: "What we shipped, week by week.",
}

type EntryType = "feature" | "improvement" | "fix" | "security"

interface Entry {
  date: string
  version: string
  type: EntryType
  title: string
  description: string
  highlights?: string[]
}

const entries: Entry[] = [
  {
    date: "Jun 20, 2026",
    version: "v0.47",
    type: "fix",
    title: "Newsroom heading visibility & article structure",
    description:
      "Article H2/H3/H4 were rendering as washed-out italics because a CSS rule wrapped an OKLCH theme token as HSL. Rewrote the article-body styles against the actual theme variables; tightened the heading splitter so AI-emitted titles with embedded bold (\"**Energy and AI: The New Sovereign Wealth Priorities**\") render cleanly.",
    highlights: [
      "color: var(--foreground) (was invalid hsl(oklch()))",
      "color-mix(in oklab,…) for every translucent border + accent",
      "Strip leading \"1. \" from heading-promoted list items",
      "Drop unmatched ** when bold pair breaks across split boundary",
    ],
  },
  {
    date: "Jun 19, 2026",
    version: "v0.46",
    type: "fix",
    title: "Admin sidebar now visible for DB-flagged admins",
    description:
      "Admin nav was only checking user_metadata.role, so anyone admin'd via the ADMIN_EMAILS allowlist or public.users.is_admin=true in Neon saw no Admin section even though /dashboard/admin/* worked by URL. Sidebar now trusts the same three-source check as the server guard.",
    highlights: [
      "isAdmin computed once in dashboard/layout.tsx via isAdminUser()",
      "Sidebar accepts isAdmin prop with metadata-only fallback for compat",
      "All three admin sources (allowlist + metadata + DB) now route correctly",
    ],
  },
  {
    date: "Jun 16, 2026",
    version: "v0.44",
    type: "improvement",
    title: "LP Campaign Studio accepts any XLSX/CSV",
    description:
      "Stopped requiring exact header names. The importer now fuzzy-matches headers (\"First name\" / \"first_name\" / \"FIRSTNAME\" all map to the same field), parses quoted multi-line CSV cells via SheetJS, and handles two-event campaigns end-to-end. DMs auto-elect angel/HNW profiles when no LinkedIn DMs sheet is present.",
    highlights: [
      "HEADER_ALIASES map covers ~40 common variants",
      "SheetJS-based CSV parse handles quoted multi-line cells",
      "Crawl integration: per-profile website inference + investment focus",
      "282-row two-event outreach campaign generates in 2:30 (Qwen / DashScope)",
    ],
  },
  {
    date: "Jun 14, 2026",
    version: "v0.43",
    type: "feature",
    title: "FO enrichment + AI assistant tooling",
    description:
      "Five new tools wired into the assistant for the family-office workflow: enrich_db_from_xlsx, db_gap_analysis, generate_event_outreach_drafts, apply_template_to_outreach_drafts, enrich_xlsx_with_llm. The web crawler now provides per-profile context (inferred website, investment focus, recent crawl) to every draft. Vercel artifacts now route through Vercel Blob instead of per-lambda /tmp.",
    highlights: [
      "Enriched Neon with +452 firms + 561 investors from FO XLSX uploads",
      "Web-crawl context wired into FO enrichment + outreach draft tools",
      "Vercel Blob for durable artifact storage (fixes 404 on download)",
      "Registration kill-switch + conditional sign-up/login UI",
    ],
  },
  {
    date: "Apr 25, 2026",
    version: "v0.42",
    type: "feature",
    title: "Cap table & dilution modeler",
    description:
      "Plan ownership across rounds with live scenario sliders. Founders, ESOP, and investor stakes recompute as you change pre-money, raise size, or pool top-ups.",
    highlights: [
      "Stacked ownership chart across rounds",
      "Editable holders & funding rounds",
      "Auto-solves ESOP top-ups against post-money targets",
      "Per-stage value-of-stake calculation",
    ],
  },
  {
    date: "Apr 25, 2026",
    version: "v0.42",
    type: "feature",
    title: "Runway scenario planner",
    description:
      "Three-scenario burn projection with planned-raise marker. Pinpoints your zero-cash month and warns when fundraising should kick off.",
    highlights: [
      "Conservative / baseline / optimistic projections",
      "Burn vs. revenue gap chart",
      "Planned raise injection at any month",
      "Automatic urgency banner < 9 months",
    ],
  },
  {
    date: "Apr 25, 2026",
    version: "v0.42",
    type: "feature",
    title: "Term sheet analyzer",
    description:
      "Live red-flag detection on every clause that matters. Each term is benchmarked against market norms with severity scoring.",
    highlights: [
      "Liquidation, anti-dilution, board, ESOP, vesting all scored",
      "Founder-friendliness score 0-100",
      "Plain-English negotiation notes per term",
    ],
  },
  {
    date: "Apr 18, 2026",
    version: "v0.41",
    type: "improvement",
    title: "Investor matching v3",
    description:
      "Re-trained matching model on 8,200 closed rounds from the last 18 months. Median match relevance is up 14% over v2.",
    highlights: [
      "New behavioral signals: cadence, board involvement, follow-on rate",
      "Stage transitions weighted explicitly (seed→A, A→B)",
      "Geo & sector overlap normalized",
    ],
  },
  {
    date: "Apr 11, 2026",
    version: "v0.40",
    type: "feature",
    title: "Outreach sequences",
    description:
      "Multi-step email cadences with branching on reply, open, and click. Pull warm-intro context from your CRM at send time.",
  },
  {
    date: "Apr 4, 2026",
    version: "v0.39",
    type: "improvement",
    title: "Pitch deck AI review",
    description:
      "Faster scoring (4.1s avg → 1.9s) and a new 'investor lens' that mimics a Tier-1 partner reading on a Sunday morning.",
  },
  {
    date: "Mar 28, 2026",
    version: "v0.38",
    type: "security",
    title: "SOC 2 Type II report available",
    description:
      "Our second-year SOC 2 Type II is complete with zero exceptions. Available under NDA in the trust portal.",
  },
  {
    date: "Mar 21, 2026",
    version: "v0.37",
    type: "feature",
    title: "Data room with watermarking",
    description:
      "Encrypted document sharing with per-viewer watermarks, view tracking, and time-limited access tokens.",
  },
  {
    date: "Mar 14, 2026",
    version: "v0.36",
    type: "fix",
    title: "Pipeline stage drag-and-drop",
    description:
      "Fixed a race condition that occasionally reverted stage changes when moving multiple deals quickly.",
  },
  {
    date: "Mar 7, 2026",
    version: "v0.35",
    type: "improvement",
    title: "CRM bulk operations",
    description:
      "Update stage, owner, and tags across hundreds of contacts at once. Undo within 30 seconds.",
  },
]

const typeMeta: Record<
  EntryType,
  { label: string; icon: typeof Sparkles; tone: string }
> = {
  feature: {
    label: "Feature",
    icon: Sparkles,
    tone: "bg-foreground text-background",
  },
  improvement: {
    label: "Improvement",
    icon: Zap,
    tone: "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20",
  },
  fix: {
    label: "Fix",
    icon: Wrench,
    tone: "bg-amber-500/10 text-amber-700 border border-amber-500/20",
  },
  security: {
    label: "Security",
    icon: Shield,
    tone: "bg-blue-500/10 text-blue-700 border border-blue-500/20",
  },
}

export default function ChangelogPage() {
  // Group entries by date
  const grouped = entries.reduce<Record<string, Entry[]>>((acc, e) => {
    acc[e.date] = acc[e.date] ?? []
    acc[e.date].push(e)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-background noise-overlay">
      <Navigation />

      <main className="pt-24">
        {/* Hero */}
        <section className="relative py-24 lg:py-32 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={`h-${i}`}
                className="absolute h-px bg-foreground/10"
                style={{ top: `${12.5 * (i + 1)}%`, left: 0, right: 0 }}
              />
            ))}
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={`v-${i}`}
                className="absolute w-px bg-foreground/10"
                style={{ left: `${8.33 * (i + 1)}%`, top: 0, bottom: 0 }}
              />
            ))}
          </div>
          <div className="relative max-w-[1100px] mx-auto px-6 lg:px-12">
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
              <span className="w-8 h-px bg-foreground/30" />
              Changelog
            </span>
            <h1 className="text-[clamp(3rem,9vw,8rem)] font-display leading-[0.9] tracking-tight mb-8">
              Built in the
              <br />
              open.
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl leading-relaxed">
              Every release, every fix, every security update. We ship weekly and
              announce it here.
            </p>

            <div className="flex items-center gap-3 mt-10 flex-wrap">
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full h-12 border-foreground/20"
              >
                <Link href="/dashboard">
                  Open the app
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
              <span className="font-mono text-xs text-muted-foreground">
                Subscribe via{" "}
                <Link href="#" className="underline">
                  RSS
                </Link>{" "}
                or{" "}
                <Link href="/contact" className="underline">
                  email digest
                </Link>
              </span>
            </div>
          </div>
        </section>

        {/* Timeline */}
        <section className="pb-24 lg:pb-32">
          <div className="max-w-[1100px] mx-auto px-6 lg:px-12">
            <div className="space-y-16">
              {Object.entries(grouped).map(([date, items]) => (
                <div key={date} className="grid lg:grid-cols-[180px_1fr] gap-8 lg:gap-16">
                  {/* Date */}
                  <div className="lg:sticky lg:top-24 self-start">
                    <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground mb-1">
                      {date}
                    </div>
                    <div className="font-display text-2xl">{items[0].version}</div>
                    <div className="mt-3 w-12 h-px bg-foreground/30" />
                  </div>

                  {/* Entries */}
                  <div className="space-y-6">
                    {items.map((entry, i) => {
                      const Meta = typeMeta[entry.type]
                      const Icon = Meta.icon
                      return (
                        <article
                          key={i}
                          className="border border-foreground/10 rounded-lg p-6 lg:p-8 hover:border-foreground/30 transition-colors"
                        >
                          <div className="flex items-center gap-3 mb-4">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10px] uppercase tracking-wider",
                                Meta.tone
                              )}
                            >
                              <Icon className="w-3 h-3" />
                              {Meta.label}
                            </span>
                          </div>
                          <h2 className="font-display text-2xl lg:text-3xl tracking-tight mb-3">
                            {entry.title}
                          </h2>
                          <p className="text-muted-foreground leading-relaxed">
                            {entry.description}
                          </p>
                          {entry.highlights && (
                            <ul className="mt-5 space-y-2">
                              {entry.highlights.map((h, j) => (
                                <li
                                  key={j}
                                  className="flex items-start gap-3 text-sm text-foreground/80"
                                >
                                  <span className="mt-2 w-1 h-1 rounded-full bg-foreground/40 shrink-0" />
                                  {h}
                                </li>
                              ))}
                            </ul>
                          )}
                        </article>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 lg:py-32 border-t border-foreground/10">
          <div className="max-w-[900px] mx-auto px-6 lg:px-12 text-center">
            <h2 className="text-4xl lg:text-6xl font-display tracking-tight leading-[0.95] mb-6">
              Got an idea
              <br />
              for what&apos;s next?
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-10">
              We read every request. Founder feedback drives the roadmap.
            </p>
            <Button
              asChild
              size="lg"
              className="bg-foreground hover:bg-foreground/90 text-background h-14 px-8 rounded-full group"
            >
              <Link href="/contact">
                Send a request
                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <FooterSection />
    </div>
  )
}
