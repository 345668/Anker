"use client"

import { useState, useMemo, useTransition } from "react"
import type { User } from "@supabase/supabase-js"
import { 
  Compass, Search, Filter, Building2, MapPin, Globe, Linkedin,
  Target, Sparkles, Mail, ArrowUpRight, DollarSign, Loader2,
  CheckCircle2, AlertCircle, User as UserIcon, X, Plus, LayoutGrid, 
  List, ChevronDown, Briefcase,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { InvestmentFirm, Investor, InvestorMatch } from "@/lib/db/types"
import { runMatching, addToOutreach } from "@/app/dashboard/discover/actions"

type ViewMode = "investors" | "firms" | "matches"
type DisplayMode = "table" | "grid"

interface DiscoverContentProps {
  user: User
  initialFirms: InvestmentFirm[]
  initialInvestors: Investor[]
  initialMatches: InvestorMatch[]
  stats: {
    totalFirms: number
    totalInvestors: number
    totalMatches: number
  }
}

const STAGES = ["All Stages", "Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "Growth"]
const INVESTOR_TYPES = ["All Types", "VC", "Angel", "Family Office", "PE", "Corporate VC", "LP", "HNWI"]

export function DiscoverContent({ 
  user, 
  initialFirms, 
  initialInvestors,
  initialMatches,
  stats 
}: DiscoverContentProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("investors")
  const [displayMode, setDisplayMode] = useState<DisplayMode>("table")
  const [searchQuery, setSearchQuery] = useState("")
  const [stageFilter, setStageFilter] = useState("All Stages")
  const [typeFilter, setTypeFilter] = useState("All Types")
  const [countryFilter, setCountryFilter] = useState("All Countries")
  const [hasEmailFilter, setHasEmailFilter] = useState(false)
  const [hasLinkedInFilter, setHasLinkedInFilter] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Get unique countries
  const countries = useMemo(() => {
    const set = new Set<string>()
    initialInvestors.forEach(inv => inv.investor_country && set.add(inv.investor_country))
    return ["All Countries", ...Array.from(set).sort().slice(0, 50)]
  }, [initialInvestors])

  // Filter investors
  const filteredInvestors = useMemo(() => {
    return initialInvestors.filter(inv => {
      const matchesSearch = !searchQuery || 
        `${inv.first_name} ${inv.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.title?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStage = stageFilter === "All Stages" || 
        inv.funding_stage?.includes(stageFilter) ||
        inv.preferred_stages?.some(s => s.includes(stageFilter))
      const matchesType = typeFilter === "All Types" || inv.investor_type === typeFilter
      const matchesCountry = countryFilter === "All Countries" || inv.investor_country === countryFilter
      const matchesEmail = !hasEmailFilter || inv.email
      const matchesLinkedIn = !hasLinkedInFilter || inv.linkedin_url || inv.person_linkedin_url
      return matchesSearch && matchesStage && matchesType && matchesCountry && matchesEmail && matchesLinkedIn
    })
  }, [initialInvestors, searchQuery, stageFilter, typeFilter, countryFilter, hasEmailFilter, hasLinkedInFilter])

  // Filter firms
  const filteredFirms = useMemo(() => {
    return initialFirms.filter(firm => {
      const matchesSearch = !searchQuery || 
        firm.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        firm.industries?.some(i => i.toLowerCase().includes(searchQuery.toLowerCase()))
      const matchesStage = stageFilter === "All Stages" || firm.stages?.some(s => s.includes(stageFilter))
      return matchesSearch && matchesStage
    })
  }, [initialFirms, searchQuery, stageFilter])

  const handleRunMatching = () => {
    setStatus({ type: null, message: '' })
    startTransition(async () => {
      const result = await runMatching()
      if (result.success) {
        setStatus({ type: 'success', message: `Found ${result.matchCount} matches!` })
        setViewMode('matches')
      } else {
        setStatus({ type: 'error', message: result.error || 'Matching failed' })
      }
    })
  }

  const handleAddToOutreach = async (id: string, type: 'investor' | 'firm') => {
    const result = await addToOutreach(id, type)
    if (result.success) {
      setStatus({ type: 'success', message: 'Added to pipeline!' })
      setTimeout(() => setStatus({ type: null, message: '' }), 2000)
    }
  }

  const handleBulkAdd = async () => {
    for (const id of selectedIds) {
      await addToOutreach(id, 'investor')
    }
    setStatus({ type: 'success', message: `Added ${selectedIds.size} to pipeline!` })
    setSelectedIds(new Set())
  }

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    newSet.has(id) ? newSet.delete(id) : newSet.add(id)
    setSelectedIds(newSet)
  }

  const selectAll = () => {
    if (selectedIds.size === filteredInvestors.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredInvestors.map(i => i.id)))
    }
  }

  const clearFilters = () => {
    setSearchQuery("")
    setStageFilter("All Stages")
    setTypeFilter("All Types")
    setCountryFilter("All Countries")
    setHasEmailFilter(false)
    setHasLinkedInFilter(false)
  }

  const activeFilterCount = [
    stageFilter !== "All Stages",
    typeFilter !== "All Types",
    countryFilter !== "All Countries",
    hasEmailFilter,
    hasLinkedInFilter
  ].filter(Boolean).length

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-foreground/10">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-foreground/5 flex items-center justify-center">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-display text-2xl">Discover Investors</h1>
                <p className="text-sm text-muted-foreground">
                  {stats.totalInvestors.toLocaleString()} investors &bull; {stats.totalFirms.toLocaleString()} firms
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" className="gap-2" onClick={() => setShowFilters(!showFilters)}>
                <Filter className="w-4 h-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-foreground text-background text-xs rounded-full">{activeFilterCount}</span>
                )}
              </Button>
              <Button className="gap-2 bg-foreground text-background" onClick={handleRunMatching} disabled={isPending}>
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isPending ? "Matching..." : "Run AI Match"}
              </Button>
            </div>
          </div>

          {/* View Toggle & Search */}
          <div className="flex items-center gap-4">
            <div className="flex border border-foreground/10 rounded-lg p-1">
              {[
                { mode: "investors" as ViewMode, icon: UserIcon, label: "Investors" },
                { mode: "firms" as ViewMode, icon: Building2, label: "Firms" },
                { mode: "matches" as ViewMode, icon: Target, label: "Matches", count: initialMatches.length },
              ].map(({ mode, icon: Icon, label, count }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 transition-colors ${
                    viewMode === mode ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  {count !== undefined && count > 0 && (
                    <span className="px-1.5 py-0.5 bg-emerald-500 text-white text-xs rounded-full">{count}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${viewMode}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-foreground/5 border-foreground/10"
              />
            </div>

            <div className="flex border border-foreground/10 rounded-lg p-1">
              <button onClick={() => setDisplayMode("table")} className={`p-2 rounded-md ${displayMode === "table" ? "bg-foreground/10" : ""}`}>
                <List className="w-4 h-4" />
              </button>
              <button onClick={() => setDisplayMode("grid")} className={`p-2 rounded-md ${displayMode === "grid" ? "bg-foreground/10" : ""}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="px-8 py-4 border-t border-foreground/10 bg-foreground/[0.02]">
            <div className="flex flex-wrap items-center gap-4">
              <FilterSelect label="Stage" value={stageFilter} options={STAGES} onChange={setStageFilter} />
              {viewMode === "investors" && (
                <>
                  <FilterSelect label="Type" value={typeFilter} options={INVESTOR_TYPES} onChange={setTypeFilter} />
                  <FilterSelect label="Country" value={countryFilter} options={countries} onChange={setCountryFilter} />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={hasEmailFilter} onChange={e => setHasEmailFilter(e.target.checked)} className="rounded" />
                    <span className="text-sm">Has Email</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={hasLinkedInFilter} onChange={e => setHasLinkedInFilter(e.target.checked)} className="rounded" />
                    <span className="text-sm">Has LinkedIn</span>
                  </label>
                </>
              )}
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status */}
      {status.type && (
        <div className={`mx-8 mt-4 p-4 rounded-lg flex items-center gap-3 ${
          status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <p className="text-sm">{status.message}</p>
          <button onClick={() => setStatus({ type: null, message: '' })} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="mx-8 mt-4 p-4 bg-foreground/5 rounded-lg flex items-center justify-between">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>Clear</Button>
            <Button size="sm" className="gap-2" onClick={handleBulkAdd}><Plus className="w-4 h-4" />Add to Pipeline</Button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-8">
        {viewMode === "investors" && (
          <InvestorsView 
            investors={filteredInvestors} 
            displayMode={displayMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAll={selectAll}
            onAddToOutreach={handleAddToOutreach}
          />
        )}
        {viewMode === "firms" && <FirmsView firms={filteredFirms} displayMode={displayMode} />}
        {viewMode === "matches" && (
          <MatchesView matches={initialMatches} onRunMatching={handleRunMatching} isPending={isPending} onAddToOutreach={handleAddToOutreach} />
        )}
      </div>
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono text-muted-foreground uppercase">{label}:</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="px-3 py-1.5 text-sm bg-background border border-foreground/10 rounded-md">
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  )
}

function InvestorsView({ investors, displayMode, selectedIds, onToggleSelect, onSelectAll, onAddToOutreach }: {
  investors: Investor[]
  displayMode: DisplayMode
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onSelectAll: () => void
  onAddToOutreach: (id: string, type: 'investor' | 'firm') => void
}) {
  if (displayMode === "table") {
    return (
      <div className="border border-foreground/10 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-foreground/[0.03]">
            <tr className="border-b border-foreground/10">
              <th className="w-10 px-4 py-3">
                <input type="checkbox" checked={selectedIds.size === investors.length && investors.length > 0} onChange={onSelectAll} className="rounded" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Title</th>
              <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Type</th>
              <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Location</th>
              <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Check Size</th>
              <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Contact</th>
              <th className="px-4 py-3 text-right text-xs font-mono uppercase text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {investors.slice(0, 100).map(inv => (
              <tr key={inv.id} className="border-b border-foreground/5 hover:bg-foreground/[0.02]">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selectedIds.has(inv.id)} onChange={() => onToggleSelect(inv.id)} className="rounded" />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-medium">
                      {inv.first_name?.[0]}{inv.last_name?.[0]}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{inv.first_name} {inv.last_name}</p>
                      {inv.email && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{inv.email}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm truncate max-w-[140px]">{inv.title || "—"}</td>
                <td className="px-4 py-3">
                  {inv.investor_type && <span className="px-2 py-1 text-xs bg-foreground/5 rounded">{inv.investor_type}</span>}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{inv.investor_country || inv.location || "—"}</td>
                <td className="px-4 py-3 text-sm">{inv.typical_check_size || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {inv.email && <a href={`mailto:${inv.email}`} className="text-muted-foreground hover:text-foreground"><Mail className="w-4 h-4" /></a>}
                    {(inv.linkedin_url || inv.person_linkedin_url) && (
                      <a href={inv.linkedin_url || inv.person_linkedin_url || ''} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <Linkedin className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => onAddToOutreach(inv.id, 'investor')} className="gap-1">
                    <Plus className="w-3 h-3" />Add
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {investors.length > 100 && (
          <div className="px-4 py-3 bg-foreground/[0.02] text-center text-sm text-muted-foreground">
            Showing 100 of {investors.length.toLocaleString()} investors
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {investors.slice(0, 50).map(inv => (
        <InvestorCard key={inv.id} investor={inv} selected={selectedIds.has(inv.id)} onToggle={() => onToggleSelect(inv.id)} onAdd={() => onAddToOutreach(inv.id, 'investor')} />
      ))}
    </div>
  )
}

function InvestorCard({ investor: inv, selected, onToggle, onAdd }: { investor: Investor; selected: boolean; onToggle: () => void; onAdd: () => void }) {
  return (
    <div className="p-4 border border-foreground/10 rounded-lg hover:border-foreground/20 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center text-sm font-medium">
            {inv.first_name?.[0]}{inv.last_name?.[0]}
          </div>
          <div>
            <p className="font-medium text-sm">{inv.first_name} {inv.last_name}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[140px]">{inv.title || "Investor"}</p>
          </div>
        </div>
        <input type="checkbox" checked={selected} onChange={onToggle} className="rounded" />
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {inv.investor_type && <span className="px-2 py-1 text-xs bg-foreground/5 rounded">{inv.investor_type}</span>}
        {inv.investor_country && <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="w-3 h-3" />{inv.investor_country}</span>}
      </div>
      {inv.typical_check_size && <p className="text-xs text-muted-foreground mb-3"><DollarSign className="w-3 h-3 inline" />{inv.typical_check_size}</p>}
      <div className="flex items-center justify-between pt-3 border-t border-foreground/5">
        <div className="flex gap-2">
          {inv.email && <a href={`mailto:${inv.email}`} className="text-muted-foreground hover:text-foreground"><Mail className="w-4 h-4" /></a>}
          {(inv.linkedin_url || inv.person_linkedin_url) && (
            <a href={inv.linkedin_url || inv.person_linkedin_url || ''} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
              <Linkedin className="w-4 h-4" />
            </a>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={onAdd}>Add</Button>
      </div>
    </div>
  )
}

function FirmsView({ firms, displayMode }: { firms: InvestmentFirm[]; displayMode: DisplayMode }) {
  return (
    <div className="border border-foreground/10 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-foreground/[0.03]">
          <tr className="border-b border-foreground/10">
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Firm</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Type</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Stages</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Industries</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Location</th>
            <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Check Size</th>
            <th className="px-4 py-3 text-right text-xs font-mono uppercase text-muted-foreground">Links</th>
          </tr>
        </thead>
        <tbody>
          {firms.slice(0, 100).map(firm => (
            <tr key={firm.id} className="border-b border-foreground/5 hover:bg-foreground/[0.02]">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-foreground/10 flex items-center justify-center text-xs font-medium">{firm.name?.[0]}</div>
                  <p className="font-medium text-sm">{firm.name}</p>
                </div>
              </td>
              <td className="px-4 py-3 text-sm">{firm.type || "—"}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {firm.stages?.slice(0, 2).map((s, i) => <span key={i} className="px-2 py-0.5 text-xs bg-foreground/5 rounded">{s}</span>)}
                  {(firm.stages?.length || 0) > 2 && <span className="text-xs text-muted-foreground">+{firm.stages!.length - 2}</span>}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[150px]">{firm.industries?.slice(0, 2).join(", ") || "—"}</td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{firm.hq_location || "—"}</td>
              <td className="px-4 py-3 text-sm">
                {firm.check_size_min && firm.check_size_max 
                  ? `$${(firm.check_size_min/1000).toFixed(0)}K - $${(firm.check_size_max/1000000).toFixed(1)}M`
                  : "—"}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  {firm.website && <a href={firm.website} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground"><Globe className="w-4 h-4" /></a>}
                  {firm.linkedin_url && <a href={firm.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground"><Linkedin className="w-4 h-4" /></a>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MatchesView({ matches, onRunMatching, isPending, onAddToOutreach }: { 
  matches: InvestorMatch[]; onRunMatching: () => void; isPending: boolean; onAddToOutreach: (id: string, type: 'investor' | 'firm') => void 
}) {
  if (matches.length === 0) {
    return (
      <div className="py-16 text-center">
        <Target className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="font-display text-lg font-semibold mb-2">No matches yet</h3>
        <p className="text-sm text-muted-foreground mb-4">Run AI matching to discover your best-fit investors</p>
        <Button className="gap-2" onClick={onRunMatching} disabled={isPending}>
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {isPending ? "Running..." : "Run AI Match"}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {matches.map(match => (
        <div key={match.id} className="p-6 border border-foreground/10 rounded-lg">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white font-bold text-xl">
                {Math.round((match.composite_score || 0) * 100)}
              </div>
              <div>
                <h3 className="font-display text-lg">Match Score: {Math.round((match.composite_score || 0) * 100)}%</h3>
                <p className="text-sm text-muted-foreground max-w-lg">{match.reasoning}</p>
              </div>
            </div>
            <Button className="gap-2" onClick={() => onAddToOutreach(match.investor_id || match.firm_id || '', 'investor')}>
              <Plus className="w-4 h-4" />Add to Pipeline
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-4">
            {[
              { label: "Industry", score: match.industry_score },
              { label: "Stage", score: match.stage_score },
              { label: "Geography", score: match.geography_score },
              { label: "Check Size", score: match.check_size_score },
              { label: "Type", score: match.investor_type_score },
            ].map(f => (
              <div key={f.label} className="text-center p-3 bg-foreground/[0.02] rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">{f.label}</p>
                <p className="font-mono text-sm">{Math.round((f.score || 0) * 100)}%</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
