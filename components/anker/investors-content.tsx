"use client"

import type { User } from "@supabase/supabase-js"
import { 
  Search, 
  Filter, 
  ArrowUpRight,
  Sparkles,
  MapPin,
  DollarSign,
  Building2,
  Globe,
  ChevronRight,
  Star,
  Plus,
  SlidersHorizontal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

interface InvestorsContentProps {
  user: User
}

// Mock investor data
const mockInvestors = [
  {
    id: 1,
    name: "Sequoia Capital",
    type: "Venture Capital",
    stages: ["Seed", "Series A", "Series B"],
    sectors: ["Technology", "AI/ML", "Fintech"],
    checkSize: "$500K - $10M",
    location: "Menlo Park, CA",
    matchScore: 95,
    website: "sequoiacap.com",
  },
  {
    id: 2,
    name: "Andreessen Horowitz",
    type: "Venture Capital",
    stages: ["Seed", "Series A", "Series B", "Growth"],
    sectors: ["Technology", "Crypto", "Bio"],
    checkSize: "$1M - $50M",
    location: "Menlo Park, CA",
    matchScore: 88,
    website: "a16z.com",
  },
  {
    id: 3,
    name: "Y Combinator",
    type: "Accelerator",
    stages: ["Pre-seed", "Seed"],
    sectors: ["Technology", "B2B", "Consumer"],
    checkSize: "$125K - $500K",
    location: "San Francisco, CA",
    matchScore: 82,
    website: "ycombinator.com",
  },
  {
    id: 4,
    name: "First Round Capital",
    type: "Venture Capital",
    stages: ["Seed", "Series A"],
    sectors: ["Enterprise", "Consumer", "Healthcare"],
    checkSize: "$500K - $5M",
    location: "San Francisco, CA",
    matchScore: 78,
    website: "firstround.com",
  },
]

export function InvestorsContent({ user }: InvestorsContentProps) {
  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">AI-Powered</span>
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Find Investors
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Filters
            </Button>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Investor
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="px-8 py-8 space-y-6">
        {/* Search and filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search investors by name, sector, or stage..." 
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">Sector</Button>
            <Button variant="outline" size="sm">Stage</Button>
            <Button variant="outline" size="sm">Check Size</Button>
            <Button variant="outline" size="sm">Location</Button>
          </div>
        </div>

        {/* AI Match Banner */}
        <div className="bg-gradient-to-r from-primary/5 via-primary/10 to-transparent border border-primary/20 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-display font-semibold mb-1">Get AI-Powered Matches</h3>
                <p className="text-sm text-muted-foreground">
                  Upload your pitch deck to receive personalized investor recommendations based on your startup profile.
                </p>
              </div>
            </div>
            <Button>
              Upload Pitch Deck
            </Button>
          </div>
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{mockInvestors.length}</span> investors
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Sort by:
            <Button variant="ghost" size="sm" className="h-auto p-0 font-medium text-foreground">
              Match Score
            </Button>
          </div>
        </div>

        {/* Investor cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {mockInvestors.map((investor) => (
            <div 
              key={investor.id}
              className="group bg-card/50 border border-border/50 rounded-xl p-6 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold flex items-center gap-2">
                      {investor.name}
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </h3>
                    <p className="text-sm text-muted-foreground">{investor.type}</p>
                  </div>
                </div>
                <div className={`px-2.5 py-1 rounded-full font-mono text-xs font-medium ${
                  investor.matchScore >= 90 ? "bg-green-100 text-green-700" :
                  investor.matchScore >= 80 ? "bg-blue-100 text-blue-700" :
                  "bg-amber-100 text-amber-700"
                }`}>
                  {investor.matchScore}% match
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Check size:</span>
                  <span className="font-medium">{investor.checkSize}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Location:</span>
                  <span className="font-medium">{investor.location}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {investor.stages.map((stage) => (
                  <span 
                    key={stage}
                    className="px-2 py-1 bg-muted rounded text-xs font-medium"
                  >
                    {stage}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border/50">
                <div className="flex flex-wrap gap-1">
                  {investor.sectors.slice(0, 3).map((sector) => (
                    <span 
                      key={sector}
                      className="text-xs text-muted-foreground"
                    >
                      {sector}
                      {investor.sectors.indexOf(sector) < Math.min(2, investor.sectors.length - 1) && " • "}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-8">
                    <Star className="w-4 h-4" />
                  </Button>
                  <Button size="sm" className="h-8">
                    View Profile
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
