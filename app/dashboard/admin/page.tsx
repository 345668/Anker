/**
 * /dashboard/admin — Owner Console.
 *
 * The hub for platform-owner tools that are firewalled from tenants: data
 * ingestion, outreach operations, the newsroom CMS, and platform admin.
 * Server-gated by lib/auth/require-admin — non-owners are redirected to
 * /dashboard. Every tool here also guards itself, so this index is just a map.
 */
import { redirect } from "next/navigation"
import Link from "next/link"
import {
  Globe,
  Link2,
  Sparkles,
  Search,
  ArrowRight,
  ShieldCheck,
  Bot,
  Newspaper,
  HeartPulse,
  FileSpreadsheet,
  Mail,
  Inbox,
  Send,
  MailCheck,
  Users,
  ScrollText,
  CreditCard,
} from "lucide-react"
import { isAdminUser } from "@/lib/auth/require-admin"
import { StaffBadge } from "@/components/shell/staff-badge"

export const dynamic = "force-dynamic"
export const metadata = { title: "Owner Console — Anker" }

type Tool = {
  href: string
  title: string
  description: string
  icon: any
  /** Not yet built — renders as a muted "Coming soon" card. */
  stub?: boolean
}

const GROUPS: { heading: string; blurb: string; tools: Tool[] }[] = [
  {
    heading: "Data operations",
    blurb: "The pipeline that builds and cleans the investor database.",
    tools: [
      {
        href: "/dashboard/imports",
        title: "CSV / XLSX imports",
        description:
          "Bulk import firm or investor CSV/XLSX. Auto-detects headers, dedups via stable id, dry-run mode.",
        icon: FileSpreadsheet,
      },
      {
        href: "/dashboard/imports/crawl",
        title: "Web crawler",
        description:
          "Crawl a URL or whole domain into structured firm intel. Links classified by purpose. Robots-aware.",
        icon: Globe,
      },
      {
        href: "/dashboard/imports/enrichment",
        title: "Enrichment",
        description:
          "Pick a thin firm/investor row, crawl their site, AI-extract sectors / stages / check size / portfolio, write back.",
        icon: Sparkles,
      },
      {
        href: "/dashboard/imports/url-check",
        title: "URL check",
        description:
          "Bulk-validate firm websites & investor LinkedIn URLs. Flags dead, redirected-off-domain, blocked, rate-limited.",
        icon: Link2,
      },
      {
        href: "/dashboard/send-center/deliverability",
        title: "Email verification",
        description:
          "Hunter.io bulk verify (valid / risky / accept-all / disposable / no-mx) + SPF / DKIM / DMARC before a batch.",
        icon: MailCheck,
      },
      {
        href: "/dashboard/admin/research",
        title: "Deep research",
        description:
          "Multi-page crawl + local-AI synthesis into a Markdown dossier (docx export). Deep-tier model.",
        icon: Search,
      },
    ],
  },
  {
    heading: "Outreach operations",
    blurb: "The send / track / triage loop behind campaigns.",
    tools: [
      {
        href: "/dashboard/send-center",
        title: "Send Center · outbox",
        description:
          "Drafts → Send via Resend. Sent log with open + click pixels; needs-follow-up bucket flipped after 3 days.",
        icon: Send,
      },
      {
        href: "/dashboard/send-center/replies",
        title: "Reply triage",
        description:
          "Pending → classified → actioned. Classify with local AI, edit the draft, approve + sent advances the CRM stage.",
        icon: Inbox,
      },
      {
        href: "/dashboard/admin/agent",
        title: "Outreach agent",
        description:
          "Agentic loop: enrich firm → build profile → draft 4-step DM → classify replies → sync CRM. Drafts only, never auto-sends.",
        icon: Bot,
      },
    ],
  },
  {
    heading: "Content",
    blurb: "The only authoring surface — public /newsroom is read-only.",
    tools: [
      {
        href: "/dashboard/content",
        title: "Newsroom CMS",
        description:
          "Author + publish articles to /newsroom. Markdown editor, status (draft / published / archived), AI-draft assist.",
        icon: Newspaper,
      },
    ],
  },
  {
    heading: "Platform",
    blurb: "System health, model routing, and account administration.",
    tools: [
      {
        href: "/dashboard/admin/system",
        title: "System health",
        description:
          "Postgres + Ollama + SearXNG + Marker reachability, DB stats, pgvector status, AI router task → model map.",
        icon: HeartPulse,
      },
      {
        href: "/dashboard/admin/ai-config",
        title: "AI config",
        description:
          "Per-task on/off switches, model overrides, and provider force (anthropic / ollama / none). Live Ollama reconnect.",
        icon: Bot,
      },
      {
        href: "/dashboard/admin/mcp-tokens",
        title: "MCP tokens",
        description:
          "Issue / revoke bearer tokens for the Anker MCP server (/api/mcp). Scope each token's user, read-only, and tool allowlist so any agent can use the platform as a plugin.",
        icon: ShieldCheck,
      },
      {
        href: "/dashboard/admin/users",
        title: "Users & roles",
        description:
          "Every account merged across Supabase Auth + memberships: platform role, org role & persona, last-active. Grant/revoke admin (owner + self protected), audited.",
        icon: Users,
      },
      {
        href: "/dashboard/admin/audit",
        title: "Audit log",
        description:
          "Immutable trail of owner actions, LP touches, legal-doc approvals, and deck exports.",
        icon: ScrollText,
      },
      {
        href: "/dashboard/admin/billing",
        title: "Billing & credits",
        description: "Plan, subscription status, and AI-credit balance — Stripe-backed, with the customer portal.",
        icon: CreditCard,
      },
    ],
  },
]

export default async function OwnerConsole() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <div className="min-h-screen">
      <div className="border-b border-foreground/10">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-12 py-12">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
            <ShieldCheck className="w-3.5 h-3.5" /> Owner Console · signed in as {email ?? "—"}
            <StaffBadge label="Staff only" className="ml-1" />
          </div>
          <h1 className="text-5xl lg:text-6xl font-display tracking-tight leading-[0.95] mb-3">
            Owner Console
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Platform-owner tools, firewalled from tenants: build & clean the investor
            database, run the outreach loop, publish the newsroom, and administer the
            platform. Local AI does the heavy lifting.
          </p>
        </div>
      </div>
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12 py-10 space-y-12">
        {GROUPS.map((group) => (
          <section key={group.heading}>
            <div className="mb-4">
              <h2 className="font-display text-2xl tracking-tight">{group.heading}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{group.blurb}</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {group.tools.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`group block p-6 border border-foreground/10 rounded-lg transition-colors ${
                    t.stub ? "opacity-70 hover:opacity-100 hover:border-foreground/20" : "hover:border-foreground/30"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-md bg-foreground/5 flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-colors">
                      <t.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display text-lg flex items-center gap-2">
                          {t.title}
                          {t.stub && (
                            <span className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                              Coming soon
                            </span>
                          )}
                        </h3>
                        <ArrowRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-1" />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{t.description}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
