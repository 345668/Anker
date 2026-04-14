"use client"

import Link from "next/link"
import type { User } from "@supabase/supabase-js"
import { 
  Search, 
  TrendingUp, 
  Users, 
  FileText, 
  MessageSquare,
  ArrowUpRight,
  Sparkles,
  Target,
  Briefcase,
  ChevronRight,
  Bell,
  ArrowRight,
  Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface DashboardStats {
  totalFirms: number
  totalDeals: number
  totalContacts: number
  totalInvestors: number
  activeDeals: number
  pipelineValue: number
}

interface DashboardContentProps {
  user: User
  stats: DashboardStats
}

function formatAmount(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`
  return `$${amount}`
}

export function DashboardContent({ user, stats }: DashboardContentProps) {
  const firstName = user.user_metadata?.first_name || user.email?.split("@")[0] || "Founder"

  const quickActions = [
    {
      icon: Search,
      title: "Find Investors",
      description: "AI-powered investor matching",
      href: "/dashboard/investors",
    },
    {
      icon: FileText,
      title: "Analyze Pitch Deck",
      description: "Get MBB-style feedback",
      href: "/dashboard/pitch-deck",
    },
    {
      icon: MessageSquare,
      title: "AI Assistant",
      description: "Chat with Tesseract AI",
      href: "/dashboard/chat",
    },
    {
      icon: Users,
      title: "CRM",
      description: "Manage relationships",
      href: "/dashboard/crm",
    },
  ]

  const displayStats = [
    { label: "Investment Firms", value: stats.totalFirms.toString(), icon: Target, trend: null },
    { label: "Active Deals", value: stats.activeDeals.toString(), icon: Briefcase, trend: null },
    { label: "Pipeline Value", value: formatAmount(stats.pipelineValue), icon: TrendingUp, trend: null },
  ]

  const recentActivity = [
    { type: "system", message: "Welcome to Tesseract! Upload your pitch deck to get started.", time: "Just now" },
  ]

  const upcomingTasks = [
    { title: "Upload Pitch Deck", priority: "high", dueDate: "Start here" },
    { title: "Complete Company Profile", priority: "medium", dueDate: "Recommended" },
    { title: "Set Investment Criteria", priority: "low", dueDate: "Optional" },
  ]

  return (
    <div className="min-h-screen">
      {/* Top bar - Optimus style */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-foreground/10">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-2">
              <span className="w-8 h-px bg-foreground/30" />
              Dashboard
            </span>
            <h1 className="font-display text-2xl tracking-tight">
              Welcome back, {firstName}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-foreground rounded-full" />
            </Button>
            <Button size="sm" className="gap-2 bg-foreground text-background hover:bg-foreground/90 rounded-full">
              <Plus className="w-4 h-4" />
              Quick Add
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="px-8 py-8 space-y-8">
        {/* Stats Grid - Optimus style */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-foreground/10">
          {displayStats.map((stat, index) => (
            <div 
              key={index}
              className="bg-background p-8 hover:bg-foreground/[0.02] transition-colors group"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 flex items-center justify-center bg-foreground/5">
                  <stat.icon className="w-6 h-6 text-muted-foreground" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="font-display text-4xl tracking-tight mb-2">{stat.value}</p>
              <p className="text-sm text-muted-foreground font-mono">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Quick Actions - Optimus style */}
        <div>
          <div className="flex items-center gap-4 mb-6">
            <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
              Quick Actions
            </span>
            <div className="flex-1 h-px bg-foreground/10" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-foreground/10">
            {quickActions.map((action, index) => (
              <Link
                key={index}
                href={action.href}
                className="group bg-background p-8 hover:bg-foreground/[0.02] transition-colors"
              >
                <div className="w-12 h-12 flex items-center justify-center bg-foreground/5 mb-6">
                  <action.icon className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-display text-lg mb-2 flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                  {action.title}
                  <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                </h3>
                <p className="text-sm text-muted-foreground">{action.description}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Getting Started Card - Optimus style */}
          <div className="lg:col-span-3">
            <div className="bg-foreground text-background p-10">
              <div className="flex items-start justify-between mb-8">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-background/50 block mb-3">
                    Getting Started
                  </span>
                  <h2 className="font-display text-3xl tracking-tight mb-4">
                    Upload your pitch deck
                  </h2>
                  <p className="text-background/60 max-w-md leading-relaxed">
                    Get AI-powered investor matches and MBB-style feedback on your presentation in minutes.
                  </p>
                </div>
                <div className="w-16 h-16 bg-background/10 flex items-center justify-center">
                  <FileText className="w-8 h-8 text-background/60" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Button className="bg-background text-foreground hover:bg-background/90 rounded-full px-6">
                  <FileText className="w-4 h-4 mr-2" />
                  Upload Pitch Deck
                </Button>
                <Button variant="ghost" className="text-background hover:bg-background/10 rounded-full">
                  Learn more
                </Button>
              </div>
            </div>

            {/* Recent Activity - Optimus style */}
            <div className="mt-8">
              <div className="flex items-center gap-4 mb-6">
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                  Recent Activity
                </span>
                <div className="flex-1 h-px bg-foreground/10" />
              </div>
              <div className="space-y-0">
                {recentActivity.map((activity, index) => (
                  <div 
                    key={index}
                    className="flex items-start gap-6 py-6 border-b border-foreground/10"
                  >
                    <div className="w-10 h-10 bg-foreground/5 flex items-center justify-center shrink-0">
                      <Sparkles className="w-5 h-5 text-foreground/60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed">{activity.message}</p>
                      <p className="font-mono text-[10px] text-muted-foreground mt-2">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tasks Panel - Optimus style */}
          <div className="lg:col-span-2">
            <div className="border border-foreground/10 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-display text-lg">Next Steps</h3>
                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  {upcomingTasks.length} tasks
                </span>
              </div>
              <div className="space-y-0">
                {upcomingTasks.map((task, index) => (
                  <div 
                    key={index}
                    className="flex items-center gap-4 py-4 border-b border-foreground/10 last:border-0 hover:bg-foreground/[0.02] transition-colors cursor-pointer group -mx-6 px-6"
                  >
                    <div className={`w-2 h-2 ${
                      task.priority === "high" ? "bg-foreground" :
                      task.priority === "medium" ? "bg-foreground/50" : "bg-foreground/20"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium group-hover:translate-x-1 transition-transform">{task.title}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{task.dueDate}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
            </div>

            {/* AI Chat CTA - Optimus style */}
            <div className="mt-6 border border-foreground/10 p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-foreground/5 flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-foreground/60" />
                </div>
                <div>
                  <h4 className="font-display">AI Assistant</h4>
                  <p className="text-xs text-muted-foreground font-mono">Get fundraising advice</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                Ask anything about fundraising, investor outreach, or pitch strategy.
              </p>
              <Link 
                href="/dashboard/chat"
                className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:translate-x-1 transition-transform"
              >
                Start chatting <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
