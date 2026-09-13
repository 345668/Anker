"use client"

import type { DiscoveryFacets } from "@/lib/platform/discovery"
import Link from "next/link"
import { requestJson, swrFetcher } from "@/lib/http/client"
import { useState, useMemo, useCallback, useEffect } from "react"
import useSWRInfinite from "swr/infinite"
import type { User } from "@supabase/supabase-js"
import { 
  Search, Filter, Building2, MapPin, Globe, Linkedin,
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
import type { InvestmentFirm, Investor } from "@/lib/db/types"
import { addToOutreach } from "@/app/dashboard/discover/actions"
import { PageHeader } from "@/components/shell/page-header"
import { StaffBadge } from "@/components/shell/staff-badge"
import { DataError, DataLoading } from "@/components/shell/data-state"

type ViewMode = "investors" | "firms"
type DisplayMode = "table" | "grid"

interface DiscoverContentProps {
  user: User
  initialFirms: InvestmentFirm[]
  initialInvestors: Investor[]
  matchingHref: string
  initialFilters?: Record<string, string>
  initialFacets?: { investors: DiscoveryFacets; firms: DiscoveryFacets }
  isAdmin?: boolean
  currentPage?: number
  itemsPerPage?: number
  stats: {
    totalFirms: number
    totalInvestors: number
    totalMatches: number
  }
}

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

export function DiscoverContent({ 
  user, 
  initialFirms, 
  initialInvestors,
  matchingHref,
  isAdmin = false,
  initialFilters = {},
  initialFacets,
  currentPage: serverPage = 1,
  itemsPerPage: serverItemsPerPage = 1000,
  stats 
}: DiscoverContentProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("investors")
  const [displayMode, setDisplayMode] = useState<DisplayMode>("table")
  const [searchQuery, setSearchQuery] = useState(initialFilters.search ?? "")
  const [debouncedSearch, setDebouncedSearch] = useState(initialFilters.search ?? "")
  const [stageFilter, setStageFilter] = useState(initialFilters.stage ?? "All Stages")
  const [typeFilter, setTypeFilter] = useState(initialFilters.type ?? "All Types")
  const [countryFilter, setCountryFilter] = useState(initialFilters.country ?? "All Countries")
  const [checkSizeFilter, setCheckSizeFilter] = useState(initialFilters.check ?? "All Sizes")
  const [sectorFilter, setSectorFilter] = useState(initialFilters.sector ?? "All Sectors")
  const [hasEmailFilter, setHasEmailFilter] = useState(initialFilters.hasEmail === "true")
  const [hasLinkedInFilter, setHasLinkedInFilter] = useState(initialFilters.hasLinkedIn === "true")
  const [showFilters, setShowFilters] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [investorPage, setInvestorPage] = useState(1)
  const [firmPage, setFirmPage] = useState(1)
  const [isEnriching, setIsEnriching] = useState<string | null>(null)
  const ITEMS_PER_PAGE = 100
  const BATCH_SIZE = 100 // Load investors in batches

  const [urlReady, setUrlReady] = useState(false)
  useEffect(() => {
    const restore = () => {
      const q = new URLSearchParams(window.location.search)
      setSearchQuery(q.get("search") ?? ""); setStageFilter(q.get("stage") ?? "All Stages")
      setTypeFilter(q.get("type") ?? "All Types"); setCountryFilter(q.get("country") ?? "All Countries")
      setCheckSizeFilter(q.get("check") ?? "All Sizes"); setSectorFilter(q.get("sector") ?? "All Sectors")
      setHasEmailFilter(q.get("hasEmail") === "true"); setHasLinkedInFilter(q.get("hasLinkedIn") === "true")
      setInvestorPage(1); setFirmPage(1); setSelectedIds(new Set()); setUrlReady(true)
    }
    restore(); window.addEventListener("popstate", restore)
    return () => window.removeEventListener("popstate", restore)
  }, [])
  useEffect(() => {
    if (!urlReady) return
    const q = new URLSearchParams(window.location.search)
    q.delete("page")
    for (const [key, value] of Object.entries({ search: searchQuery, stage: stageFilter, type: typeFilter, country: countryFilter, check: checkSizeFilter, sector: sectorFilter, hasEmail: hasEmailFilter ? "true" : "", hasLinkedIn: hasLinkedInFilter ? "true" : "" })) {
      if (!value || value.startsWith("All ")) q.delete(key); else q.set(key, value)
    }
    window.history.replaceState(null, "", `${window.location.pathname}${q.size ? `?${q}` : ""}`)
    setSelectedIds(new Set())
  }, [urlReady, searchQuery, stageFilter, typeFilter, countryFilter, checkSizeFilter, sectorFilter, hasEmailFilter, hasLinkedInFilter])

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const matchesInitialFilters = debouncedSearch === (initialFilters.search ?? "")
    && stageFilter === (initialFilters.stage ?? "All Stages")
    && typeFilter === (initialFilters.type ?? "All Types")
    && countryFilter === (initialFilters.country ?? "All Countries")
    && sectorFilter === (initialFilters.sector ?? "All Sectors")
    && checkSizeFilter === (initialFilters.check ?? "All Sizes")
    && hasEmailFilter === (initialFilters.hasEmail === "true")
    && hasLinkedInFilter === (initialFilters.hasLinkedIn === "true")

  // SWR Infinite for batched investor loading
  const getInvestorKey = useCallback((pageIndex: number, previousPageData: { investors: Investor[]; pagination: { hasMore: boolean } } | null) => {
    if (!urlReady) return null
    if (previousPageData && !previousPageData.pagination?.hasMore) return null
    const params = new URLSearchParams({
      page: String(pageIndex + 1),
      limit: String(BATCH_SIZE),
    })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (sectorFilter !== 'All Sectors') params.set('sector', sectorFilter)
    if (stageFilter !== 'All Stages') params.set('stage', stageFilter)
    if (typeFilter !== 'All Types') params.set('type', typeFilter)
    if (countryFilter !== 'All Countries') params.set('country', countryFilter)
    if (checkSizeFilter !== 'All Sizes') params.set('check', checkSizeFilter)
    if (hasEmailFilter) params.set('hasEmail', 'true')
    if (hasLinkedInFilter) params.set('hasLinkedIn', 'true')
    return `/api/investors?${params.toString()}`
  }, [urlReady, debouncedSearch, sectorFilter, stageFilter, typeFilter, countryFilter, checkSizeFilter, hasEmailFilter, hasLinkedInFilter])

  const {
    data: investorPages,
    size: investorLoadedPages,
    setSize: setInvestorLoadedPages,
    error: investorError,
    mutate: retryInvestors,
    isLoading: isLoadingInvestors,
    isValidating: isValidatingInvestors,
  } = useSWRInfinite<{ investors: Investor[]; pagination: { hasMore: boolean; total: number }; facets?: DiscoveryFacets }>(
    getInvestorKey,
    swrFetcher,
    {
      fallbackData: matchesInitialFilters ? [{ investors: initialInvestors, pagination: { total: stats.totalInvestors, hasMore: stats.totalInvestors > initialInvestors.length }, facets: initialFacets?.investors }] : undefined,
      revalidateFirstPage: false,
      revalidateOnFocus: false,
    }
  )

  // Flatten investor pages into single array
  const loadedInvestors = useMemo(() => {
    if (!investorPages) return []
    return investorPages.flatMap(page => page.investors || [])
  }, [investorPages])

  const hasMoreInvestors = investorPages?.[investorPages.length - 1]?.pagination?.hasMore ?? false
  const totalInvestors = investorPages?.[0]?.pagination?.total ?? stats.totalInvestors

  const loadMoreInvestors = useCallback(() => {
    if (!isLoadingInvestors && !isValidatingInvestors && hasMoreInvestors) {
      setInvestorLoadedPages(investorLoadedPages + 1)
    }
  }, [isLoadingInvestors, isValidatingInvestors, hasMoreInvestors, investorLoadedPages, setInvestorLoadedPages])

  // SWR Infinite for batched firms loading
  const getFirmKey = useCallback((pageIndex: number, previousPageData: { firms: InvestmentFirm[]; pagination: { hasMore: boolean } } | null) => {
    if (!urlReady) return null
    if (previousPageData && !previousPageData.pagination?.hasMore) return null
    const params = new URLSearchParams({
      page: String(pageIndex + 1),
      limit: String(BATCH_SIZE),
    })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (sectorFilter !== 'All Sectors') params.set('sector', sectorFilter)
    if (stageFilter !== 'All Stages') params.set('stage', stageFilter)
    if (typeFilter !== 'All Types') params.set('type', typeFilter)
    if (countryFilter !== 'All Countries') params.set('country', countryFilter)
    if (checkSizeFilter !== 'All Sizes') params.set('check', checkSizeFilter)
    if (hasEmailFilter) params.set('hasEmail', 'true')
    if (hasLinkedInFilter) params.set('hasLinkedIn', 'true')
    return `/api/firms?${params.toString()}`
  }, [urlReady, debouncedSearch, sectorFilter, stageFilter, typeFilter, countryFilter, checkSizeFilter, hasEmailFilter, hasLinkedInFilter])

  const {
    data: firmPages,
    size: firmLoadedPages,
    setSize: setFirmLoadedPages,
    error: firmError,
    mutate: retryFirms,
    isLoading: isLoadingFirms,
    isValidating: isValidatingFirms,
  } = useSWRInfinite<{ firms: InvestmentFirm[]; pagination: { hasMore: boolean; total: number }; facets?: DiscoveryFacets }>(
    getFirmKey,
    swrFetcher,
    {
      fallbackData: matchesInitialFilters ? [{ firms: initialFirms, pagination: { total: stats.totalFirms, hasMore: stats.totalFirms > initialFirms.length }, facets: initialFacets?.firms }] : undefined,
      revalidateFirstPage: false,
      revalidateOnFocus: false,
    }
  )

  // Flatten firm pages into single array
  const loadedFirms = useMemo(() => {
    if (!firmPages) return []
    return firmPages.flatMap(page => page.firms || [])
  }, [firmPages])

  const hasMoreFirms = firmPages?.[firmPages.length - 1]?.pagination?.hasMore ?? false
  const totalFirms = firmPages?.[0]?.pagination?.total ?? stats.totalFirms

  const loadMoreFirms = useCallback(() => {
    if (!isLoadingFirms && !isValidatingFirms && hasMoreFirms) {
      setFirmLoadedPages(firmLoadedPages + 1)
    }
  }, [isLoadingFirms, isValidatingFirms, hasMoreFirms, firmLoadedPages, setFirmLoadedPages])

  const activeFacets = viewMode === "firms" ? firmPages?.[0]?.facets : investorPages?.[0]?.facets
  const facetOptions = (key: keyof DiscoveryFacets, all: string, selected: string) =>
    [all, ...Array.from(new Set([...(activeFacets?.[key] ?? []), ...(selected !== all ? [selected] : [])])).sort()]
  const countries = facetOptions("countries", "All Countries", countryFilter)
  const stages = facetOptions("stages", "All Stages", stageFilter)
  const types = facetOptions("types", "All Types", typeFilter)
  const sectors = facetOptions("sectors", "All Sectors", sectorFilter)
  const filteredInvestors = loadedInvestors
  const filteredFirms = loadedFirms

  const handleAddToOutreach = async (id: string, type: 'investor' | 'firm') => {
    try {
      const result = await addToOutreach(id, type)
      setStatus({ type: result.success ? 'success' : 'error', message: result.success ? result.message : result.error || 'Could not add this record. Please retry.' })
    } catch { setStatus({ type: 'error', message: 'Could not add this record. Please retry.' }) }
  }

  const handleBulkAdd = async () => {
    const ids = [...selectedIds]
    const failed = new Set<string>()
    for (const id of ids) {
      try { const result = await addToOutreach(id, 'investor'); if (!result.success) failed.add(id) }
      catch { failed.add(id) }
    }
    setSelectedIds(failed)
    setStatus({ type: failed.size ? 'error' : 'success', message: `${ids.length - failed.size} of ${ids.length} added.${failed.size ? ` ${failed.size} failed and remain selected. Retry the selection.` : ''}` })
  }

  // These actions are exposed only to staff and call the real crawler/AI
  // services. Regular tenant users never receive the admin controls.
  const handleDeepResearch = async (id: string, type: 'investor' | 'firm') => {
    if (!isAdmin) { setStatus({ type: 'error', message: 'This operation requires owner-console access.' }); return false }
    const row = type === 'firm' ? loadedFirms.find((f) => f.id === id) : loadedInvestors.find((i) => i.id === id)
    const target = type === 'firm' ? (row as InvestmentFirm | undefined)?.website || (row as InvestmentFirm | undefined)?.name : (row as Investor | undefined)?.website || (row as Investor | undefined)?.linkedin_url || [ (row as Investor | undefined)?.first_name, (row as Investor | undefined)?.last_name ].filter(Boolean).join(' ')
    if (!target) { setStatus({ type: 'error', message: 'No public URL or name is available for this record.' }); return false }
    setIsEnriching(id); setStatus({ type: null, message: '' })
    try {
      const result = await requestJson<{ pagesUsed?: unknown[]; notes?: string }>('/api/admin/deep-research', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target }),
      })
      setStatus({ type: 'success', message: `Deep research completed for ${target}${result.pagesUsed ? ` · ${result.pagesUsed.length} pages used` : ''}.` })
      return true
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Deep research failed. No records were changed.' })
      return false
    } finally { setIsEnriching(null) }
  }
  const unavailable = () => setStatus({ type: 'error', message: 'URL verification is not available yet. No records were changed.' })
  const handleUrlCheck = async (_id: string) => unavailable()
  const handleEnrichData = async (id: string, type: 'investor' | 'firm') => {
    if (!isAdmin) { setStatus({ type: 'error', message: 'This operation requires owner-console access.' }); return false }
    setIsEnriching(id); setStatus({ type: null, message: '' })
    try {
      const body = type === 'firm' ? { firmId: id } : { investorId: id }
      const result = await requestJson<{ changes?: unknown[]; generatedBy?: string }>('/api/admin/enrich', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      setStatus({ type: 'success', message: `Enrichment completed · ${result.changes?.length ?? 0} field changes${result.generatedBy ? ` · ${result.generatedBy}` : ''}. Refresh to view updates.` })
      return true
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Enrichment failed. No records were changed.' })
      return false
    } finally { setIsEnriching(null) }
  }
  const handleBulkEnrich = async () => {
    if (!isAdmin || !selectedIds.size) return
    const ids = [...selectedIds]
    let completed = 0
    for (const id of ids) {
      const type = loadedFirms.some((f) => f.id === id) ? 'firm' : 'investor'
      if (await handleEnrichData(id, type)) completed += 1
    }
    setSelectedIds(new Set())
    setStatus({ type: completed === ids.length ? 'success' : 'error', message: `Enrichment completed for ${completed} of ${ids.length} selected records. Refresh to view updates.` })
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
      <div className="border-b border-border bg-card">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <PageHeader
            accent="#2f45e0"
            eyebrow="Source & match · Investor database"
            title={<span className="flex items-center gap-2">Discover investors{isAdmin && <StaffBadge label="Admin" />}</span>}
            description={
              activeFilterCount > 0
                ? `${totalInvestors.toLocaleString()} investors and ${totalFirms.toLocaleString()} firms match your filters across the database`
                : `${stats.totalInvestors.toLocaleString()} investors · ${stats.totalFirms.toLocaleString()} firms across the shared database. Search, filter, and save to your personal CRM.`
            }
            actions={
              <>
                {isAdmin && (
                  <Button asChild variant="outline"><Link href="/dashboard/admin">Owner Console</Link></Button>
                )}
                <Button variant="outline" className="gap-2" aria-expanded={showFilters} aria-controls="discover-filters" onClick={() => setShowFilters(!showFilters)}>
                  <Filter className="w-4 h-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-foreground text-background text-xs rounded-full">{activeFilterCount}</span>
                  )}
                </Button>
                <Button asChild className="gap-2 bg-foreground text-background"><Link href={matchingHref}><Sparkles className="w-4 h-4" />Prepare matching</Link></Button>
              </>
            }
          />

          {/* View Toggle & Search */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex max-w-full overflow-x-auto border border-border rounded p-1">
              {[
                { mode: "investors" as ViewMode, icon: UserIcon, label: "Investors", count: filteredInvestors.length, total: totalInvestors },
                { mode: "firms" as ViewMode, icon: Building2, label: "Firms", count: filteredFirms.length, total: stats.totalFirms },
              ].map(({ mode, icon: Icon, label, count, total }) => (
                <button
                  key={mode}
                  aria-pressed={viewMode === mode}
                  onClick={() => { setViewMode(mode); setInvestorPage(1); setFirmPage(1) }}
                  className={`px-3 py-2 min-h-11 shrink-0 text-sm font-medium rounded flex items-center gap-2 transition-colors ${
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

            <div className="relative flex-1 basis-64 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                aria-label={`Search ${viewMode}`}
                placeholder={`Search ${viewMode}...`}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setInvestorPage(1); setFirmPage(1) }}
                className="pl-10 bg-foreground/5 border-foreground/10"
              />
            </div>

            <div className="flex max-w-full overflow-x-auto border border-border rounded p-1">
              <button aria-label="Table view" aria-pressed={displayMode === "table"} onClick={() => setDisplayMode("table")} className={`p-3 rounded ${displayMode === "table" ? "bg-foreground/10" : ""}`}>
                <List className="w-4 h-4" />
              </button>
              <button aria-label="Grid view" aria-pressed={displayMode === "grid"} onClick={() => setDisplayMode("grid")} className={`p-3 rounded ${displayMode === "grid" ? "bg-foreground/10" : ""}`}>
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div id="discover-filters" className="px-4 sm:px-6 lg:px-8 py-4 border-t border-foreground/10 bg-foreground/[0.02]">
            <div className="flex flex-wrap items-center gap-4">
              <FilterSelect label="Stage" value={stageFilter} options={stages} onChange={(v) => { setStageFilter(v); setInvestorPage(1); setFirmPage(1) }} />
              <FilterSelect label="Type" value={typeFilter} options={types} onChange={(v) => { setTypeFilter(v); setInvestorPage(1); setFirmPage(1) }} />
              <FilterSelect label="Region" value={countryFilter} options={countries} onChange={(v) => { setCountryFilter(v); setInvestorPage(1); setFirmPage(1) }} />
              <FilterSelect label="Check Size" value={checkSizeFilter} options={CHECK_SIZES} onChange={(v) => { setCheckSizeFilter(v); setInvestorPage(1); setFirmPage(1) }} />
              <FilterSelect label="Sector" value={sectorFilter} options={sectors} onChange={(v) => { setSectorFilter(v); setInvestorPage(1); setFirmPage(1) }} />
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
      {(investorError || firmError) && <div className="m-4"><DataError label="Could not load discovery records." onRetry={() => { retryInvestors(); retryFirms() }} /></div>}
      {status.type && (
        <div className={`mx-6 lg:mx-8 mt-4 p-4 rounded-lg flex items-center gap-3 ${
          status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <p className="text-sm">{status.message}</p>
          <button onClick={() => setStatus({ type: null, message: '' })} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="mx-6 lg:mx-8 mt-4 p-4 bg-foreground/5 rounded-lg flex items-center justify-between">
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
              <Plus className="w-4 h-4" />Add to CRM
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="px-6 lg:px-8 py-8">
        {viewMode === "investors" && (
          <>
            {isLoadingInvestors && filteredInvestors.length === 0 ? (
              <DataLoading label="Loading investors" />
            ) : (
              <>
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
                {/* Load More Button */}
                {hasMoreInvestors && (
                  <div className="flex justify-center mt-6 pb-8">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={loadMoreInvestors}
                      disabled={isValidatingInvestors}
                      className="gap-2"
                    >
                      {isValidatingInvestors ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading more...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Load More ({loadedInvestors.length.toLocaleString()} of {totalInvestors.toLocaleString()})
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
        {viewMode === "firms" && (
          <>
            {isLoadingFirms && filteredFirms.length === 0 ? (
              <DataLoading label="Loading firms" />
            ) : (
              <>
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
                {/* Load More Button for Firms */}
                {hasMoreFirms && (
                  <div className="flex justify-center mt-6 pb-8">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={loadMoreFirms}
                      disabled={isValidatingFirms}
                      className="gap-2"
                    >
                      {isValidatingFirms ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading more...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          Load More ({loadedFirms.length.toLocaleString()} of {totalFirms.toLocaleString()})
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
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
                            <DropdownMenuItem disabled title="Not available yet" onClick={() => onUrlCheck(inv.id)}>
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
                        <DropdownMenuItem disabled title="Not available yet" onClick={() => onUrlCheck(firm.id)}>
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
