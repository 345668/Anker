"use client"

import { useState } from "react"
import type { User } from "@supabase/supabase-js"
import type { InvestmentFirm, Investor } from "@/lib/db/types"
import { 
  Search, 
  ArrowUpRight,
  Sparkles,
  MapPin,
  DollarSign,
  Building2,
  ChevronRight,
  Plus,
  SlidersHorizontal,
  Users,
  Globe,
  Briefcase,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface InvestorsContentProps {
  user: User
  firms: InvestmentFirm[]
  investors: Investor[]
}

function formatCheckSize(min: number | null, max: number | null): string {
  const format = (n: number) => {
    if (n >= 1000000) return `$${(n / 1000000).toFixed(0)}M`
    if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`
    return `$${n}`
  }
  if (!min && !max) return "Not specified"
  if (!min) return `Up to ${format(max!)}`
  if (!max) return `${format(min)}+`
  return `${format(min)} - ${format(max)}`
}

export function InvestorsContent({ user, firms, investors }: InvestorsContentProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [stageFilter, setStageFilter] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  // Filter firms based on search and filters
  const filteredFirms = firms.filter(firm => {
    const matchesSearch = !searchQuery || 
      firm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      firm.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      firm.industries?.some(i => i.toLowerCase().includes(searchQuery.toLowerCase()))
    
    const matchesStage = !stageFilter || firm.stages?.includes(stageFilter)
    const matchesType = !typeFilter || firm.firm_type === typeFilter
    
    return matchesSearch && matchesStage && matchesType
  })

  // Get unique stages and types for filters
  const allStages = [...new Set(firms.flatMap(f => f.stages || []))]
  const allTypes = [...new Set(firms.map(f => f.firm_type).filter(Boolean))]

  return (
    <div className="min-h-screen">
      {/* Top bar - Optimus style */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-foreground/10">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-2">
              <span className="w-8 h-px bg-foreground/30" />
              Investors
            </span>
            <h1 className="font-display text-2xl tracking-tight">
              Find Investors
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Filters
            </Button>
            <Button size="sm" className="gap-2 bg-foreground text-background hover:bg-foreground/90 rounded-full">
              <Plus className="w-4 h-4" />
              Add Investor
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="px-8 py-8 space-y-8">
        {/* Stats Grid - Optimus style */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-foreground/10">
          <div className="bg-background p-6">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Investment Firms</p>
            <p className="font-display text-3xl tracking-tight">{firms.length}</p>
          </div>
          <div className="bg-background p-6">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Individual Investors</p>
            <p className="font-display text-3xl tracking-tight">{investors.length}</p>
          </div>
          <div className="bg-background p-6">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Decision Makers</p>
            <p className="font-display text-3xl tracking-tight">{investors.filter(i => /partner|principal|managing director|general partner|founder|cio|chief investment/i.test(i.title ?? "")).length}</p>
          </div>
          <div className="bg-background p-6">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider mb-2">AI Matches</p>
            <p className="font-display text-3xl tracking-tight">0</p>
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name, industry, or description..." 
              className="pl-10 bg-background border-foreground/10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            {allStages.slice(0, 4).map(stage => (
              <Button 
                key={stage}
                variant={stageFilter === stage ? "default" : "outline"} 
                size="sm"
                onClick={() => setStageFilter(stageFilter === stage ? null : stage)}
                className={stageFilter === stage ? "bg-foreground text-background" : ""}
              >
                {stage}
              </Button>
            ))}
          </div>
        </div>

        {/* AI Match Banner - Optimus style */}
        <div className="bg-foreground text-background p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-background/10 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-background/60" />
              </div>
              <div>
                <h3 className="font-display text-xl mb-2">Get AI-Powered Matches</h3>
                <p className="text-background/60 max-w-md">
                  Upload your pitch deck to receive personalized investor recommendations based on your startup profile.
                </p>
              </div>
            </div>
            <Button className="bg-background text-foreground hover:bg-background/90 rounded-full px-6">
              Upload Pitch Deck
            </Button>
          </div>
        </div>

        {/* Results header */}
        <div className="flex items-center gap-4">
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
            {filteredFirms.length} Firms
          </span>
          <div className="flex-1 h-px bg-foreground/10" />
        </div>

        {/* Investor cards - Optimus style grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-foreground/10">
          {filteredFirms.map((firm) => (
            <div 
              key={firm.id}
              className="group bg-background p-8 hover:bg-foreground/[0.02] transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  {firm.logo_url ? (
                    <img 
                      src={firm.logo_url} 
                      alt={firm.name}
                      className="w-14 h-14 object-contain bg-foreground/5"
                    />
                  ) : (
                    <div className="w-14 h-14 bg-foreground/5 flex items-center justify-center">
                      <Building2 className="w-7 h-7 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-display text-lg flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                      {firm.name}
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h3>
                    <p className="text-sm text-muted-foreground">{firm.firm_type || "Venture Capital"}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 text-sm">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Check size:</span>
                  <span className="font-medium">{formatCheckSize(firm.check_size_min, firm.check_size_max)}</span>
                </div>
                {firm.hq_location && (
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Location:</span>
                    <span className="font-medium">{firm.hq_location}</span>
                  </div>
                )}
                {firm.investment_count && (
                  <div className="flex items-center gap-3 text-sm">
                    <Briefcase className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Investments:</span>
                    <span className="font-medium">{firm.investment_count}</span>
                  </div>
                )}
              </div>

              {firm.stages && firm.stages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {firm.stages.map((stage) => (
                    <span 
                      key={stage}
                      className="px-3 py-1 bg-foreground/5 text-xs font-medium"
                    >
                      {stage}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-6 border-t border-foreground/10">
                <div className="flex flex-wrap gap-1">
                  {firm.industries?.slice(0, 3).map((industry, idx) => (
                    <span key={industry} className="text-xs text-muted-foreground">
                      {industry}{idx < Math.min(2, (firm.industries?.length || 0) - 1) && " · "}
                    </span>
                  ))}
                </div>
                <Button size="sm" variant="ghost" className="gap-2 group-hover:bg-foreground group-hover:text-background transition-colors">
                  View Profile
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {filteredFirms.length === 0 && (
          <div className="text-center py-16">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-display text-lg mb-2">No investors found</h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search or filters
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
