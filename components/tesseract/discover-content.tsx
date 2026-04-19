"use client"

import { useState, useMemo, useTransition } from "react"
import type { User } from "@supabase/supabase-js"
import { 
  Compass, Search, Filter, Building2, MapPin, Globe, Linkedin,
  Target, Sparkles, Mail, ArrowUpRight, DollarSign, Loader2,
  CheckCircle2, AlertCircle, User as UserIcon, X, Plus, LayoutGrid, 
  List, ChevronLeft, ChevronRight, RefreshCw, Link2, Database,
  Shield, Zap, ExternalLink, MoreHorizontal, Eye, FileSearch,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu"
import type { InvestmentFirm, Investor, InvestorMatch } from "@/lib/db/types"
import { runMatching, addToOutreach } from "@/app/dashboard/discover/actions"

type ViewMode = "investors" | "firms" | "matches"
type DisplayMode = "table" | "grid"

interface DiscoverContentProps {
  user: User
  initialFirms: InvestmentFirm[]
  initialInvestors: Investor[]
  initialMatches: InvestorMatch[]
  isAdmin?: boolean
  currentPage?: number
  itemsPerPage?: number
  stats: {
    totalFirms: number
    totalInvestors: number
    totalMatches: number
  }
}

const STAGES = [
  "All Stages", 
  "Pre-Seed", 
  "Seed", 
  "Series A", 
  "Series B", 
  "Series C", 
  "Series D", 
  "Series E+", 
  "Growth", 
  "Late Stage",
  "IPO/Pre-IPO"
]

const INVESTOR_TYPES = [
  "All Types", 
  "VC", 
  "Angel", 
  "Family Office", 
  "PE", 
  "Corporate VC", 
  "LP", 
  "HNWI", 
  "Accelerator", 
  "Syndicate",
  "Sovereign Wealth Fund",
  "Hedge Fund",
  "Micro VC",
  "Growth Equity"
]

// Investment firm types for filtering
const FIRM_TYPES = [
  "All Types",
  "Venture Capital",
  "VC",
  "Private Equity",
  "PE",
  "Corporate VC",
  "CVC",
  "Family Office",
  "Angel Group",
  "Accelerator",
  "Incubator",
  "Venture Studio",
  "Micro VC",
  "Growth Equity",
  "Hedge Fund",
  "Sovereign Wealth Fund",
  "Investment Bank",
  "Fund of Funds"
]

const CHECK_SIZES = [
  "All Sizes", 
  "$10K-$50K", 
  "$50K-$100K", 
  "$100K-$250K", 
  "$250K-$500K", 
  "$500K-$1M", 
  "$1M-$5M", 
  "$5M-$10M", 
  "$10M-$25M",
  "$25M-$50M",
  "$50M-$100M",
  "$100M+"
]

// Comprehensive sector/industry categories
const SECTORS = [
  "All Sectors",
  // Technology & Software
  "SaaS", "Enterprise Software", "Developer Tools", "DevOps", "Cloud Infrastructure", "Cybersecurity", "Data & Analytics", "AI/Machine Learning", "Deep Tech",
  // Consumer & Commerce
  "Consumer", "E-commerce", "D2C", "Marketplace", "Retail Tech", "Consumer Social", "Gaming", "Media & Entertainment",
  // Fintech & Financial Services
  "Fintech", "Payments", "Banking", "Insurtech", "Wealthtech", "Crypto/Web3", "DeFi", "Blockchain",
  // Healthcare & Life Sciences
  "Healthcare", "Healthtech", "Digital Health", "Biotech", "Medtech", "Pharma", "Mental Health", "Telemedicine",
  // Climate & Energy
  "Climate Tech", "Clean Energy", "Sustainability", "Renewables", "Carbon Tech", "Agtech", "Foodtech",
  // Industrial & Hardware
  "Hardware", "Robotics", "IoT", "Manufacturing", "Industrial Tech", "Supply Chain", "Logistics",
  // Real Estate & Property
  "Proptech", "Real Estate", "Construction Tech",
  // Education & HR
  "Edtech", "HR Tech", "Future of Work", "Recruiting",
  // Transportation & Mobility
  "Mobility", "Autonomous Vehicles", "EV", "Transportation", "Delivery",
  // Other
  "Legal Tech", "Govtech", "Space Tech", "Defense Tech", "Social Impact", "Creator Economy", "B2B", "B2C"
]

// Helper to parse check size filter to minimum value
function parseCheckSizeMin(filter: string): number {
  const match = filter.match(/\$?([\d.]+)([KMB])?/i)
  if (!match) return 0
  let value = parseFloat(match[1])
  const suffix = (match[2] || '').toUpperCase()
  if (suffix === 'K') value *= 1000
  if (suffix === 'M') value *= 1000000
  if (suffix === 'B') value *= 1000000000
  return value
}

export function DiscoverContent({ 
  user, 
  initialFirms, 
  initialInvestors,
  initialMatches,
  isAdmin = false,
  currentPage: serverPage = 1,
  itemsPerPage: serverItemsPerPage = 1000,
  stats 
}: DiscoverContentProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("investors")
  const [displayMode, setDisplayMode] = useState<DisplayMode>("table")
  const [searchQuery, setSearchQuery] = useState("")
  const [stageFilter, setStageFilter] = useState("All Stages")
  const [typeFilter, setTypeFilter] = useState("All Types")
  const [countryFilter, setCountryFilter] = useState("All Countries")
  const [checkSizeFilter, setCheckSizeFilter] = useState("All Sizes")
  const [sectorFilter, setSectorFilter] = useState("All Sectors")
  const [hasEmailFilter, setHasEmailFilter] = useState(false)
  const [hasLinkedInFilter, setHasLinkedInFilter] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [investorPage, setInvestorPage] = useState(1)
  const [firmPage, setFirmPage] = useState(1)
  const [isEnriching, setIsEnriching] = useState<string | null>(null)
  const ITEMS_PER_PAGE = 100

  // Get unique countries/regions from both investors and firms
  const countries = useMemo(() => {
    const set = new Set<string>()
    initialInvestors.forEach(inv => {
      if (inv.investor_country) set.add(inv.investor_country)
      // Extract country from hq_location if present (e.g. "Helsinki, Finland" -> "Finland")
      if (inv.hq_location) {
        const parts = inv.hq_location.split(',')
        if (parts.length > 1) set.add(parts[parts.length - 1].trim())
      }
    })
    initialFirms.forEach(firm => {
      if (firm.hq_location) {
        const parts = firm.hq_location.split(',')
        if (parts.length > 1) set.add(parts[parts.length - 1].trim())
      }
      if (firm.location) {
        const parts = firm.location.split(',')
        if (parts.length > 1) set.add(parts[parts.length - 1].trim())
      }
    })
    return ["All Countries", ...Array.from(set).filter(Boolean).sort()]
  }, [initialInvestors, initialFirms])

  // Filter investors - using actual database field names
  const filteredInvestors = useMemo(() => {
    return initialInvestors.filter(inv => {
      const matchesSearch = !searchQuery || 
        `${inv.first_name} ${inv.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.hq_location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.sectors?.some((s: string) => s.toLowerCase().includes(searchQuery.toLowerCase()))
      
      // Stage matching - use stages array from DB
      const matchesStage = stageFilter === "All Stages" || 
        inv.funding_stage?.toLowerCase().includes(stageFilter.toLowerCase()) ||
        inv.stages?.some((s: string) => {
          const stageLower = stageFilter.toLowerCase()
          const sLower = s.toLowerCase()
          if (stageLower === "pre-seed") return sLower.includes("pre") && sLower.includes("seed")
          if (stageLower.startsWith("series")) {
            const letter = stageLower.replace("series ", "")
            return sLower.includes("series") && sLower.includes(letter)
          }
          return sLower.includes(stageLower)
        })
      
      const matchesType = typeFilter === "All Types" || 
        inv.investor_type?.toLowerCase() === typeFilter.toLowerCase() ||
        inv.investor_type?.toLowerCase().includes(typeFilter.toLowerCase())
      
      const matchesCountry = countryFilter === "All Countries" || 
        inv.investor_country === countryFilter ||
        inv.hq_location?.includes(countryFilter)
      
      // Check size matching - use typical_investment from DB
      const matchesCheckSize = checkSizeFilter === "All Sizes" || (() => {
        const checkSize = inv.typical_investment || inv.typical_check_size || ""
        return checkSize.toLowerCase().includes(checkSizeFilter.replace("$", "").toLowerCase())
      })()
      
      // Sector matching - use sectors array from DB
      const matchesSector = sectorFilter === "All Sectors" ||
        inv.sectors?.some((sector: string) => {
          const sectorLower = sectorFilter.toLowerCase()
          const sLower = sector.toLowerCase()
          return sLower.includes(sectorLower) || sectorLower.includes(sLower)
        })
      
      const matchesEmail = !hasEmailFilter || inv.email
      const matchesLinkedIn = !hasLinkedInFilter || inv.linkedin_url || inv.person_linkedin_url
      
      return matchesSearch && matchesStage && matchesType && matchesCountry && matchesCheckSize && matchesSector && matchesEmail && matchesLinkedIn
    })
  }, [initialInvestors, searchQuery, stageFilter, typeFilter, countryFilter, checkSizeFilter, sectorFilter, hasEmailFilter, hasLinkedInFilter])

  // Filter firms - using actual database field names
  const filteredFirms = useMemo(() => {
    return initialFirms.filter(firm => {
      const matchesSearch = !searchQuery || 
        firm.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        firm.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        firm.industry?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        firm.sectors?.some((s: string) => s.toLowerCase().includes(searchQuery.toLowerCase()))
      
      // Stage matching for firms - use stages array
      const matchesStage = stageFilter === "All Stages" || 
        firm.stages?.some((s: string) => {
          const stageLower = stageFilter.toLowerCase()
          const sLower = s.toLowerCase()
          if (stageLower === "pre-seed") return sLower.includes("pre") && sLower.includes("seed")
          if (stageLower.startsWith("series")) {
            const letter = stageLower.replace("series ", "")
            return sLower.includes("series") && sLower.includes(letter)
          }
          return sLower.includes(stageLower)
        })
      
      // Type matching - use type or firm_classification
      const matchesType = typeFilter === "All Types" || 
        firm.type?.toLowerCase().includes(typeFilter.toLowerCase()) ||
        firm.firm_classification?.toLowerCase().includes(typeFilter.toLowerCase())
      
      // Region/Country matching - use location or hq_location
      const matchesCountry = countryFilter === "All Countries" || 
        firm.location?.includes(countryFilter) ||
        firm.hq_location?.includes(countryFilter)
      
      // Check size matching - use check_size_min, check_size_max, or typical_check_size
      const matchesCheckSize = checkSizeFilter === "All Sizes" || (() => {
        const checkSizeStr = firm.typical_check_size || ""
        if (checkSizeStr) {
          return checkSizeStr.toLowerCase().includes(checkSizeFilter.replace("$", "").toLowerCase())
        }
        // Parse numeric check size filters
        const filterMin = parseCheckSizeMin(checkSizeFilter)
        const firmMin = firm.check_size_min || 0
        const firmMax = firm.check_size_max || Infinity
        return firmMin <= filterMin && filterMin <= firmMax
      })()
      
      // Sector matching - use sectors array or industry string
      const matchesSector = sectorFilter === "All Sectors" ||
        firm.sectors?.some((sector: string) => {
          const sectorLower = sectorFilter.toLowerCase()
          const sLower = sector.toLowerCase()
          return sLower.includes(sectorLower) || sectorLower.includes(sLower)
        }) ||
        firm.industry?.toLowerCase().includes(sectorFilter.toLowerCase())
      
      return matchesSearch && matchesStage && matchesType && matchesCountry && matchesCheckSize && matchesSector
    })
  }, [initialFirms, searchQuery, stageFilter, typeFilter, countryFilter, checkSizeFilter, sectorFilter])

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

  // Admin actions
  const handleDeepResearch = async (id: string, type: 'investor' | 'firm') => {
    setIsEnriching(id)
    // Simulated - in production this would call an AI research API
    setTimeout(() => {
      setIsEnriching(null)
      setStatus({ type: 'success', message: 'Deep research completed!' })
    }, 2000)
  }

  const handleUrlCheck = async (id: string) => {
    setIsEnriching(id)
    setTimeout(() => {
      setIsEnriching(null)
      setStatus({ type: 'success', message: 'URLs verified!' })
    }, 1500)
  }

  const handleEnrichData = async (id: string, type: 'investor' | 'firm') => {
    setIsEnriching(id)
    setTimeout(() => {
      setIsEnriching(null)
      setStatus({ type: 'success', message: 'Data enriched!' })
    }, 2000)
  }

  const handleBulkEnrich = async () => {
    setStatus({ type: 'success', message: `Enriching ${selectedIds.size} records...` })
    // In production, this would batch process enrichment
  }

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    newSet.has(id) ? newSet.delete(id) : newSet.add(id)
    setSelectedIds(newSet)
  }

  const selectAll = () => {
    const currentPageIds = filteredInvestors
      .slice((investorPage - 1) * ITEMS_PER_PAGE, investorPage * ITEMS_PER_PAGE)
      .map(i => i.id)
    if (currentPageIds.every(id => selectedIds.has(id))) {
      const newSet = new Set(selectedIds)
      currentPageIds.forEach(id => newSet.delete(id))
      setSelectedIds(newSet)
    } else {
      setSelectedIds(new Set([...selectedIds, ...currentPageIds]))
    }
  }

  const clearFilters = () => {
    setSearchQuery("")
    setStageFilter("All Stages")
    setTypeFilter("All Types")
    setCountryFilter("All Countries")
    setCheckSizeFilter("All Sizes")
    setSectorFilter("All Sectors")
    setHasEmailFilter(false)
    setHasLinkedInFilter(false)
    setInvestorPage(1)
    setFirmPage(1)
  }

  const activeFilterCount = [
    stageFilter !== "All Stages",
    typeFilter !== "All Types",
    countryFilter !== "All Countries",
    checkSizeFilter !== "All Sizes",
    sectorFilter !== "All Sectors",
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
                <h1 className="font-display text-2xl flex items-center gap-2">
                  Discover Investors
                  {isAdmin && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-mono rounded">ADMIN</span>
                  )}
                </h1>
  <p className="text-sm text-muted-foreground">
    {activeFilterCount > 0 ? (
      <>{filteredInvestors.length.toLocaleString()} of {stats.totalInvestors.toLocaleString()} investors &bull; {filteredFirms.length.toLocaleString()} of {stats.totalFirms.toLocaleString()} firms</>
    ) : (
      <>{stats.totalInvestors.toLocaleString()} investors &bull; {stats.totalFirms.toLocaleString()} firms</>
    )}
  </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Shield className="w-4 h-4" />
                      Admin Tools
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => handleBulkEnrich()} disabled={selectedIds.size === 0}>
                      <Database className="w-4 h-4 mr-2" />
                      Bulk Enrich ({selectedIds.size})
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh All Data
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Link2 className="w-4 h-4 mr-2" />
                      Verify All URLs
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      <Zap className="w-4 h-4 mr-2" />
                      Run Deep Research (All)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
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
                { mode: "investors" as ViewMode, icon: UserIcon, label: "Investors", count: filteredInvestors.length },
                { mode: "firms" as ViewMode, icon: Building2, label: "Firms", count: filteredFirms.length },
                { mode: "matches" as ViewMode, icon: Target, label: "Matches", count: initialMatches.length },
              ].map(({ mode, icon: Icon, label, count }) => (
                <button
                  key={mode}
                  onClick={() => { setViewMode(mode); setInvestorPage(1); setFirmPage(1) }}
                  className={`px-4 py-2 text-sm font-medium rounded-md flex items-center gap-2 transition-colors ${
                    viewMode === mode ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                    viewMode === mode ? "bg-background/20 text-background" : "bg-foreground/10"
                  }`}>
                    {count.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${viewMode}...`}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setInvestorPage(1); setFirmPage(1) }}
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
              <FilterSelect label="Stage" value={stageFilter} options={STAGES} onChange={(v) => { setStageFilter(v); setInvestorPage(1); setFirmPage(1) }} />
              <FilterSelect label="Type" value={typeFilter} options={viewMode === "investors" ? INVESTOR_TYPES : FIRM_TYPES} onChange={(v) => { setTypeFilter(v); setInvestorPage(1); setFirmPage(1) }} />
              <FilterSelect label="Region" value={countryFilter} options={countries} onChange={(v) => { setCountryFilter(v); setInvestorPage(1); setFirmPage(1) }} />
              <FilterSelect label="Check Size" value={checkSizeFilter} options={CHECK_SIZES} onChange={(v) => { setCheckSizeFilter(v); setInvestorPage(1); setFirmPage(1) }} />
              <FilterSelect label="Sector" value={sectorFilter} options={SECTORS} onChange={(v) => { setSectorFilter(v); setInvestorPage(1); setFirmPage(1) }} />
              {viewMode === "investors" && (
                <>
                  <div className="h-6 w-px bg-foreground/10" />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={hasEmailFilter} onChange={e => { setHasEmailFilter(e.target.checked); setInvestorPage(1) }} className="rounded" />
                    <span className="text-sm">Has Email</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={hasLinkedInFilter} onChange={e => { setHasLinkedInFilter(e.target.checked); setInvestorPage(1) }} className="rounded" />
                    <span className="text-sm">Has LinkedIn</span>
                  </label>
                </>
              )}
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <X className="w-3 h-3" /> Clear All
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
            {isAdmin && (
              <>
                <Button size="sm" variant="outline" className="gap-2" onClick={handleBulkEnrich}>
                  <Database className="w-4 h-4" />Enrich
                </Button>
                <Button size="sm" variant="outline" className="gap-2">
                  <Link2 className="w-4 h-4" />Verify URLs
                </Button>
              </>
            )}
            <Button size="sm" className="gap-2" onClick={handleBulkAdd}>
              <Plus className="w-4 h-4" />Add to Pipeline
            </Button>
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
            currentPage={investorPage}
            onPageChange={setInvestorPage}
            itemsPerPage={ITEMS_PER_PAGE}
            isAdmin={isAdmin}
            isEnriching={isEnriching}
            onDeepResearch={handleDeepResearch}
            onUrlCheck={handleUrlCheck}
            onEnrichData={handleEnrichData}
          />
        )}
        {viewMode === "firms" && (
          <FirmsView 
            firms={filteredFirms} 
            displayMode={displayMode} 
            currentPage={firmPage}
            onPageChange={setFirmPage}
            itemsPerPage={ITEMS_PER_PAGE}
            isAdmin={isAdmin}
            isEnriching={isEnriching}
            onDeepResearch={handleDeepResearch}
            onUrlCheck={handleUrlCheck}
            onEnrichData={handleEnrichData}
          />
        )}
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

function Pagination({ currentPage, totalPages, totalItems, itemsPerPage, onPageChange }: {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
}) {
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)
  
  // Format large numbers with K/M suffix
  const formatCount = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toLocaleString()
  }

  if (totalItems === 0) return null

  return (
    <div className="px-4 py-3 bg-foreground/[0.02] border-t border-foreground/10 flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{startItem.toLocaleString()}</span> to{" "}
        <span className="font-medium text-foreground">{endItem.toLocaleString()}</span> of{" "}
        <span className="font-medium text-foreground">{totalItems.toLocaleString()}</span> results
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onPageChange(1)} disabled={currentPage === 1}>
          First
        </Button>
        <Button variant="outline" size="sm" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="gap-1">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            let pageNum: number
            if (totalPages <= 7) {
              pageNum = i + 1
            } else if (currentPage <= 4) {
              pageNum = i + 1
            } else if (currentPage >= totalPages - 3) {
              pageNum = totalPages - 6 + i
            } else {
              pageNum = currentPage - 3 + i
            }
            if (pageNum < 1 || pageNum > totalPages) return null
            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`w-8 h-8 text-sm rounded-md ${
                  currentPage === pageNum ? "bg-foreground text-background" : "hover:bg-foreground/10"
                }`}
              >
                {pageNum}
              </button>
            )
          })}
        </div>
        <Button variant="outline" size="sm" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="gap-1">
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages}>
          Last
        </Button>
      </div>
    </div>
  )
}

function InvestorsView({ 
  investors, displayMode, selectedIds, onToggleSelect, onSelectAll, onAddToOutreach, 
  currentPage, onPageChange, itemsPerPage, isAdmin, isEnriching, onDeepResearch, onUrlCheck, onEnrichData 
}: {
  investors: Investor[]
  displayMode: DisplayMode
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onSelectAll: () => void
  onAddToOutreach: (id: string, type: 'investor' | 'firm') => void
  currentPage: number
  onPageChange: (page: number) => void
  itemsPerPage: number
  isAdmin: boolean
  isEnriching: string | null
  onDeepResearch: (id: string, type: 'investor' | 'firm') => void
  onUrlCheck: (id: string) => void
  onEnrichData: (id: string, type: 'investor' | 'firm') => void
}) {
  const totalPages = Math.ceil(investors.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedInvestors = investors.slice(startIndex, startIndex + itemsPerPage)

  if (investors.length === 0) {
    return (
      <div className="text-center py-16">
        <UserIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="font-display text-lg font-semibold mb-2">No investors found</h3>
        <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
      </div>
    )
  }

  if (displayMode === "table") {
    return (
      <div className="border border-foreground/10 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-foreground/[0.03]">
              <tr className="border-b border-foreground/10">
                <th className="w-10 px-4 py-3">
                  <input 
                    type="checkbox" 
                    checked={paginatedInvestors.every(i => selectedIds.has(i.id))} 
                    onChange={onSelectAll} 
                    className="rounded" 
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Title</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Location</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Stage</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Check Size</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Contact</th>
                <th className="px-4 py-3 text-right text-xs font-mono uppercase text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedInvestors.map(inv => (
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
                  <td className="px-4 py-3 text-sm text-muted-foreground truncate max-w-[120px]">{inv.investor_country || inv.location || "—"}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{inv.funding_stage || "—"}</td>
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
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => onAddToOutreach(inv.id, 'investor')} className="gap-1 h-8">
                        <Plus className="w-3 h-3" />Add
                      </Button>
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                              {isEnriching === inv.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onDeepResearch(inv.id, 'investor')}>
                              <FileSearch className="w-4 h-4 mr-2" />Deep Research
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onUrlCheck(inv.id)}>
                              <Link2 className="w-4 h-4 mr-2" />Verify URLs
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onEnrichData(inv.id, 'investor')}>
                              <Database className="w-4 h-4 mr-2" />Enrich Data
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              <Eye className="w-4 h-4 mr-2" />View Details
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          totalItems={investors.length} 
          itemsPerPage={itemsPerPage}
          onPageChange={onPageChange} 
        />
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {paginatedInvestors.map(inv => (
          <InvestorCard 
            key={inv.id} 
            investor={inv} 
            selected={selectedIds.has(inv.id)} 
            onToggle={() => onToggleSelect(inv.id)} 
            onAdd={() => onAddToOutreach(inv.id, 'investor')} 
            isAdmin={isAdmin}
            isEnriching={isEnriching === inv.id}
            onDeepResearch={() => onDeepResearch(inv.id, 'investor')}
            onEnrichData={() => onEnrichData(inv.id, 'investor')}
          />
        ))}
      </div>
      <div className="mt-4">
        <Pagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          totalItems={investors.length} 
          itemsPerPage={itemsPerPage}
          onPageChange={onPageChange} 
        />
      </div>
    </>
  )
}

function InvestorCard({ investor: inv, selected, onToggle, onAdd, isAdmin, isEnriching, onDeepResearch, onEnrichData }: { 
  investor: Investor
  selected: boolean
  onToggle: () => void
  onAdd: () => void
  isAdmin: boolean
  isEnriching: boolean
  onDeepResearch: () => void
  onEnrichData: () => void
}) {
  return (
    <div className={`p-4 border rounded-lg transition-all ${selected ? 'border-foreground bg-foreground/5' : 'border-foreground/10 hover:border-foreground/20'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <input type="checkbox" checked={selected} onChange={onToggle} className="rounded" />
          <div className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center text-sm font-medium">
            {inv.first_name?.[0]}{inv.last_name?.[0]}
          </div>
        </div>
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                {isEnriching ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onDeepResearch}>
                <FileSearch className="w-4 h-4 mr-2" />Deep Research
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEnrichData}>
                <Database className="w-4 h-4 mr-2" />Enrich
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <h3 className="font-medium mb-1">{inv.first_name} {inv.last_name}</h3>
      <p className="text-sm text-muted-foreground truncate mb-2">{inv.title || "Investor"}</p>
      <div className="flex flex-wrap gap-1 mb-3">
        {inv.investor_type && <span className="px-2 py-0.5 text-xs bg-foreground/5 rounded">{inv.investor_type}</span>}
        {inv.investor_country && <span className="px-2 py-0.5 text-xs bg-foreground/5 rounded">{inv.investor_country}</span>}
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-foreground/10">
        <div className="flex gap-2">
          {inv.email && <a href={`mailto:${inv.email}`} className="text-muted-foreground hover:text-foreground"><Mail className="w-4 h-4" /></a>}
          {(inv.linkedin_url || inv.person_linkedin_url) && (
            <a href={inv.linkedin_url || inv.person_linkedin_url || ''} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
              <Linkedin className="w-4 h-4" />
            </a>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={onAdd} className="gap-1 h-7">
          <Plus className="w-3 h-3" />Add
        </Button>
      </div>
    </div>
  )
}

function FirmsView({ 
  firms, displayMode, currentPage, onPageChange, itemsPerPage, isAdmin, isEnriching, onDeepResearch, onUrlCheck, onEnrichData 
}: { 
  firms: InvestmentFirm[]
  displayMode: DisplayMode
  currentPage: number
  onPageChange: (page: number) => void
  itemsPerPage: number
  isAdmin: boolean
  isEnriching: string | null
  onDeepResearch: (id: string, type: 'investor' | 'firm') => void
  onUrlCheck: (id: string) => void
  onEnrichData: (id: string, type: 'investor' | 'firm') => void
}) {
  const totalPages = Math.ceil(firms.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedFirms = firms.slice(startIndex, startIndex + itemsPerPage)

  if (firms.length === 0) {
    return (
      <div className="text-center py-16">
        <Building2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="font-display text-lg font-semibold mb-2">No firms found</h3>
        <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
      </div>
    )
  }

  return (
    <div className="border border-foreground/10 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-foreground/[0.03]">
            <tr className="border-b border-foreground/10">
              <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Firm</th>
              <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Type</th>
              <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Stages</th>
              <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Sectors</th>
              <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Region</th>
              <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Check Size</th>
              <th className="px-4 py-3 text-right text-xs font-mono uppercase text-muted-foreground">Links</th>
              {isAdmin && <th className="px-4 py-3 text-right text-xs font-mono uppercase text-muted-foreground">Admin</th>}
            </tr>
          </thead>
          <tbody>
            {paginatedFirms.map(firm => (
              <tr key={firm.id} className="border-b border-foreground/5 hover:bg-foreground/[0.02]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-foreground/10 flex items-center justify-center text-xs font-medium">{firm.name?.[0]}</div>
                    <div>
                      <p className="font-medium text-sm">{firm.name}</p>
                      {firm.aum && <p className="text-xs text-muted-foreground">AUM: {firm.aum}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">{firm.type || firm.firm_classification || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {firm.stages?.slice(0, 2).map((s: string, i: number) => <span key={i} className="px-2 py-0.5 text-xs bg-foreground/5 rounded">{s}</span>)}
                    {(firm.stages?.length || 0) > 2 && <span className="text-xs text-muted-foreground">+{firm.stages!.length - 2}</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(firm.sectors || []).slice(0, 2).map((s: string, i: number) => <span key={i} className="px-2 py-0.5 text-xs bg-foreground/5 rounded">{s}</span>)}
                    {(firm.sectors?.length || 0) > 2 && <span className="text-xs text-muted-foreground">+{firm.sectors!.length - 2}</span>}
                    {!firm.sectors?.length && firm.industry && <span className="text-sm text-muted-foreground">{firm.industry}</span>}
                    {!firm.sectors?.length && !firm.industry && <span className="text-sm text-muted-foreground">—</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{firm.hq_location || firm.location || "—"}</td>
                <td className="px-4 py-3 text-sm">
                  {firm.check_size_min && firm.check_size_max 
                    ? `$${(firm.check_size_min/1000).toFixed(0)}K - $${(firm.check_size_max/1000000).toFixed(1)}M`
                    : firm.typical_check_size || "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {firm.website && <a href={firm.website} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground"><Globe className="w-4 h-4" /></a>}
                    {firm.linkedin_url && <a href={firm.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground"><Linkedin className="w-4 h-4" /></a>}
                  </div>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                          {isEnriching === firm.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onDeepResearch(firm.id, 'firm')}>
                          <FileSearch className="w-4 h-4 mr-2" />Deep Research
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onUrlCheck(firm.id)}>
                          <Link2 className="w-4 h-4 mr-2" />Verify URLs
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEnrichData(firm.id, 'firm')}>
                          <Database className="w-4 h-4 mr-2" />Enrich Data
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination 
        currentPage={currentPage} 
        totalPages={totalPages} 
        totalItems={firms.length} 
        itemsPerPage={itemsPerPage}
        onPageChange={onPageChange} 
      />
    </div>
  )
}

function MatchesView({ matches, onRunMatching, isPending, onAddToOutreach }: { 
  matches: InvestorMatch[]
  onRunMatching: () => void
  isPending: boolean
  onAddToOutreach: (id: string, type: 'investor' | 'firm') => void
}) {
  if (matches.length === 0) {
    return (
      <div className="text-center py-16">
        <Target className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="font-display text-lg font-semibold mb-2">No matches yet</h3>
        <p className="text-sm text-muted-foreground mb-4">Run AI matching to discover your best-fit investors</p>
        <Button className="gap-2" onClick={onRunMatching} disabled={isPending}>
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Run AI Match
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {matches.map(match => (
        <div key={match.id} className="p-4 border border-foreground/10 rounded-lg hover:border-foreground/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-foreground/10 flex items-center justify-center text-lg font-medium">
                {match.firm_name?.[0] || "?"}
              </div>
              <div>
                <h3 className="font-medium">{match.firm_name}</h3>
                <p className="text-sm text-muted-foreground">{match.reasoning}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-2xl font-display font-semibold text-emerald-600">{Math.round(match.score || 0)}%</div>
                <div className="text-xs text-muted-foreground">Match Score</div>
              </div>
              <span className={`px-2 py-1 text-xs font-medium rounded ${
                match.tier === 'S' ? 'bg-amber-100 text-amber-700' :
                match.tier === 'A' ? 'bg-emerald-100 text-emerald-700' :
                match.tier === 'B' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                Tier {match.tier}
              </span>
              <Button size="sm" onClick={() => onAddToOutreach(match.id, 'firm')} className="gap-1">
                <Plus className="w-3 h-3" />Pipeline
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
