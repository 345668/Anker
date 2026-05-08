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
} from "lucide-react"
import { isAdminUser } from "@/lib/auth/require-admin"

export const dynamic = "force-dynamic"
export const metadata = { title: "Admin tools — Anker" }

const TOOLS = [
  {
    href: "/dashboard/admin/agent",
    title: "Outreach agent",
    description:
      "Agentic loop: enrich firm → build investor profile → draft 4-step DM sequence → classify pending replies → sync CRM stage. Drafts only — never auto-sends.",
    icon: Bot,
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
