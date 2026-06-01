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
  Check,
  X,
  Sparkles,
  TrendingUp,
  Loader2,
  User as UserIcon,
  Globe,
  Linkedin,
} from "lucide-react"
import { acceptMatch, rejectMatch, addMatchToOutreach } from "@/app/dashboard/discover/actions"
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

interface InvestorMatchRecord {
  id: string
  startup_id: string
  startup_name: string | null
  investor_id: string | null
  investor_name: string | null
  investor_email: string | null
  investor_linkedin: string | null
  firm_id: string | null
  firm_name: string | null
  firm_website: string | null
  score: number
  tier: string | null
  tier_label: string | null
  status: string | null
  factor_industry: number | null
  factor_stage: number | null
  factor_geo: number | null
  factor_check_size: number | null
  win_probability: number | null
  created_at: string | null
}

interface PipelineContentProps {
  user: User
  deals: EnrichedDeal[]
  firms: InvestmentFirm[]
  matches?: InvestorMatchRecord[]
  startupId?: string | null
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

export function PipelineContent({ user, deals, firms, matches = [], startupId }: PipelineContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [activeTab, setActiveTab] = useState<'deals' | 'matches'>('deals')
  const [selectedDeal, setSelectedDeal] = useState<EnrichedDeal | null>(null)
  const [selectedMatch, setSelectedMatch] = useState<InvestorMatchRecord | null>(null)

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
              <h1 className="font-display text-2xl tracking-tight">
                {activeTab === 'deals' ? 'Deal Pipeline' : 'AI Matches'}
              </h1>
              {/* Tab Switcher */}
              <div className="flex gap-4 mt-3">
                <button
                  onClick={() => setActiveTab('deals')}
                  className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                    activeTab === 'deals' 
                      ? 'border-foreground text-foreground' 
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Deals ({deals.length})
                </button>
                <button
                  onClick={() => setActiveTab('matches')}
                  className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                    activeTab === 'matches' 
                      ? 'border-foreground text-foreground' 
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  AI Matches ({matches.length})
                </button>
              </div>
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
        {activeTab === 'matches' ? (
          <MatchesView 
            matches={matches} 
            selectedMatch={selectedMatch}
            setSelectedMatch={setSelectedMatch}
          />
        ) : viewMode === 'kanban' ? (
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

// Matches View Component
function MatchesView({ 
  matches, 
  selectedMatch,
  setSelectedMatch 
}: { 
  matches: InvestorMatchRecord[]
  selectedMatch: InvestorMatchRecord | null
  setSelectedMatch: (match: InvestorMatchRecord | null) => void
}) {
  const [processingId, setProcessingId] = useState<string | null>(null)

  const handleAccept = async (matchId: string) => {
    setProcessingId(matchId)
    await acceptMatch(matchId)
    setProcessingId(null)
  }

  const handleReject = async (matchId: string) => {
    setProcessingId(matchId)
    await rejectMatch(matchId)
    setProcessingId(null)
  }

  const handleAddToPipeline = async (matchId: string) => {
    setProcessingId(matchId)
    await addMatchToOutreach(matchId)
    setProcessingId(null)
  }

  // Group matches by status
  const pendingMatches = matches.filter(m => !m.status || m.status === 'pending')
  const acceptedMatches = matches.filter(m => m.status === 'accepted')
  const contactedMatches = matches.filter(m => m.status === 'contacted')
  const rejectedMatches = matches.filter(m => m.status === 'rejected')

  const getTierColor = (tier: string | null) => {
    switch (tier?.toLowerCase()) {
      case 'top': return 'bg-emerald-500'
      case 'high': return 'bg-blue-500'
      case 'medium': return 'bg-amber-500'
      default: return 'bg-slate-400'
    }
  }

  return (
    <div className="p-8 space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 border border-foreground/10">
          <p className="text-xs font-mono text-muted-foreground uppercase">Total Matches</p>
          <p className="font-display text-2xl mt-1">{matches.length}</p>
        </div>
        <div className="p-4 border border-foreground/10">
          <p className="text-xs font-mono text-muted-foreground uppercase">Pending Review</p>
          <p className="font-display text-2xl mt-1 text-amber-600">{pendingMatches.length}</p>
        </div>
        <div className="p-4 border border-foreground/10">
          <p className="text-xs font-mono text-muted-foreground uppercase">Accepted</p>
          <p className="font-display text-2xl mt-1 text-emerald-600">{acceptedMatches.length}</p>
        </div>
        <div className="p-4 border border-foreground/10">
          <p className="text-xs font-mono text-muted-foreground uppercase">In Pipeline</p>
          <p className="font-display text-2xl mt-1 text-blue-600">{contactedMatches.length}</p>
        </div>
      </div>

      {/* Pending Matches */}
      {pendingMatches.length > 0 && (
        <div>
          <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-4">
            Pending Review ({pendingMatches.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingMatches.map((match) => (
              <div key={match.id} className="p-4 border border-foreground/10 hover:border-foreground/20 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2 h-2 rounded-full ${getTierColor(match.tier)}`} />
                      <span className="text-xs font-mono text-muted-foreground uppercase">{match.tier_label || match.tier || 'Match'}</span>
                    </div>
                    <h4 className="font-medium">{match.investor_name || match.firm_name || 'Unknown'}</h4>
                    {match.firm_name && match.investor_name && (
                      <p className="text-sm text-muted-foreground">{match.firm_name}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-sm font-mono">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      {match.score}%
                    </div>
                  </div>
                </div>

                {/* Match Factors */}
                <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                  <div className="flex items-center justify-between bg-foreground/5 px-2 py-1">
                    <span className="text-muted-foreground">Industry</span>
                    <span className="font-mono">{Math.round((match.factor_industry || 0) * 100)}%</span>
                  </div>
                  <div className="flex items-center justify-between bg-foreground/5 px-2 py-1">
                    <span className="text-muted-foreground">Stage</span>
                    <span className="font-mono">{Math.round((match.factor_stage || 0) * 100)}%</span>
                  </div>
                  <div className="flex items-center justify-between bg-foreground/5 px-2 py-1">
                    <span className="text-muted-foreground">Geography</span>
                    <span className="font-mono">{Math.round((match.factor_geo || 0) * 100)}%</span>
                  </div>
                  <div className="flex items-center justify-between bg-foreground/5 px-2 py-1">
                    <span className="text-muted-foreground">Check Size</span>
                    <span className="font-mono">{Math.round((match.factor_check_size || 0) * 100)}%</span>
                  </div>
                </div>

                {/* Links */}
                <div className="flex items-center gap-3 mb-4 text-sm">
                  {match.investor_email && (
                    <a href={`mailto:${match.investor_email}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                      <Mail className="w-3 h-3" />
                      Email
                    </a>
                  )}
                  {match.investor_linkedin && (
                    <a href={match.investor_linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                      <Linkedin className="w-3 h-3" />
                      LinkedIn
                    </a>
                  )}
                  {match.firm_website && (
                    <a href={match.firm_website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                      <Globe className="w-3 h-3" />
                      Website
                    </a>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => handleReject(match.id)}
                    disabled={processingId === match.id}
                  >
                    {processingId === match.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4 mr-1" />}
                    Pass
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => handleAccept(match.id)}
                    disabled={processingId === match.id}
                  >
                    {processingId === match.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                    Accept
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accepted Matches */}
      {acceptedMatches.length > 0 && (
        <div>
          <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-4">
            Accepted ({acceptedMatches.length})
          </h3>
          <div className="border border-foreground/10">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-foreground/5 text-xs font-mono text-muted-foreground uppercase tracking-wider">
              <div className="col-span-3">Investor / Firm</div>
              <div className="col-span-2">Score</div>
              <div className="col-span-2">Tier</div>
              <div className="col-span-2">Email</div>
              <div className="col-span-3">Actions</div>
            </div>
            <div className="divide-y divide-foreground/10">
              {acceptedMatches.map((match) => (
                <div key={match.id} className="grid grid-cols-12 gap-4 px-4 py-3 items-center">
                  <div className="col-span-3">
                    <p className="font-medium truncate">{match.investor_name || match.firm_name}</p>
                    {match.firm_name && match.investor_name && (
                      <p className="text-xs text-muted-foreground truncate">{match.firm_name}</p>
                    )}
                  </div>
                  <div className="col-span-2 font-mono text-sm flex items-center gap-1">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    {match.score}%
                  </div>
                  <div className="col-span-2">
                    <span className={`px-2 py-1 text-xs ${getTierColor(match.tier)} text-white`}>
                      {match.tier_label || match.tier || 'Match'}
                    </span>
                  </div>
                  <div className="col-span-2 text-sm text-muted-foreground truncate">
                    {match.investor_email || '-'}
                  </div>
                  <div className="col-span-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => handleAddToPipeline(match.id)}
                      disabled={processingId === match.id}
                    >
                      {processingId === match.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
                      Add to Pipeline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* In Pipeline */}
      {contactedMatches.length > 0 && (
        <div>
          <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-4">
            In Pipeline ({contactedMatches.length})
          </h3>
          <div className="border border-foreground/10">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-foreground/5 text-xs font-mono text-muted-foreground uppercase tracking-wider">
              <div className="col-span-4">Investor / Firm</div>
              <div className="col-span-2">Score</div>
              <div className="col-span-2">Tier</div>
              <div className="col-span-4">Status</div>
            </div>
            <div className="divide-y divide-foreground/10">
              {contactedMatches.map((match) => (
                <div key={match.id} className="grid grid-cols-12 gap-4 px-4 py-3 items-center">
                  <div className="col-span-4">
                    <p className="font-medium truncate">{match.investor_name || match.firm_name}</p>
                    {match.firm_name && match.investor_name && (
                      <p className="text-xs text-muted-foreground truncate">{match.firm_name}</p>
                    )}
                  </div>
                  <div className="col-span-2 font-mono text-sm flex items-center gap-1">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    {match.score}%
                  </div>
                  <div className="col-span-2">
                    <span className={`px-2 py-1 text-xs ${getTierColor(match.tier)} text-white`}>
                      {match.tier_label || match.tier || 'Match'}
                    </span>
                  </div>
                  <div className="col-span-4">
                    <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700">In Pipeline</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {matches.length === 0 && (
        <div className="text-center py-16 border border-dashed border-foreground/10">
          <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-display text-lg mb-2">No AI Matches Yet</h3>
          <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
            Run the AI matching engine on the Discover page to find investors that match your startup profile.
          </p>
          <Button asChild>
            <a href="/dashboard/discover">Go to Discover</a>
          </Button>
        </div>
      )}
    </div>
  )
}
