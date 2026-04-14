"use client"

import type { User } from "@supabase/supabase-js"
import { 
  TrendingUp, 
  Plus,
  Filter,
  ArrowUpRight,
  Clock,
  DollarSign,
  Building2,
  Calendar,
  MoreHorizontal,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface DealsContentProps {
  user: User
}

const mockDeals = [
  {
    id: 1,
    investor: "Sequoia Capital",
    status: "In Progress",
    stage: "Due Diligence",
    amount: "$2M",
    lastActivity: "2 days ago",
    nextStep: "Term Sheet Review",
  },
  {
    id: 2,
    investor: "Y Combinator",
    status: "Negotiating",
    stage: "Term Sheet",
    amount: "$500K",
    lastActivity: "1 week ago",
    nextStep: "Founder Meeting",
  },
  {
    id: 3,
    investor: "First Round Capital",
    status: "Initial Contact",
    stage: "Intro Call",
    amount: "$1.5M",
    lastActivity: "3 days ago",
    nextStep: "Send Deck",
  },
]

const statusColors: Record<string, string> = {
  "In Progress": "bg-blue-100 text-blue-700",
  "Negotiating": "bg-amber-100 text-amber-700",
  "Initial Contact": "bg-gray-100 text-gray-700",
  "Closed Won": "bg-green-100 text-green-700",
  "Closed Lost": "bg-red-100 text-red-700",
}

export function DealsContent({ user }: DealsContentProps) {
  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Deal Flow</span>
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Active Deals
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="w-4 h-4" />
              Filter
            </Button>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              New Deal
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="px-8 py-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-card/50 border border-border/50 rounded-xl p-5">
            <p className="text-sm text-muted-foreground mb-1">Active Deals</p>
            <p className="font-display text-2xl font-semibold">{mockDeals.length}</p>
          </div>
          <div className="bg-card/50 border border-border/50 rounded-xl p-5">
            <p className="text-sm text-muted-foreground mb-1">Total Pipeline</p>
            <p className="font-display text-2xl font-semibold">$4M</p>
          </div>
          <div className="bg-card/50 border border-border/50 rounded-xl p-5">
            <p className="text-sm text-muted-foreground mb-1">In Due Diligence</p>
            <p className="font-display text-2xl font-semibold">1</p>
          </div>
          <div className="bg-card/50 border border-border/50 rounded-xl p-5">
            <p className="text-sm text-muted-foreground mb-1">Avg. Response Time</p>
            <p className="font-display text-2xl font-semibold">3.2 days</p>
          </div>
        </div>

        {/* Deals list */}
        <div className="bg-card/50 border border-border/50 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border/50">
            <h2 className="font-display font-semibold">All Deals</h2>
          </div>
          <div className="divide-y divide-border/50">
            {mockDeals.map((deal) => (
              <div 
                key={deal.id}
                className="px-6 py-5 hover:bg-muted/30 transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium flex items-center gap-2">
                        {deal.investor}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[deal.status]}`}>
                          {deal.status}
                        </span>
                      </h3>
                      <p className="text-sm text-muted-foreground">{deal.stage}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <p className="font-medium">{deal.amount}</p>
                      <p className="text-xs text-muted-foreground">Target raise</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">{deal.nextStep}</p>
                      <p className="text-xs text-muted-foreground">Next step</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {deal.lastActivity}
                    </div>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Empty state hint */}
        {mockDeals.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-muted mx-auto mb-4 flex items-center justify-center">
              <TrendingUp className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-lg font-semibold mb-2">No active deals</h3>
            <p className="text-muted-foreground mb-6">Start by finding investors and initiating conversations.</p>
            <Button>Find Investors</Button>
          </div>
        )}
      </div>
    </div>
  )
}
