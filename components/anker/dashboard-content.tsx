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
  Clock,
  Bell,
  Calendar,
  ArrowRight,
  Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface DashboardContentProps {
  user: User
}

export function DashboardContent({ user }: DashboardContentProps) {
  const firstName = user.user_metadata?.first_name || user.email?.split("@")[0] || "Founder"

  const quickActions = [
    {
      icon: Search,
      title: "Find Investors",
      description: "AI-powered investor matching",
      href: "/dashboard/investors",
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "border-blue-100",
    },
    {
      icon: FileText,
      title: "Analyze Pitch Deck",
      description: "Get MBB-style feedback",
      href: "/dashboard/pitch-deck",
      color: "text-amber-600",
      bgColor: "bg-amber-50",
      borderColor: "border-amber-100",
    },
    {
      icon: MessageSquare,
      title: "AI Assistant",
      description: "Chat with Anker AI",
      href: "/dashboard/chat",
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "border-green-100",
    },
    {
      icon: Users,
      title: "CRM",
      description: "Manage relationships",
      href: "/dashboard/crm",
      color: "text-violet-600",
      bgColor: "bg-violet-50",
      borderColor: "border-violet-100",
    },
  ]

  const stats = [
    { label: "Investor Matches", value: "0", icon: Target, trend: null },
    { label: "Outreach Sent", value: "0", icon: Briefcase, trend: null },
    { label: "Response Rate", value: "—", icon: TrendingUp, trend: null },
  ]

  const recentActivity = [
    { type: "system", message: "Welcome to Anker! Upload your pitch deck to get started.", time: "Just now" },
  ]

  const upcomingTasks = [
    { title: "Upload Pitch Deck", priority: "high", dueDate: "Start here" },
    { title: "Complete Company Profile", priority: "medium", dueDate: "Recommended" },
    { title: "Set Investment Criteria", priority: "low", dueDate: "Optional" },
  ]

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Dashboard</span>
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Welcome back, {firstName}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Quick Add
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="px-8 py-8 space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map((stat, index) => (
            <div 
              key={index}
              className="relative bg-card/50 border border-border/50 rounded-xl p-6 hover:border-primary/20 transition-all group"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center">
                  <stat.icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="font-display text-3xl font-semibold mb-1">{stat.value}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-lg font-semibold">Quick Actions</h2>
            <Link href="/dashboard/investors" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <Link
                key={index}
                href={action.href}
                className={`group relative bg-card/50 border ${action.borderColor} rounded-xl p-6 hover:border-primary/30 hover:shadow-sm transition-all`}
              >
                <div className={`w-11 h-11 rounded-xl ${action.bgColor} flex items-center justify-center mb-4`}>
                  <action.icon className={`w-5 h-5 ${action.color}`} />
                </div>
                <h3 className="font-display font-semibold mb-1 flex items-center gap-2">
                  {action.title}
                  <ChevronRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-muted-foreground" />
                </h3>
                <p className="text-sm text-muted-foreground">{action.description}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Getting Started Card */}
          <div className="lg:col-span-3">
            <div className="bg-foreground text-background rounded-2xl p-8">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-background/60 block mb-2">
                    Getting Started
                  </span>
                  <h2 className="font-display text-2xl font-semibold mb-2">
                    Upload your pitch deck
                  </h2>
                  <p className="text-background/70 max-w-md">
                    Get AI-powered investor matches and MBB-style feedback on your presentation in minutes.
                  </p>
                </div>
                <div className="w-16 h-16 rounded-xl bg-background/10 flex items-center justify-center">
                  <FileText className="w-8 h-8 text-background/80" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Button className="bg-background text-foreground hover:bg-background/90">
                  <FileText className="w-4 h-4 mr-2" />
                  Upload Pitch Deck
                </Button>
                <Button variant="ghost" className="text-background hover:bg-background/10">
                  Learn more
                </Button>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="mt-6">
              <h3 className="font-display text-lg font-semibold mb-4">Recent Activity</h3>
              <div className="space-y-3">
                {recentActivity.map((activity, index) => (
                  <div 
                    key={index}
                    className="flex items-start gap-4 p-4 bg-card/50 border border-border/50 rounded-xl"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{activity.message}</p>
                      <p className="font-mono text-[10px] text-muted-foreground mt-1">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tasks Panel */}
          <div className="lg:col-span-2">
            <div className="bg-card/50 border border-border/50 rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-display font-semibold">Next Steps</h3>
                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  {upcomingTasks.length} tasks
                </span>
              </div>
              <div className="space-y-3">
                {upcomingTasks.map((task, index) => (
                  <div 
                    key={index}
                    className="flex items-center gap-4 p-4 bg-background border border-border/50 rounded-lg hover:border-primary/30 transition-colors cursor-pointer group"
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      task.priority === "high" ? "bg-red-500" :
                      task.priority === "medium" ? "bg-amber-500" : "bg-green-500"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{task.dueDate}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
              </div>
            </div>

            {/* AI Chat CTA */}
            <div className="mt-6 bg-gradient-to-br from-primary/5 via-primary/10 to-transparent border border-primary/20 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-display font-semibold">AI Assistant</h4>
                  <p className="text-xs text-muted-foreground">Get fundraising advice</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Ask anything about fundraising, investor outreach, or pitch strategy.
              </p>
              <Link 
                href="/dashboard/chat"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
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
