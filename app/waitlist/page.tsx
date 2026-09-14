import Link from "next/link"
import { Navigation } from "@/components/landing/navigation"
import { FooterSection } from "@/components/landing/footer-section"
import { WaitlistForm } from "@/components/landing/waitlist-form"
export const metadata = {
  title: "Join the waitlist | Anker",
  description: "Request early access to Anker for founders, investors and limited partners.",
  alternates: { canonical: "https://www.an-ker.de/waitlist" },
  openGraph: { title: "Venture moves fast. Stay anchored.", description: "Join the Anker waitlist.", url: "https://www.an-ker.de/waitlist" },
}
export default function WaitlistPage() {
  return <main id="main-content" className="marketing-site min-h-screen bg-background text-foreground">
    <Navigation />
    <section className="mx-auto grid max-w-[1376px] gap-14 px-6 py-16 sm:px-10 sm:py-24 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
      <div><p className="text-xs font-medium uppercase tracking-[0.18em]">Anker · Early access</p>
        <h1 className="mt-7 font-serif text-5xl leading-[1.06] tracking-tight sm:text-6xl xl:text-7xl">Venture moves fast.<br /><em className="font-normal">Stay anchored.</em></h1>
        <p className="mt-8 max-w-lg text-lg leading-relaxed text-muted-foreground">One place for the conversations, relationships and operations behind your capital.</p>
        <div className="mt-12 max-w-lg divide-y divide-foreground/15 border-y border-foreground/15">{[
          ["Call intelligence", "Turn reviewed call notes into your next action."],
          ["Investor matchmaking", "Find relevant investors and organize your outreach."],
          ["Fund operations", "Bring fund activity and investor reporting into context."],
        ].map(([title, copy]) => <div key={title} className="py-5"><h2 className="text-base font-medium">{title}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{copy}</p></div>)}</div>
        <p className="mt-8 text-sm text-muted-foreground">Already have access? <Link href="/auth/login" className="text-foreground underline underline-offset-4">Sign in</Link></p>
      </div><WaitlistForm />
    </section><FooterSection />
  </main>
}
