import Link from "next/link"
import { ShieldCheck, Lock, Key, Eye, Database, Bug, FileCheck, AlertTriangle, ArrowRight } from "lucide-react"
import { Navigation } from "@/components/landing/navigation"
import { FooterSection } from "@/components/landing/footer-section"

export const metadata = {
  title: "Security — Anker",
  description: "How Anker protects your data: encryption, access control, audit logging, vulnerability disclosure, sub-processors.",
}

const practices = [
  {
    icon: Lock,
    title: "Encryption everywhere",
    body: "TLS 1.3 in transit. AES-256 at rest. Database connections encrypted end-to-end via Neon's HTTP serverless driver. Backups encrypted with separate keys.",
  },
  {
    icon: Key,
    title: "Least-privilege access",
    body: "Production credentials are scoped per-service. Engineering team access is reviewed quarterly. No shared accounts. All admin operations are audit-logged.",
  },
  {
    icon: Eye,
    title: "Audit logging",
    body: "Every admin action, login attempt, API key change, and bulk export is recorded with a timestamp + actor + IP. Logs retained 18 months.",
  },
  {
    icon: Database,
    title: "Data isolation",
    body: "Multi-tenant by row-level scoping. LP portal queries are double-checked against the LP's email-derived memberships on every request — no client-side trust.",
  },
  {
    icon: FileCheck,
    title: "Backups & retention",
    body: "Continuous WAL backups via Neon, with point-in-time recovery up to 7 days. Weekly snapshots retained 90 days. Account-level export available on request.",
  },
  {
    icon: ShieldCheck,
    title: "Secrets management",
    body: "API keys (AI providers, news sources, Resend) live in encrypted environment variables. Per-tenant overrides stored in system_settings — never in source.",
  },
]

const subprocessors = [
  { vendor: "Vercel", purpose: "Hosting + edge functions", region: "Global (EU primary)" },
  { vendor: "Neon", purpose: "Postgres database", region: "EU / US (you choose)" },
  { vendor: "Supabase", purpose: "Authentication", region: "EU" },
  { vendor: "Vercel Blob", purpose: "File storage (images, data room)", region: "Global" },
  { vendor: "Resend", purpose: "Transactional email", region: "Global" },
  { vendor: "Anthropic / OpenAI / Google / Alibaba", purpose: "AI inference (opt-in)", region: "US / EU / APAC" },
]

export default function SecurityPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />

      {/* Hero */}
      <section className="border-b border-foreground/10">
        <div className="max-w-5xl mx-auto px-6 lg:px-12 py-20 lg:py-28">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-4">
            Legal · Security
          </div>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05]">
            Security at Anker.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground leading-relaxed max-w-3xl">
            Funds and founders use Anker to hold sensitive material — pitch decks, LP letters,
            cap tables, capital calls. Here's how we protect it.
          </p>
          <div className="mt-10 flex items-center gap-4 flex-wrap">
            <a href="mailto:security@an-ker.de" className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90">
              Report a vulnerability <Bug className="w-4 h-4" />
            </a>
            <Link href="/privacy" className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5">
              Privacy Policy
            </Link>
          </div>
        </div>
      </section>

      {/* Practices */}
      <section className="py-20 lg:py-28">
        <div className="max-w-6xl mx-auto px-6 lg:px-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">
            Practices
          </div>
          <h2 className="font-display text-3xl md:text-4xl tracking-tight mb-10">Six controls that matter most.</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {practices.map((p) => (
              <div key={p.title} className="border border-foreground/10 rounded-md p-6 bg-background">
                <div className="w-9 h-9 rounded-md bg-foreground/5 border border-foreground/10 flex items-center justify-center mb-4">
                  <p.icon className="w-4 h-4 text-foreground/70" />
                </div>
                <h3 className="font-display text-lg mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sub-processors */}
      <section className="border-t border-foreground/10 bg-foreground/[0.02] py-20 lg:py-28">
        <div className="max-w-5xl mx-auto px-6 lg:px-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">
            Sub-processors
          </div>
          <h2 className="font-display text-3xl md:text-4xl tracking-tight mb-3">Who we work with.</h2>
          <p className="text-muted-foreground mb-10 max-w-2xl">
            Every vendor that processes customer data is listed below. We sign data-processing
            agreements with each and review them annually. We'll email customers 30 days before
            adding or replacing a sub-processor.
          </p>
          <div className="border border-foreground/10 rounded-md overflow-hidden bg-background">
            <table className="w-full text-sm">
              <thead className="bg-foreground/[0.02] text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-3 font-normal">Vendor</th>
                  <th className="text-left px-5 py-3 font-normal">Purpose</th>
                  <th className="text-left px-5 py-3 font-normal">Region</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {subprocessors.map((s) => (
                  <tr key={s.vendor}>
                    <td className="px-5 py-3 font-medium">{s.vendor}</td>
                    <td className="px-5 py-3 text-muted-foreground">{s.purpose}</td>
                    <td className="px-5 py-3 text-muted-foreground">{s.region}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Disclosure */}
      <section className="py-20 lg:py-28">
        <div className="max-w-3xl mx-auto px-6 lg:px-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3 inline-flex items-center gap-1.5">
            <Bug className="w-3 h-3" /> Responsible disclosure
          </div>
          <h2 className="font-display text-3xl md:text-4xl tracking-tight mb-4">Find a vulnerability?</h2>
          <p className="text-muted-foreground leading-relaxed">
            Email <a href="mailto:security@an-ker.de" className="underline">security@an-ker.de</a>{" "}
            with a description and steps to reproduce. We acknowledge within 48 hours and aim
            to resolve material issues within 30 days. We won't pursue legal action against
            researchers acting in good faith.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
            <li>· Do not exfiltrate data — a single proof-of-access is enough</li>
            <li>· Do not access other users' accounts without explicit permission</li>
            <li>· Do not perform DoS or social engineering</li>
            <li>· Give us a reasonable window to fix before public disclosure</li>
          </ul>
        </div>
      </section>

      {/* Incident response */}
      <section className="border-t border-foreground/10 bg-foreground/[0.02] py-20">
        <div className="max-w-3xl mx-auto px-6 lg:px-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3 inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" /> Incident response
          </div>
          <h2 className="font-display text-2xl md:text-3xl tracking-tight mb-4">If a breach happens.</h2>
          <p className="text-muted-foreground leading-relaxed">
            We follow a written incident-response playbook: contain, investigate, notify within
            72 hours where personal data is involved, remediate, and publish a post-mortem.
            Affected customers receive a direct email with the scope, timeline, and remediation steps.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-foreground/10">
        <div className="max-w-3xl mx-auto px-6 lg:px-12 py-20 text-center">
          <h2 className="font-display text-3xl md:text-4xl tracking-tight">Questions?</h2>
          <p className="mt-4 text-muted-foreground">
            Security reviews, SOC 2 questionnaires, custom DPAs —
            email <a href="mailto:security@an-ker.de" className="underline">security@an-ker.de</a>.
          </p>
          <div className="mt-8">
            <Link href="/contact" className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90">
              Get in touch <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  )
}
