"use client"

import { useState, useMemo, useTransition } from "react"
import type { User } from "@supabase/supabase-js"
import { 
  Compass,
  Search,
  Filter,
  Building2,
  MapPin,
  Globe,
  Linkedin,
  TrendingUp,
  Target,
  Sparkles,
  ChevronRight,
  ExternalLink,
  Star,
  Mail,
  ArrowUpRight,
  Layers,
  DollarSign,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { InvestmentFirm, InvestorMatch } from "@/lib/db/types"
import { runMatching, updateMatchStatus, addToOutreach } from "@/app/dashboard/discover/actions"

interface DiscoverContentProps {
  user: User
  initialFirms: InvestmentFirm[]
  initialMatches: InvestorMatch[]
  stats: {
    totalFirms: number
    totalDeals: number
    totalContacts: number
    totalInvestors: number
    activeDeals: number
    pipelineValue: number
  }
}

type ViewMode = "firms" | "matches"
type FilterStage = "all" | "pre-seed" | "seed" | "series-a" | "series-b" | "growth"

const STAGES: { value: FilterStage; label: string }[] = [
  { value: "all", label: "All Stages" },
  { value: "pre-seed", label: "Pre-Seed" },
  { value: "seed", label: "Seed" },
  { value: "series-a", label: "Series A" },
  { value: "series-b", label: "Series B" },
  { value: "growth", label: "Growth" },
]

const MATCH_TIERS = {
  S: { label: "Perfect", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  A: { label: "Excellent", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  B: { label: "Good", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  C: { label: "Fair", color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
}

function formatAmount(amount: number | null): string {
  if (!amount) return "N/A"
  if (amount >= 1000000000) return `$${(amount / 1000000000).toFixed(1)}B`
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`
  return `$${amount}`
}

export function DiscoverContent({ 
  user, 
  initialFirms, 
  initialMatches,
  stats 
}: DiscoverContentProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("firms")
  const [searchQuery, setSearchQuery] = useState("")
  const [stageFilter, setStageFilter] = useState<FilterStage>("all")
  const [showFilters, setShowFilters] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [matchingStatus, setMatchingStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' })

  const handleRunMatching = () => {
    setMatchingStatus({ type: null, message: '' })
    startTransition(async () => {
      const result = await runMatching()
      if (result.success) {
        setMatchingStatus({ 
          type: 'success', 
          message: `Found ${result.matchCount} matches! Top score: ${Math.round((result.topScore || 0) * 100)}%` 
        })
        setViewMode('matches')
      } else {
        setMatchingStatus({ type: 'error', message: result.error || 'Matching failed' })
      }
    })
  }

  // Filter firms based on search and stage
  const filteredFirms = useMemo(() => {
    return initialFirms.filter(firm => {
      const matchesSearch = !searchQuery || 
        firm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        firm.industries?.some(i => i.toLowerCase().includes(searchQuery.toLowerCase())) ||
        firm.hq_location?.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesStage = stageFilter === "all" || 
        firm.stages?.some(s => s.toLowerCase().includes(stageFilter))
      
      return matchesSearch && matchesStage
    })
  }, [initialFirms, searchQuery, stageFilter])

  // Filter matches
  const filteredMatches = useMemo(() => {
    return initialMatches.filter(match => {
      const matchesSearch = !searchQuery ||
        match.firm_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        match.investor_name?.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesSearch
    }).sort((a, b) => b.score - a.score)
  }, [initialMatches, searchQuery])

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-xl border-b border-foreground/10">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Compass className="w-4 h-4 text-foreground" />
                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  Discover
                </span>
              </div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                Find Your Investors
              </h1>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Stats */}
              <div className="flex items-center gap-6 mr-4 px-4 py-2 bg-foreground/5 rounded-lg">
                <div className="text-center">
                  <p className="font-display text-lg font-semibold">{stats.totalFirms}</p>
                  <p className="font-mono text-[10px] text-muted-foreground uppercase">Firms</p>
                </div>
                <div className="w-px h-8 bg-foreground/10" />
                <div className="text-center">
                  <p className="font-display text-lg font-semibold">{filteredMatches.length}</p>
                  <p className="font-mono text-[10px] text-muted-foreground uppercase">Matches</p>
                </div>
              </div>

              <Button 
                variant="outline" 
                className="gap-2"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4" />
                Filters
              </Button>
              
              <Button 
                className="gap-2 bg-foreground text-background hover:bg-foreground/90"
                onClick={handleRunMatching}
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Matching...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Run AI Match
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* View Toggle & Search */}
          <div className="flex items-center gap-4 mt-6">
            {/* View Toggle */}
            <div className="flex p-1 bg-foreground/5 rounded-lg">
              <button
                onClick={() => setViewMode("firms")}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  viewMode === "firms"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Building2 className="w-4 h-4 inline-block mr-2" />
                Investment Firms
              </button>
              <button
                onClick={() => setViewMode("matches")}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  viewMode === "matches"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Target className="w-4 h-4 inline-block mr-2" />
                AI Matches
                {filteredMatches.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-600 rounded">
                    {filteredMatches.length}
                  </span>
                )}
              </button>
            </div>

            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={viewMode === "firms" ? "Search firms, industries, locations..." : "Search matches..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-foreground/5 border-0 focus-visible:ring-1"
              />
            </div>

            {/* Stage Filter */}
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as FilterStage)}
              className="px-4 py-2 text-sm bg-foreground/5 border-0 rounded-lg focus:outline-none focus:ring-1 focus:ring-foreground/20"
            >
              {STAGES.map(stage => (
                <option key={stage.value} value={stage.value}>{stage.label}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Status Message */}
      {matchingStatus.type && (
        <div className={`mx-8 mt-4 p-4 rounded-lg flex items-center gap-3 ${
          matchingStatus.type === 'success' 
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {matchingStatus.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <p className="text-sm">{matchingStatus.message}</p>
        </div>
      )}

      {/* Content */}
      <div className="px-8 py-8">
        {viewMode === "firms" ? (
          /* Firms Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFirms.length === 0 ? (
              <div className="col-span-full py-16 text-center">
                <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="font-display text-lg font-semibold mb-2">No firms found</h3>
                <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
              </div>
            ) : (
              filteredFirms.map((firm) => (
                <FirmCard key={firm.id} firm={firm} />
              ))
            )}
          </div>
        ) : (
          /* Matches List */
          <div className="space-y-4">
            {filteredMatches.length === 0 ? (
              <div className="py-16 text-center">
                <Target className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="font-display text-lg font-semibold mb-2">No matches yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Run AI matching to discover your best-fit investors</p>
                <Button 
                  className="gap-2"
                  onClick={handleRunMatching}
                  disabled={isPending}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Run AI Match
                    </>
                  )}
                </Button>
              </div>
            ) : (
              filteredMatches.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function FirmCard({ firm }: { firm: InvestmentFirm }) {
  return (
    <div className="group bg-background border border-foreground/10 rounded-xl p-5 hover:border-foreground/20 hover:shadow-sm transition-all">
      <div className="flex items-start gap-4 mb-4">
        {firm.logo_url ? (
          <img 
            src={firm.logo_url} 
            alt={firm.name}
            className="w-12 h-12 rounded-lg object-cover bg-muted"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-foreground/5 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold truncate group-hover:text-foreground transition-colors">
            {firm.name}
          </h3>
          {firm.hq_location && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3" />
              {firm.hq_location}
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowUpRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {firm.stages?.slice(0, 3).map((stage) => (
          <span 
            key={stage} 
            className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-foreground/5 rounded"
          >
            {stage}
          </span>
        ))}
        {firm.industries?.slice(0, 2).map((industry) => (
          <span 
            key={industry} 
            className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-blue-500/10 text-blue-600 rounded"
          >
            {industry}
          </span>
        ))}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-foreground/5">
        <div>
          <p className="font-mono text-[10px] text-muted-foreground uppercase mb-0.5">Check Size</p>
          <p className="text-sm font-medium">
            {firm.check_size_min || firm.check_size_max 
              ? `${formatAmount(firm.check_size_min)} - ${formatAmount(firm.check_size_max)}`
              : "Not specified"
            }
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] text-muted-foreground uppercase mb-0.5">Investments</p>
          <p className="text-sm font-medium">{firm.investment_count || 0}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-foreground/5">
        {firm.website && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8" asChild>
            <a href={firm.website} target="_blank" rel="noopener noreferrer">
              <Globe className="w-3 h-3" />
              Website
            </a>
          </Button>
        )}
        {firm.linkedin_url && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8" asChild>
            <a href={firm.linkedin_url} target="_blank" rel="noopener noreferrer">
              <Linkedin className="w-3 h-3" />
              LinkedIn
            </a>
          </Button>
        )}
        <Button variant="outline" size="sm" className="ml-auto gap-1.5 text-xs h-8">
          <Star className="w-3 h-3" />
          Save
        </Button>
      </div>
    </div>
  )
}

function MatchCard({ match }: { match: InvestorMatch }) {
  const tier = match.tier as keyof typeof MATCH_TIERS
  const tierConfig = MATCH_TIERS[tier] || MATCH_TIERS.C

  return (
    <div className="group bg-background border border-foreground/10 rounded-xl p-6 hover:border-foreground/20 transition-all">
      <div className="flex items-start gap-6">
        {/* Score */}
        <div className="text-center">
          <div className={`w-16 h-16 rounded-xl ${tierConfig.bg} ${tierConfig.border} border-2 flex items-center justify-center mb-2`}>
            <span className={`font-display text-2xl font-bold ${tierConfig.color}`}>
              {match.score}
            </span>
          </div>
          <span className={`px-2 py-0.5 text-[10px] font-mono uppercase ${tierConfig.bg} ${tierConfig.color} rounded`}>
            {tierConfig.label}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-display text-lg font-semibold">
                {match.firm_name || "Unknown Firm"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {match.investor_name || "Contact not specified"}
              </p>
            </div>
            {match.win_probability && (
              <div className="text-right">
                <p className="font-display text-lg font-semibold text-emerald-600">
                  {Math.round(match.win_probability)}%
                </p>
                <p className="font-mono text-[10px] text-muted-foreground uppercase">Win Prob</p>
              </div>
            )}
          </div>

          {/* Factor Scores */}
          <div className="grid grid-cols-6 gap-3 mb-4">
            {[
              { label: "Industry", value: match.factor_industry },
              { label: "Stage", value: match.factor_stage },
              { label: "Geo", value: match.factor_geo },
              { label: "Check", value: match.factor_check_size },
              { label: "Type", value: match.factor_investor_type },
              { label: "Team", value: match.factor_team_signal },
            ].map((factor) => (
              <div key={factor.label}>
                <p className="font-mono text-[9px] text-muted-foreground uppercase mb-1">{factor.label}</p>
                <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-foreground/60 rounded-full transition-all"
                    style={{ width: `${(factor.value || 0) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-4 border-t border-foreground/5">
            <Button size="sm" className="gap-1.5 h-8">
              <Mail className="w-3 h-3" />
              Contact
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 h-8">
              <Target className="w-3 h-3" />
              Add to Pipeline
            </Button>
            {match.firm_website && (
              <Button variant="ghost" size="sm" className="gap-1.5 h-8 ml-auto" asChild>
                <a href={match.firm_website} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3 h-3" />
                  View Profile
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
