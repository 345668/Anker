"use client"

import { useState } from "react"
import type { User } from "@supabase/supabase-js"
import { 
  HelpCircle,
  Search,
  Book,
  MessageSquare,
  Mail,
  Video,
  FileText,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Users,
  Target,
  FileSearch,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface HelpContentProps {
  user: User
}

const helpCategories = [
  {
    icon: Sparkles,
    title: "Getting Started",
    description: "Learn the basics of using Optimus",
    articles: [
      "How to create your first company profile",
      "Understanding the investor matching algorithm",
      "Uploading and analyzing your pitch deck",
    ],
  },
  {
    icon: Target,
    title: "Finding Investors",
    description: "Maximize your investor matches",
    articles: [
      "How AI matching works",
      "Understanding match scores and tiers",
      "Tips for improving your match quality",
    ],
  },
  {
    icon: Users,
    title: "CRM & Outreach",
    description: "Managing investor relationships",
    articles: [
      "Adding investors to your CRM",
      "Tracking communication history",
      "Best practices for investor outreach",
    ],
  },
  {
    icon: FileSearch,
    title: "Data Room & Documents",
    description: "Sharing materials with investors",
    articles: [
      "Setting up your data room",
      "Managing document permissions",
      "Tracking document views and analytics",
    ],
  },
]

const faqs = [
  {
    question: "How does the AI matching algorithm work?",
    answer: "Our algorithm analyzes 9 key factors including industry alignment, funding stage, geographic fit, check size compatibility, and more to score potential investor matches.",
  },
  {
    question: "Is my data secure?",
    answer: "Yes, we use enterprise-grade encryption and security practices. Your data is never shared without your explicit permission.",
  },
  {
    question: "How do I upgrade my plan?",
    answer: "You can upgrade to Pro from the Settings > Billing page. Pro includes unlimited matches, priority support, and advanced analytics.",
  },
  {
    question: "Can I export my investor list?",
    answer: "Yes, Pro users can export their matched investors and CRM data in CSV format from the Analytics page.",
  },
]

export function HelpContent({ user }: HelpContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-8 py-4">
          <div className="flex items-center gap-2 mb-1">
            <HelpCircle className="w-4 h-4 text-muted-foreground" />
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Support</span>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Help & Support
          </h1>
        </div>
      </header>

      <div className="px-8 py-8 max-w-4xl">
        {/* Search */}
        <div className="relative mb-12">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search for help..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-14 text-base"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <button className="p-6 bg-card/50 border border-border/50 rounded-xl text-left hover:border-foreground/30 transition-all group">
            <MessageSquare className="w-6 h-6 text-muted-foreground mb-4 group-hover:text-foreground transition-colors" />
            <h3 className="font-display font-semibold mb-1 group-hover:text-foreground">Chat with AI</h3>
            <p className="text-sm text-muted-foreground">Get instant answers from our AI assistant</p>
          </button>
          <button className="p-6 bg-card/50 border border-border/50 rounded-xl text-left hover:border-foreground/30 transition-all group">
            <Mail className="w-6 h-6 text-muted-foreground mb-4 group-hover:text-foreground transition-colors" />
            <h3 className="font-display font-semibold mb-1 group-hover:text-foreground">Email Support</h3>
            <p className="text-sm text-muted-foreground">Response within 24 hours</p>
          </button>
          <button className="p-6 bg-card/50 border border-border/50 rounded-xl text-left hover:border-foreground/30 transition-all group">
            <Video className="w-6 h-6 text-muted-foreground mb-4 group-hover:text-foreground transition-colors" />
            <h3 className="font-display font-semibold mb-1 group-hover:text-foreground">Book a Demo</h3>
            <p className="text-sm text-muted-foreground">Schedule a walkthrough</p>
          </button>
        </div>

        {/* Help Categories */}
        <div className="mb-12">
          <h2 className="font-display text-lg font-semibold mb-6">Browse by Topic</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {helpCategories.map((category, index) => (
              <div 
                key={index}
                className="bg-card/50 border border-border/50 rounded-xl p-6 hover:border-foreground/20 transition-all"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <category.icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold">{category.title}</h3>
                    <p className="text-xs text-muted-foreground">{category.description}</p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {category.articles.map((article, i) => (
                    <li key={i}>
                      <button className="w-full text-left text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 py-1 group">
                        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        {article}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* FAQs */}
        <div>
          <h2 className="font-display text-lg font-semibold mb-6">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <div 
                key={index}
                className="bg-card/50 border border-border/50 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                  className="w-full p-5 text-left flex items-center justify-between hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium">{faq.question}</span>
                  <ChevronRight 
                    className={`w-5 h-5 text-muted-foreground transition-transform ${
                      expandedFaq === index ? "rotate-90" : ""
                    }`}
                  />
                </button>
                {expandedFaq === index && (
                  <div className="px-5 pb-5 text-sm text-muted-foreground">
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div className="mt-12 p-8 bg-foreground text-background rounded-2xl text-center">
          <h2 className="font-display text-xl font-semibold mb-2">Still need help?</h2>
          <p className="text-background/70 mb-6">
            Our support team is here to assist you with any questions.
          </p>
          <Button className="bg-background text-foreground hover:bg-background/90">
            Contact Support
          </Button>
        </div>
      </div>
    </div>
  )
}
