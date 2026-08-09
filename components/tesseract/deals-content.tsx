"use client"

import { useState } from "react"
import type { User } from "@supabase/supabase-js"
import type { Deal, InvestmentFirm, Investor } from "@/lib/db/types"
import { DEAL_STAGES } from "@/lib/db/types"
import { 
  TrendingUp, 
  Plus,
  Filter,
  Clock,
  Building2,
  MoreHorizontal,
  ChevronRight,
  DollarSign,
  Target,
  Calendar,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface DealsContentProps {
  user: User
  deals: Deal[]
  firms: InvestmentFirm[]
  investors: Investor[]
}

function formatAmount(amount: number | null): string {
  if (!amount) return "—"
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`
  return `$${amount}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return date.toLocaleDateString()
}

const stageColors: Record<string, string> = {
  prospect: "bg-foreground/10 text-foreground",
  contacted: "bg-blue-500/10 text-blue-600",
  meeting_scheduled: "bg-amber-500/10 text-amber-600",
  meeting_completed: "bg-amber-500/10 text-amber-600",
  due_diligence: "bg-purple-500/10 text-purple-600",
  term_sheet: "bg-emerald-500/10 text-emerald-600",
  negotiation: "bg-emerald-500/10 text-emerald-600",
  closed_won: "bg-green-500/10 text-green-600",
  closed_lost: "bg-red-500/10 text-red-600",
}

const stageLabels: Record<string, string> = {
  prospect: "Prospect",
  contacted: "Contacted",
  meeting_scheduled: "Meeting Scheduled",
  meeting_completed: "Meeting Completed",
  due_diligence: "Due Diligence",
  term_sheet: "Term Sheet",
  negotiation: "Negotiation",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
}

export function DealsContent({ user, deals, firms, investors }: DealsContentProps) {
  const [stageFilter, setStageFilter] = useState<string | null>(null)

  // Create lookup maps
  const firmMap = new Map(firms.map(f => [f.id, f]))
  const investorMap = new Map(investors.map(i => [i.id, i]))

  // Filter deals
  const filteredDeals = deals.filter(deal => {
    return !stageFilter || deal.stage === stageFilter
  })

  // Stats
  const totalPipeline = deals.reduce((sum, d) => sum + (d.amount || 0), 0)
  const activeDeals = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage || '')).length
  const inDueDiligence = deals.filter(d => d.stage === 'due_diligence').length

  // Group deals by stage for pipeline view
  const dealsByStage = DEAL_STAGES.reduce((acc, stage) => {
    acc[stage] = deals.filter(d => d.stage === stage)
    return acc
  }, {} as Record<string, Deal[]>)

  return (
    <div className="min-h-screen">
      {/* Top bar - Optimus style */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-foreground/10">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              <span className="w-2.5 h-2.5 bg-[#2f45e0]" /> Deal Flow
            </div>
            <h1 className="text-3xl font-display tracking-tight">
              Active deals
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="w-4 h-4" />
              Filter
            </Button>
            <Button size="sm" className="gap-2 bg-foreground text-background hover:bg-foreground/90 rounded-full">
              <Plus className="w-4 h-4" />
              New Deal
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="px-8 py-8 space-y-8">
        {/* Stats Grid - Optimus style */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-foreground/10">
          <div className="bg-background p-6">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Active Deals</p>
            <p className="font-display text-3xl tracking-tight">{activeDeals}</p>
          </div>
          <div className="bg-background p-6">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Total Pipeline</p>
            <p className="font-display text-3xl tracking-tight">{formatAmount(totalPipeline)}</p>
          </div>
          <div className="bg-background p-6">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">In Due Diligence</p>
            <p className="font-display text-3xl tracking-tight">{inDueDiligence}</p>
          </div>
          <div className="bg-background p-6">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Total Deals</p>
            <p className="font-display text-3xl tracking-tight">{deals.length}</p>
          </div>
        </div>

        {/* Stage filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <Button 
            variant={stageFilter === null ? "default" : "outline"} 
            size="sm"
            onClick={() => setStageFilter(null)}
            className={stageFilter === null ? "bg-foreground text-background" : ""}
          >
            All Stages
          </Button>
          {DEAL_STAGES.slice(0, 6).map(stage => (
            <Button 
              key={stage}
              variant={stageFilter === stage ? "default" : "outline"} 
              size="sm"
              onClick={() => setStageFilter(stageFilter === stage ? null : stage)}
              className={stageFilter === stage ? "bg-foreground text-background" : ""}
            >
              {stageLabels[stage]} ({dealsByStage[stage]?.length || 0})
            </Button>
          ))}
        </div>

        {/* Results header */}
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            {filteredDeals.length} Deals
          </span>
          <div className="flex-1 h-px bg-foreground/10" />
        </div>

        {/* Deals list - Optimus style */}
        <div className="border border-foreground/10">
          {filteredDeals.length > 0 ? (
            <div className="divide-y divide-foreground/10">
              {filteredDeals.map((deal) => {
                const firm = deal.firm_id ? firmMap.get(deal.firm_id) : null
                const investor = deal.investor_id ? investorMap.get(deal.investor_id) : null
                const displayName = firm?.name || investor?.first_name || "Unknown"
                
                return (
                  <div 
                    key={deal.id}
                    className="p-6 hover:bg-foreground/[0.02] transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {firm?.logo_url ? (
                          <img 
                            src={firm.logo_url} 
                            alt={firm.name}
                            className="w-12 h-12 object-contain bg-foreground/5"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-foreground/5 flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <h3 className="font-medium flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                            {displayName}
                            <span className={`px-2 py-0.5 text-xs font-medium ${stageColors[deal.stage || 'prospect']}`}>
                              {stageLabels[deal.stage || 'prospect']}
                            </span>
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {deal.status || 'Active'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="font-display text-lg">{formatAmount(deal.amount)}</p>
                          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Amount</p>
                        </div>
                        {deal.probability && (
                          <div className="text-right">
                            <p className="font-display text-lg">{deal.probability}%</p>
                            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Probability</p>
                          </div>
                        )}
                        {deal.next_step && (
                          <div className="text-right max-w-[150px]">
                            <p className="text-sm truncate">{deal.next_step}</p>
                            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Next Step</p>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          {formatDate(deal.updated_at)}
                        </div>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {deal.notes && (
                      <div className="mt-4 ml-16 text-sm text-muted-foreground line-clamp-1">
                        {deal.notes}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-16">
              <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-display text-lg mb-2">No deals found</h3>
              <p className="text-sm text-muted-foreground mb-6">
                {stageFilter ? "No deals in this stage" : "Start by finding investors and initiating conversations"}
              </p>
              <Link href="/dashboard/investors">
                <Button className="bg-foreground text-background hover:bg-foreground/90 rounded-full">
                  Find Investors
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
