/**
 * /dashboard/admin — admin tool index.
 *
 * Server-gated by lib/auth/require-admin. Non-admins are redirected
 * to /dashboard.
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
} from "lucide-react"
import { isAdminUser } from "@/lib/auth/require-admin"

export const dynamic = "force-dynamic"
export const metadata = { title: "Admin tools — Anker" }

const TOOLS = [
  {
    href: "/dashboard/admin/agent",
    title: "Outreach agent",
    description:
      "Agentic loop: enrich firm → build investor profile → draft 4-step DM sequence → classify pending replies → sync CRM stage. Drafts only — never auto-sends. Persistent run history.",
    icon: Bot,
  },
  {
    href: "/dashboard/admin/inbox",
    title: "Reply inbox",
    description:
      "Triage inbound replies across all users. Three buckets: pending (raw text, no classification), classified (draft ready), actioned. Classify with local AI, edit the draft, Approve + sent to advance CRM stage forward-only.",
    icon: Inbox,
  },
  {
    href: "/dashboard/admin/email",
    title: "Email outbox",
    description:
      "Drafts → Send via Resend (vc@an-ker.de). Sent log with open + click pixels, needs-follow-up bucket flipped by the agent after 3 days with no reply. IMAP poll button for inbound replies (lands in Reply inbox).",
    icon: Send,
  },
  {
    href: "/dashboard/admin/research",
    title: "Deep research",
    description:
      "Multi-page crawl + local-AI synthesis into a Markdown dossier (docx export). Use the deep-tier model.",
    icon: Search,
  },
  {
    href: "/dashboard/admin/url-check",
    title: "URL check",
    description:
      "Bulk-validate firm websites and investor LinkedIn URLs. Flags dead, redirected-off-domain, blocked, or rate-limited.",
    icon: Link2,
  },
  {
    href: "/dashboard/admin/email-check",
    title: "Email check",
    description:
      "Bulk-verify investor emails via Hunter.io (deliverable / risky / accept-all / disposable / no-mx / invalid). Per-row Fix dialog with email-finder, local-AI guess, and manual paste.",
    icon: Mail,
  },
  {
    href: "/dashboard/admin/enrichment",
    title: "Enrichment",
    description:
      "Pick a thin firm or investor row, crawl their site, AI-extract sectors / stages / check size / portfolio, write back.",
    icon: Sparkles,
  },
  {
    href: "/dashboard/admin/crawl",
    title: "Web crawler",
    description:
      "One-off page crawl: text, metadata, links classified by purpose (about, team, portfolio, blog, social).",
    icon: Globe,
  },
  {
    href: "/dashboard/admin/newsroom",
    title: "Newsroom CMS",
    description:
      "Author + publish articles for the public /newsroom page. Markdown editor with status (draft / published / archived) + AI-draft assist via local model.",
    icon: Newspaper,
  },
  {
    href: "/dashboard/admin/imports",
    title: "CSV imports",
    description:
      "Bulk import firm or investor CSV / XLSX files. Auto-detects headers (Firm, VC Firm, Founders…), dedups via stable id, dry-run mode.",
    icon: FileSpreadsheet,
  },
  {
    href: "/dashboard/admin/system",
    title: "System health",
    description:
      "Postgres + Ollama + Twenty + SearXNG + Marker reachability, DB stats, pgvector status, AI router task → model map. Auto-refreshes every 15 s.",
    icon: HeartPulse,
  },
  {
    href: "/dashboard/admin/ai-config",
    title: "AI config",
    description:
      "Per-task on/off switches, model overrides, and provider force (anthropic / ollama / none). Reconnect button live-probes Ollama after you start the daemon — no Anker restart needed.",
    icon: Bot,
  },
]

export default async function AdminIndex() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return (
    <div className="min-h-screen">
      <div className="border-b border-foreground/10">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-12 py-12">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
            <ShieldCheck className="w-3.5 h-3.5" /> Admin · signed in as {email ?? "—"}
          </div>
          <h1 className="text-5xl lg:text-6xl font-display tracking-tight leading-[0.95] mb-3">
            Data ops
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Web crawl, link-check, enrich, deep-research. Local AI handles
            the heavy lifting — fast tier for classification, deep tier for
            dossier writing.
          </p>
        </div>
      </div>
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12 py-10 grid md:grid-cols-2 gap-6">
        {TOOLS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group block p-6 border border-foreground/10 rounded-lg hover:border-foreground/30 transition-colors"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-md bg-foreground/5 flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-colors">
                <t.icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg">{t.title}</h3>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </div>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{t.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
