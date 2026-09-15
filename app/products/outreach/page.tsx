import {
  Send,
  Inbox,
  Sparkles,
  ListChecks,
  ShieldCheck,
  BarChart3,
} from "lucide-react";
import {
  SolutionPage,
  type SolutionContent,
} from "@/components/landing/solution-page";

export const metadata = {
  title: "Outreach — campaigns & inbox | Anker",
  description:
    "Personalized outreach drafts, campaign tracking, and reply management, with review before sending.",
};

const c: SolutionContent = {
  eyebrow: "Product · Outreach",
  title: "Build relationships with more context.",
  lede: "Prepare investor-specific drafts, review each message, and manage replies alongside your pipeline. Keep your team in control of the conversation.",
  editorial: {
    image: "relationships",
    premise: "Relevant conversations begin before you press send.",
    context:
      "Connect the investor profile, your investment case, and the follow-up in one workflow, with AI assistance where it helps.",
  },
  features: [
    {
      title: "AI drafting",
      desc: "Personalized, on-brand emails generated from each investor's profile.",
      icon: Sparkles,
    },
    {
      title: "Sequences",
      desc: "Organize follow-up drafts and stop pending steps when replies are recorded.",
      icon: ListChecks,
    },
    {
      title: "Shared inbox",
      desc: "Manage every reply from one place, with owners and status.",
      icon: Inbox,
    },
    {
      title: "Sending controls",
      desc: "Sending limits and suppression lists help manage outreach to bounced, unsubscribed, or complained addresses.",
      icon: ShieldCheck,
    },
    {
      title: "Send Center",
      desc: "Outbox, replies, and bounce handling in a single console.",
      icon: Send,
    },
    {
      title: "Analytics",
      desc: "Review recorded opens, clicks, replies, and expressions of interest by campaign.",
      icon: BarChart3,
    },
  ],
  steps: [
    {
      label: "Draft",
      body: "Anker writes personalized emails from your shortlist and deck.",
    },
    {
      label: "Send",
      body: "Review your drafts and choose what to send through your connected email account.",
    },
    {
      label: "Follow through",
      body: "Review replies, record next steps, and update the relationship in your pipeline.",
    },
  ],
};

export default function OutreachProduct() {
  return <SolutionPage c={c} />;
}
