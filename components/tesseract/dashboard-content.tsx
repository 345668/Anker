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
  Building2,
  DollarSign,
  CheckCircle2,
  Clock,
  BarChart3,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface RecentDeal {
  id: string
  name: string
  stage: string
  amount: number | null
  firmName: string | null
  updatedAt: string | null
}

interface DashboardStats {
  totalFirms: number
  totalDeals: number
  totalContacts: number
  totalInvestors: number
  activeDeals: number
  closedDeals: number
  pipelineValue: number
  closedValue: number
  recentDeals: RecentDeal[]
}

interface DashboardContentProps {
  user: User
  stats: DashboardStats
}

function formatAmount(amount: number): string {
  if (amount >= 1000000000) return `$${(amount / 1000000000).toFixed(1)}B`
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`
  return `$${amount.toFixed(0)}`
}

function formatStage(stage: string): string {
  const stageMap: Record<string, string> = {
    'prospect': 'Prospect',
    'contacted': 'Contacted',
    'meeting': 'Meeting',
    'due_diligence': 'Due Diligence',
    'term_sheet': 'Term Sheet',
    'closed_won': 'Won',
    'closed_lost': 'Lost',
    'won': 'Won',
    'lost': 'Lost',
  }
  return stageMap[stage] || stage
}

function getStageColor(stage: string): string {
  if (['closed_won', 'won'].includes(stage)) return 'bg-green-500'
  if (['closed_lost', 'lost'].includes(stage)) return 'bg-red-500'
  if (['term_sheet', 'due_diligence'].includes(stage)) return 'bg-amber-500'
  if (['meeting', 'contacted'].includes(stage)) return 'bg-blue-500'
  return 'bg-foreground/30'
}

function timeAgo(dateString: string | null): string {
  if (!dateString) return 'Recently'
  const date = new Date(dateString)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function DashboardContent({ user, stats }: DashboardContentProps) {
  const firstName = user.user_metadata?.first_name || user.email?.split("@")[0] || "Founder"

  const quickActions = [
    {
      icon: Search,
      title: "Discover Investors",
      description: "AI-powered investor matching",
      href: "/dashboard/discover",
    },
    {
      icon: Briefcase,
      title: "Deal Pipeline",
      description: "Manage your deals",
      href: "/dashboard/pipeline",
    },
    {
      icon: Users,
      title: "CRM",
      description: "Manage relationships",
      href: "/dashboard/crm",
    },
    {
      icon: FileText,
      title: "Documents",
      description: "Pitch deck & data room",
      href: "/dashboard/documents",
    },
  ]

  const displayStats = [
    { 
      label: "Investment Firms", 
      value: stats.totalFirms.toLocaleString(), 
      icon: Building2, 
      href: "/dashboard/discover",
      subtext: `${stats.totalInvestors} investors`
    },
    { 
      label: "Active Deals", 
      value: stats.activeDeals.toString(), 
      icon: Target, 
      href: "/dashboard/pipeline",
      subtext: stats.pipelineValue > 0 ? formatAmount(stats.pipelineValue) + ' pipeline' : 'Start tracking'
    },
    { 
      label: "Closed Deals", 
      value: stats.closedDeals.toString(), 
      icon: CheckCircle2, 
      href: "/dashboard/pipeline",
      subtext: stats.closedValue > 0 ? formatAmount(stats.closedValue) + ' raised' : 'No closed deals yet'
    },
    { 
      label: "Contacts", 
      value: stats.totalContacts.toString(), 
      icon: Users, 
      href: "/dashboard/crm",
      subtext: 'In your network'
    },
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
            </Button>
            <Link href="/dashboard/discover">
              <Button size="sm" className="gap-2 bg-foreground text-background hover:bg-foreground/90 rounded-full">
                <Search className="w-4 h-4" />
                Find Investors
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="px-8 py-8 space-y-8">
        {/* Stats Grid - Optimus style with 4 columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-foreground/10">
          {displayStats.map((stat, index) => (
            <Link 
              key={index}
              href={stat.href}
              className="bg-background p-6 hover:bg-foreground/[0.02] transition-colors group"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 flex items-center justify-center bg-foreground/5">
                  <stat.icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="font-display text-3xl tracking-tight mb-1">{stat.value}</p>
              <p className="text-sm text-muted-foreground font-mono">{stat.label}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{stat.subtext}</p>
            </Link>
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
                className="group bg-background p-6 hover:bg-foreground/[0.02] transition-colors"
              >
                <div className="w-10 h-10 flex items-center justify-center bg-foreground/5 mb-4">
                  <action.icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <h3 className="font-display text-base mb-1 flex items-center gap-2 group-hover:translate-x-1 transition-transform">
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
          {/* Recent Deals */}
          <div className="lg:col-span-3">
            <div className="flex items-center gap-4 mb-6">
              <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                Recent Deals
              </span>
              <div className="flex-1 h-px bg-foreground/10" />
              <Link href="/dashboard/pipeline" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                View all
              </Link>
            </div>
            
            {stats.recentDeals.length > 0 ? (
              <div className="space-y-0 border border-foreground/10">
                {stats.recentDeals.map((deal, index) => (
                  <Link 
                    key={deal.id}
                    href={`/dashboard/pipeline?deal=${deal.id}`}
                    className="flex items-center gap-4 p-4 border-b border-foreground/10 last:border-0 hover:bg-foreground/[0.02] transition-colors group"
                  >
                    <div className={`w-2 h-2 rounded-full ${getStageColor(deal.stage)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{deal.name}</p>
                        <span className="text-xs text-muted-foreground font-mono px-2 py-0.5 bg-foreground/5">
                          {formatStage(deal.stage)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {deal.firmName || 'No firm assigned'}
                        {deal.amount && ` · ${formatAmount(deal.amount)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground font-mono">
                        {timeAgo(deal.updatedAt)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="border border-foreground/10 p-8 text-center">
                <div className="w-12 h-12 bg-foreground/5 flex items-center justify-center mx-auto mb-4">
                  <Briefcase className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="font-display text-lg mb-2">No deals yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Start tracking your fundraising pipeline
                </p>
                <Link href="/dashboard/discover">
                  <Button size="sm" className="rounded-full">
                    Find Investors
                  </Button>
                </Link>
              </div>
            )}

            {/* Getting Started Card */}
            {stats.activeDeals === 0 && (
              <div className="mt-6 bg-foreground text-background p-8">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-background/50 block mb-2">
                      Getting Started
                    </span>
                    <h2 className="font-display text-2xl tracking-tight mb-3">
                      Find your ideal investors
                    </h2>
                    <p className="text-background/60 max-w-md leading-relaxed text-sm">
                      Use our AI-powered matching to discover investors that align with your stage, industry, and funding goals.
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-background/10 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-background/60" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Link href="/dashboard/discover">
                    <Button className="bg-background text-foreground hover:bg-background/90 rounded-full px-5">
                      <Search className="w-4 h-4 mr-2" />
                      Discover Investors
                    </Button>
                  </Link>
                  <Link href="/dashboard/documents">
                    <Button variant="ghost" className="text-background hover:bg-background/10 rounded-full">
                      Upload Pitch Deck
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="lg:col-span-2 space-y-6">
            {/* Pipeline Summary */}
            <div className="border border-foreground/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg">Pipeline Summary</h3>
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Deals</span>
                  <span className="font-mono text-sm">{stats.totalDeals}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Active</span>
                  <span className="font-mono text-sm">{stats.activeDeals}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Closed</span>
                  <span className="font-mono text-sm">{stats.closedDeals}</span>
                </div>
                <div className="h-px bg-foreground/10 my-2" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Pipeline Value</span>
                  <span className="font-mono text-sm font-medium">
                    {stats.pipelineValue > 0 ? formatAmount(stats.pipelineValue) : '$0'}
                  </span>
                </div>
              </div>
            </div>

            {/* AI Assistant CTA */}
            <div className="border border-foreground/10 p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 bg-foreground/5 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-foreground/60" />
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

            {/* Quick Links */}
            <div className="border border-foreground/10 p-6">
              <h3 className="font-display text-lg mb-4">Quick Links</h3>
              <div className="space-y-2">
                <Link 
                  href="/dashboard/settings"
                  className="flex items-center justify-between py-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                >
                  <span>Company Profile</span>
                  <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
                <Link 
                  href="/dashboard/documents"
                  className="flex items-center justify-between py-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                >
                  <span>Data Room</span>
                  <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
                <Link 
                  href="/dashboard/analytics"
                  className="flex items-center justify-between py-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                >
                  <span>Analytics</span>
                  <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
