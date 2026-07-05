import Link from "next/link"
import { ArrowUpRight, MapPin, Clock, ArrowRight, Heart, Compass, Zap, Globe2 } from "lucide-react"
import { Navigation } from "@/components/landing/navigation"
import { FooterSection } from "@/components/landing/footer-section"

export const metadata = {
  title: "Careers — Anker",
  description: "Help us build the operating system for venture funds. Open roles in engineering, design, product, and go-to-market.",
}

const roles = [
  { team: "Engineering", title: "Senior full-stack engineer", location: "Berlin / Remote (EU timezones)", type: "Full-time" },
  { team: "Engineering", title: "AI / ML engineer", location: "Remote", type: "Full-time" },
  { team: "Engineering", title: "Platform / infrastructure engineer", location: "Remote", type: "Full-time" },
  { team: "Product", title: "Product manager — Venture studio", location: "Remote", type: "Full-time" },
  { team: "Design", title: "Product designer", location: "Remote", type: "Full-time" },
  { team: "Go-to-market", title: "Founding GTM (fund relationships)", location: "Berlin / London / Remote", type: "Full-time" },
  { team: "Operations", title: "Customer success — Family offices", location: "Berlin / Remote (EU timezones)", type: "Full-time" },
]

const values = [
  {
    icon: Heart,
    title: "Founders first",
    body: "Every decision starts with: does this make the founder's job easier? If the answer's no, we don't ship it.",
  },
  {
    icon: Compass,
    title: "Boring infrastructure, magical UX",
    body: "Stable, secure, fast under the hood. The product surface should feel like the future. Both, not either.",
  },
  {
    icon: Zap,
    title: "Ship weekly",
    body: "The platform improves every Tuesday. Long roadmaps are a planning failure; short cycles teach us what to build.",
  },
  {
    icon: Globe2,
    title: "Distributed by design",
    body: "We hire wherever the best people are. Async-first, written-first, generous time off when you've earned it.",
  },
]

const benefits = [
  "Competitive salary + meaningful equity",
  "Full remote with quarterly in-person team weeks",
  "Latest hardware + $1,500 home-office stipend",
  "Health insurance in every major hiring geography",
  "Generous time off — minimum 25 days + local holidays",
  "Annual learning budget — courses, books, conferences",
  "Co-working stipend if you prefer working out of the house",
  "Sabbatical after 4 years",
]

export default function CareersPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navigation />

      {/* Hero */}
      <section className="border-b border-foreground/10">
        <div className="max-w-5xl mx-auto px-6 lg:px-12 py-20 lg:py-28">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-4 inline-flex items-center gap-2">
            Company · Careers
            <span className="text-[10px] px-2 py-0.5 bg-foreground text-background rounded-full uppercase tracking-wider">
              Hiring
            </span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight leading-[1.05]">
            Build the operating system for venture.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground leading-relaxed max-w-3xl">
            Anker is building the platform venture funds and the founders they back will use for the next decade.
            Discovery, diligence, portfolio operations, LP reporting — all in one place. We're small, profitable,
            and growing fast.
          </p>
          <div className="mt-10">
            <a href="#open-roles" className="inline-flex items-center gap-2 px-5 py-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90">
              See open roles <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 lg:py-28">
        <div className="max-w-6xl mx-auto px-6 lg:px-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">
            How we work
          </div>
          <h2 className="font-display text-3xl md:text-4xl tracking-tight mb-10">Four values, lived not posted.</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {values.map((v) => (
              <div key={v.title} className="border border-foreground/10 rounded-md p-6 bg-background">
                <div className="w-9 h-9 rounded-md bg-foreground/5 border border-foreground/10 flex items-center justify-center mb-4">
                  <v.icon className="w-4 h-4 text-foreground/70" />
                </div>
                <h3 className="font-display text-lg mb-2">{v.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open roles */}
      <section id="open-roles" className="border-t border-foreground/10 bg-foreground/[0.02] py-20 lg:py-28">
        <div className="max-w-5xl mx-auto px-6 lg:px-12">
          <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">
                Open roles
              </div>
              <h2 className="font-display text-3xl md:text-4xl tracking-tight">{roles.length} positions open.</h2>
            </div>
            <Link href="/contact" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              Don't see the right fit? Send us a note <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="border border-foreground/10 rounded-md divide-y divide-foreground/10 bg-background">
            {roles.map((r, i) => (
              <Link
                key={i}
                href="/contact"
                className="flex items-center gap-4 px-5 py-5 hover:bg-foreground/[0.02] group"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">{r.team}</div>
                  <div className="font-display text-lg text-foreground group-hover:translate-x-0.5 transition-transform">{r.title}</div>
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {r.location}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {r.type}</span>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 lg:py-28">
        <div className="max-w-4xl mx-auto px-6 lg:px-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">
            Benefits
          </div>
          <h2 className="font-display text-3xl md:text-4xl tracking-tight mb-8">What we offer.</h2>
          <ul className="grid md:grid-cols-2 gap-3">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2 shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-foreground/10 bg-foreground/[0.02]">
        <div className="max-w-3xl mx-auto px-6 lg:px-12 py-20 text-center">
          <h2 className="font-display text-3xl md:text-4xl tracking-tight">Interested?</h2>
          <p className="mt-4 text-muted-foreground">
            Send us a note with what you're working on, what you'd want to build at Anker, and how to reach you.
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
