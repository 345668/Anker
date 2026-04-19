"use client"

import { useState, useMemo } from "react"
import type { User } from "@supabase/supabase-js"
import type { Deal, InvestmentFirm } from "@/lib/db/types"
import { 
  Search, 
  Plus, 
  MoreHorizontal,
  ChevronRight,
  Building2,
  LayoutGrid,
  List,
  XCircle,
  Mail,
  ExternalLink,
  Calendar,
  DollarSign,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface EnrichedDeal extends Deal {
  firm?: InvestmentFirm | null
}

interface PipelineContentProps {
  user: User
  deals: EnrichedDeal[]
  firms: InvestmentFirm[]
}

const STAGES = [
  { id: 'prospect', label: 'Prospect', color: 'bg-slate-400' },
  { id: 'contacted', label: 'Contacted', color: 'bg-blue-500' },
  { id: 'meeting', label: 'Meeting', color: 'bg-purple-500' },
  { id: 'due_diligence', label: 'Due Diligence', color: 'bg-amber-500' },
  { id: 'term_sheet', label: 'Term Sheet', color: 'bg-orange-500' },
  { id: 'closed_won', label: 'Won', color: 'bg-green-500' },
]

function formatAmount(amount: number | null): string {
  if (!amount) return '-'
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`
  return `$${amount.toFixed(0)}`
}

function timeAgo(dateString: string | null): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  const now = new Date()
  const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function normalizeStage(stage: string | null): string {
  if (!stage) return 'prospect'
  const s = stage.toLowerCase().replace(/[\s-]/g, '_')
  if (s === 'won') return 'closed_won'
  if (s === 'lost') return 'closed_lost'
  return s
}

export function PipelineContent({ user, deals, firms }: PipelineContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [selectedDeal, setSelectedDeal] = useState<EnrichedDeal | null>(null)

  // Filter deals (exclude lost deals from main view)
  const filteredDeals = useMemo(() => {
    let result = deals.filter(d => normalizeStage(d.stage) !== 'closed_lost')
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(d => 
        d.name?.toLowerCase().includes(query) ||
        d.firm?.name?.toLowerCase().includes(query)
      )
    }
    return result
  }, [deals, searchQuery])

  // Group deals by stage
  const dealsByStage = useMemo(() => {
    const grouped: Record<string, EnrichedDeal[]> = {}
    STAGES.forEach(stage => {
      grouped[stage.id] = filteredDeals.filter(d => normalizeStage(d.stage) === stage.id)
    })
    return grouped
  }, [filteredDeals])

  // Calculate metrics
  const metrics = useMemo(() => {
    const active = filteredDeals.filter(d => normalizeStage(d.stage) !== 'closed_won')
    const won = filteredDeals.filter(d => normalizeStage(d.stage) === 'closed_won')
    return {
      total: filteredDeals.length,
      active: active.length,
      won: won.length,
      pipelineValue: active.reduce((sum, d) => sum + Number(d.amount || 0), 0),
      closedValue: won.reduce((sum, d) => sum + Number(d.amount || 0), 0),
    }
  }, [filteredDeals])

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-foreground/10">
        <div className="px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-2">
                <span className="w-8 h-px bg-foreground/30" />
                Pipeline
              </span>
              <h1 className="font-display text-2xl tracking-tight">Deal Pipeline</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center border border-foreground/10">
                <button
                  onClick={() => setViewMode('kanban')}
                  className={`p-2 transition-colors ${viewMode === 'kanban' ? 'bg-foreground text-background' : 'hover:bg-foreground/5'}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-foreground text-background' : 'hover:bg-foreground/5'}`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
              <Button size="sm" className="gap-2 bg-foreground text-background hover:bg-foreground/90 rounded-full">
                <Plus className="w-4 h-4" />
                Add Deal
              </Button>
            </div>
          </div>

          {/* Search and Metrics */}
          <div className="flex items-center gap-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search deals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-foreground/5 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
              />
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Active:</span>
                <span className="font-mono font-medium">{metrics.active}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Pipeline:</span>
                <span className="font-mono font-medium">{formatAmount(metrics.pipelineValue)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Won:</span>
                <span className="font-mono font-medium text-green-600">{formatAmount(metrics.closedValue)}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'kanban' ? (
          <div className="h-full overflow-x-auto">
            <div className="flex gap-px bg-foreground/10 min-w-max h-full p-4">
              {STAGES.map((stage) => (
                <div key={stage.id} className="w-72 flex flex-col bg-background">
                  {/* Column Header */}
                  <div className="p-4 border-b border-foreground/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                        <span className="font-medium text-sm">{stage.label}</span>
                        <span className="text-xs text-muted-foreground font-mono bg-foreground/5 px-1.5 py-0.5">
                          {dealsByStage[stage.id]?.length || 0}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      {formatAmount(dealsByStage[stage.id]?.reduce((sum, d) => sum + Number(d.amount || 0), 0) || 0)}
                    </p>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {dealsByStage[stage.id]?.map((deal) => (
                      <div
                        key={deal.id}
                        onClick={() => setSelectedDeal(deal)}
                        className="p-4 border border-foreground/10 bg-background hover:border-foreground/20 cursor-pointer transition-colors group"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-medium text-sm truncate pr-2">{deal.name || 'Unnamed Deal'}</h3>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button 
                                onClick={(e) => e.stopPropagation()}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-foreground/5"
                              >
                                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>Edit Deal</DropdownMenuItem>
                              <DropdownMenuItem>Move to Next Stage</DropdownMenuItem>
                              <DropdownMenuItem className="text-red-600">Mark as Lost</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        
                        {deal.firm && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                            <Building2 className="w-3 h-3" />
                            <span className="truncate">{deal.firm.name}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-muted-foreground">
                            {formatAmount(deal.amount)}
                          </span>
                          <span className="text-muted-foreground">
                            {timeAgo(deal.updated_at)}
                          </span>
                        </div>
                      </div>
                    ))}

                    {dealsByStage[stage.id]?.length === 0 && (
                      <div className="p-4 border border-dashed border-foreground/10 text-center">
                        <p className="text-xs text-muted-foreground">No deals</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* List View */
          <div className="p-8">
            <div className="border border-foreground/10">
              <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-foreground/5 text-xs font-mono text-muted-foreground uppercase tracking-wider">
                <div className="col-span-4">Deal</div>
                <div className="col-span-2">Firm</div>
                <div className="col-span-2">Stage</div>
                <div className="col-span-2">Amount</div>
                <div className="col-span-2">Updated</div>
              </div>

              <div className="divide-y divide-foreground/10">
                {filteredDeals.map((deal) => {
                  const stage = STAGES.find(s => s.id === normalizeStage(deal.stage)) || STAGES[0]
                  return (
                    <div 
                      key={deal.id}
                      onClick={() => setSelectedDeal(deal)}
                      className="grid grid-cols-12 gap-4 px-4 py-4 hover:bg-foreground/[0.02] cursor-pointer group"
                    >
                      <div className="col-span-4 flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                        <span className="font-medium truncate">{deal.name || 'Unnamed Deal'}</span>
                      </div>
                      <div className="col-span-2 text-sm text-muted-foreground truncate">
                        {deal.firm?.name || '-'}
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs font-mono px-2 py-1 bg-foreground/5">{stage.label}</span>
                      </div>
                      <div className="col-span-2 font-mono text-sm">{formatAmount(deal.amount)}</div>
                      <div className="col-span-2 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{timeAgo(deal.updated_at)}</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  )
                })}

                {filteredDeals.length === 0 && (
                  <div className="px-4 py-12 text-center">
                    <p className="text-muted-foreground">No deals found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Deal Detail Slide-over */}
      {selectedDeal && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setSelectedDeal(null)} />
          <div className="relative w-full max-w-lg bg-background border-l border-foreground/10 overflow-y-auto">
            <div className="sticky top-0 bg-background border-b border-foreground/10 px-6 py-4 flex items-center justify-between">
              <h2 className="font-display text-lg">{selectedDeal.name || 'Deal Details'}</h2>
              <button onClick={() => setSelectedDeal(null)} className="p-2 hover:bg-foreground/5 transition-colors">
                <XCircle className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Stage Selector */}
              <div>
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Stage</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {STAGES.map((stage) => {
                    const isActive = stage.id === normalizeStage(selectedDeal.stage)
                    return (
                      <button
                        key={stage.id}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          isActive ? 'bg-foreground text-background' : 'bg-foreground/5 text-muted-foreground hover:bg-foreground/10'
                        }`}
                      >
                        {stage.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Amount</label>
                <div className="mt-2 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-muted-foreground" />
                  <p className="font-display text-2xl">{formatAmount(selectedDeal.amount)}</p>
                </div>
              </div>

              {/* Firm */}
              {selectedDeal.firm && (
                <div>
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Investment Firm</label>
                  <div className="mt-2 p-4 border border-foreground/10">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-foreground/5 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{selectedDeal.firm.name}</p>
                        <p className="text-xs text-muted-foreground">{selectedDeal.firm.type || 'Investment Firm'}</p>
                      </div>
                    </div>
                    {selectedDeal.firm.website && (
                      <a 
                        href={selectedDeal.firm.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Visit website
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div>
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Timeline</label>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-mono">{selectedDeal.created_at ? new Date(selectedDeal.created_at).toLocaleDateString() : '-'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span className="font-mono">{timeAgo(selectedDeal.updated_at)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Notes</label>
                <textarea
                  className="mt-2 w-full h-32 p-3 bg-foreground/5 border-0 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  placeholder="Add notes about this deal..."
                  defaultValue={selectedDeal.notes || ''}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-foreground/10">
                <Button className="flex-1 bg-foreground text-background hover:bg-foreground/90">
                  Save Changes
                </Button>
                <Button variant="outline" className="border-foreground/20">
                  <Mail className="w-4 h-4 mr-2" />
                  Email
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
