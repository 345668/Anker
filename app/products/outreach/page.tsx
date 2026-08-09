import { Send, Inbox, Sparkles, ListChecks, ShieldCheck, BarChart3 } from "lucide-react"
import { SolutionPage, type SolutionContent } from "@/components/landing/solution-page"

export const metadata = { title: "Outreach — campaigns & inbox | Anker", description: "AI-drafted, personalized outreach with sequences, a shared inbox, and deliverability." }

const c: SolutionContent = {
  eyebrow: "Product · Outreach",
  title: "Personalized outreach that actually gets replies.",
  lede: "AI-drafted, on-brand emails with sequences, a shared inbox, and deliverability built in — for founders raising and IR teams alike.",
  accent: "#e5380f",
  features: [
    { title: "AI drafting", desc: "Personalized, on-brand emails generated from each investor's profile.", icon: Sparkles },
    { title: "Sequences", desc: "Multi-step follow-ups that pause the moment someone replies.", icon: ListChecks },
    { title: "Shared inbox", desc: "Manage every reply from one place, with owners and status.", icon: Inbox },
    { title: "Deliverability", desc: "Warmup, domain checks, and sending limits protect your reputation.", icon: ShieldCheck },
    { title: "Send Center", desc: "Outbox, replies, and bounce handling in a single console.", icon: Send },
    { title: "Analytics", desc: "Open, reply, and meeting rates per campaign and per investor.", icon: BarChart3 },
  ],
  steps: [
    { label: "Draft", body: "Anker writes personalized emails from your shortlist and deck." },
    { label: "Send", body: "Launch sequences with deliverability guardrails and a shared inbox." },
    { label: "Convert", body: "Track replies and meetings and move warm investors into your pipeline." },
  ],
  quote: { text: "Every intro was warm and relevant. The AI matching plus outreach saved us months.", name: "Co-Founder", role: "Anker user" },
}

export default function OutreachProduct() { return <SolutionPage c={c} /> }
