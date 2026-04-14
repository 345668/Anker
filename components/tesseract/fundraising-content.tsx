"use client"

import { useState } from "react"
import type { User } from "@supabase/supabase-js"
import Link from "next/link"
import { 
  Building2,
  Search,
  Target,
  Handshake,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronRight,
  Plus,
  FileText,
  Globe,
  Linkedin,
  DollarSign,
  Users,
  MapPin,
  TrendingUp,
  Zap,
  Settings2,
  Filter,
  Star,
  Mail,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface FundraisingContentProps {
  user: User
}

type Tab = "profile" | "find" | "matches" | "deals"

const TABS: { id: Tab; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "profile", label: "Profile", icon: Building2, desc: "Your fundraising profile" },
  { id: "find", label: "Find Investors", icon: Search, desc: "Run AI matching" },
  { id: "matches", label: "My Matches", icon: Target, desc: "Track & manage matches" },
  { id: "deals", label: "Deal Rooms", icon: Handshake, desc: "Active deals" },
]

type Algorithm = "accelerated" | "standard" | "niche" | "custom"

const ALGORITHMS: {
  id: Algorithm
  label: string
  badge: string
  desc: string
  recommended?: boolean
}[] = [
  {
    id: "accelerated",
    label: "Accelerated",
    badge: "Fast",
    desc: "Pre-filtered pool, full 9-factor scoring. Best for complete profiles.",
    recommended: true,
  },
  {
    id: "standard",
    label: "Standard",
    badge: "Thorough",
    desc: "Full database scan across all 500+ investors. No pre-filtering.",
  },
  {
    id: "niche",
    label: "Niche Focus",
    badge: "Domain",
    desc: "Boosts Film, Real Estate, or Sports specialist investors.",
  },
  {
    id: "custom",
    label: "Custom Weights",
    badge: "Advanced",
    desc: "Manually adjust the 6 factor weights before running.",
  },
]

// Mock data
const mockMatches = [
  {
    id: "1",
    firmName: "Sequoia Capital",
    investorName: "Michael Moritz",
    score: 94,
    tier: "champion",
    status: "pending",
    winProbability: 78,
    investorEmail: "contact@sequoiacap.com",
    factorIndustry: 0.95,
    factorStage: 0.88,
    factorGeo: 0.92,
    factorCheckSize: 0.85,
    factorInvestorType: 0.90,
    factorTeamSignal: 0.82,
  },
  {
    id: "2",
    firmName: "Andreessen Horowitz",
    investorName: "Marc Andreessen",
    score: 89,
    tier: "A",
    status: "in_crm",
    winProbability: 65,
    investorEmail: "deals@a16z.com",
    factorIndustry: 0.88,
    factorStage: 0.92,
    factorGeo: 0.85,
    factorCheckSize: 0.90,
    factorInvestorType: 0.82,
    factorTeamSignal: 0.78,
  },
  {
    id: "3",
    firmName: "First Round Capital",
    investorName: "Josh Kopelman",
    score: 82,
    tier: "A",
    status: "contacted",
    winProbability: 52,
    investorEmail: "pitch@firstround.com",
    factorIndustry: 0.82,
    factorStage: 0.88,
    factorGeo: 0.78,
    factorCheckSize: 0.85,
    factorInvestorType: 0.80,
    factorTeamSignal: 0.75,
  },
]

const TIERS = {
  champion: { label: "Champion", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  A: { label: "Strong", color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200" },
  B: { label: "Good", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  C: { label: "Potential", color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200" },
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "text-muted-foreground" },
  in_crm: { label: "In CRM", color: "text-violet-600" },
  contacted: { label: "Contacted", color: "text-blue-600" },
  responded: { label: "Responded", color: "text-amber-600" },
  won: { label: "Won", color: "text-green-600" },
  lost: { label: "Lost", color: "text-red-600" },
}

export function FundraisingContent({ user }: FundraisingContentProps) {
  const [activeTab, setActiveTab] = useState<Tab>("profile")
  const [selectedAlgo, setSelectedAlgo] = useState<Algorithm>("accelerated")
  
  // Profile form state
  const [formValues, setFormValues] = useState({
    name: "",
    website: "",
    location: "",
    industry: "",
    stage: "",
    fundingTarget: "",
    founderLinkedin: "",
    description: "",
    targetGeographies: "",
  })

  const profileFields = [
    { key: "name", label: "Company name", placeholder: "e.g. NovaSphere", required: true },
    { key: "website", label: "Website", placeholder: "https://yourcompany.com" },
    { key: "location", label: "HQ location", placeholder: "Amsterdam, Netherlands", required: true },
    { key: "industry", label: "Industry", placeholder: "AI / Machine Learning", required: true },
    { key: "stage", label: "Current stage", placeholder: "Seed", required: true },
    { key: "fundingTarget", label: "Target raise", placeholder: "$1M - $3M", required: true },
    { key: "founderLinkedin", label: "Your LinkedIn", placeholder: "linkedin.com/in/you", required: true },
    { key: "targetGeographies", label: "Target geographies", placeholder: "Europe, MENA, US" },
  ]

  // Calculate readiness score
  const requiredFields = profileFields.filter(f => f.required)
  const filledRequired = requiredFields.filter(f => formValues[f.key as keyof typeof formValues]).length
  const readinessScore = Math.round((filledRequired / requiredFields.length) * 100)

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-8 py-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-foreground" />
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Fundraising Hub</span>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Raise Your Round
          </h1>
        </div>
        
        {/* Tab navigation */}
        <div className="px-8 flex gap-1 border-t border-border/30 bg-muted/30">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-3 flex items-center gap-2 text-sm transition-all ${
                activeTab === tab.id 
                  ? "text-foreground font-medium" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
              )}
            </button>
          ))}
        </div>
      </header>

      {/* Main content */}
      <div className="px-8 py-8">
        {/* Profile Tab */}
        {activeTab === "profile" && (
          <div className="max-w-4xl space-y-8">
            {/* Readiness Score */}
            <div className="bg-card/50 border border-border/50 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-display font-semibold mb-1">Match Readiness</h2>
                  <p className="text-sm text-muted-foreground">Complete your profile to improve match quality</p>
                </div>
                <div className={`font-display text-3xl font-semibold ${
                  readinessScore >= 80 ? "text-green-600" : 
                  readinessScore >= 50 ? "text-amber-600" : "text-red-600"
                }`}>
                  {readinessScore}%
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${
                    readinessScore >= 80 ? "bg-green-500" : 
                    readinessScore >= 50 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${readinessScore}%` }}
                />
              </div>
              {readinessScore < 100 && (
                <p className="text-xs text-muted-foreground mt-3">
                  Fill in required fields to unlock AI matching
                </p>
              )}
            </div>

            {/* Pitch Deck Upload */}
            <div 
              className="bg-card/50 border border-dashed border-border rounded-xl p-8 text-center hover:border-foreground/30 transition-colors cursor-pointer"
            >
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
                <FileText className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="font-display font-semibold mb-2">Upload Pitch Deck to Auto-Fill</h3>
              <p className="text-sm text-muted-foreground mb-4">
                AI extracts company name, stage, market & more automatically
              </p>
              <Button variant="outline">
                Upload PDF
              </Button>
            </div>

            {/* Profile Form */}
            <div className="bg-card/50 border border-border/50 rounded-xl p-6">
              <h2 className="font-display font-semibold mb-6">Company Profile</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {profileFields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </label>
                    <Input
                      placeholder={field.placeholder}
                      value={formValues[field.key as keyof typeof formValues]}
                      onChange={(e) => setFormValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className="md:col-span-2 space-y-2">
                  <label className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                    One-line description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    placeholder="What your company does in one sentence"
                    value={formValues.description}
                    onChange={(e) => setFormValues(prev => ({ ...prev, description: e.target.value }))}
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 mt-6 pt-6 border-t border-border/50">
                <Button variant="outline">Save Profile</Button>
                <Button onClick={() => setActiveTab("find")}>
                  Save & Find Investors
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Find Investors Tab */}
        {activeTab === "find" && (
          <div className="max-w-4xl space-y-8">
            {/* Algorithm Selection */}
            <div>
              <h2 className="font-display font-semibold mb-4">Select Matching Algorithm</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ALGORITHMS.map((algo) => (
                  <button
                    key={algo.id}
                    onClick={() => setSelectedAlgo(algo.id)}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      selectedAlgo === algo.id
                        ? "border-foreground bg-foreground/5"
                        : "border-border/50 hover:border-foreground/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-display font-semibold">{algo.label}</span>
                      <span className={`font-mono text-[10px] px-2 py-0.5 rounded-full ${
                        algo.recommended ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                      }`}>
                        {algo.badge}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{algo.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Run Matching */}
            <div className="bg-foreground text-background rounded-2xl p-8">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-background/60 block mb-2">
                    Ready to match
                  </span>
                  <h2 className="font-display text-2xl font-semibold mb-2">
                    Find Your Investors
                  </h2>
                  <p className="text-background/70 max-w-md mb-6">
                    Our AI will analyze 500+ investors and rank them based on fit with your startup profile.
                  </p>
                  <Button className="bg-background text-foreground hover:bg-background/90">
                    <Zap className="w-4 h-4 mr-2" />
                    Run {ALGORITHMS.find(a => a.id === selectedAlgo)?.label} Matching
                  </Button>
                </div>
                <div className="w-24 h-24 rounded-xl bg-background/10 flex items-center justify-center">
                  <Sparkles className="w-12 h-12 text-background/80" />
                </div>
              </div>
            </div>

            {/* Scoring Factors */}
            <div className="bg-card/50 border border-border/50 rounded-xl p-6">
              <h3 className="font-display font-semibold mb-4">How We Score Matches</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: "Industry Alignment", weight: "28%" },
                  { label: "Stage Compatibility", weight: "22%" },
                  { label: "Geographic Fit", weight: "18%" },
                  { label: "Check Size", weight: "14%" },
                  { label: "Investor Type", weight: "10%" },
                  { label: "Team Signal", weight: "8%" },
                ].map((factor) => (
                  <div key={factor.label} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">{factor.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">{factor.weight}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Matches Tab */}
        {activeTab === "matches" && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Filter
                </Button>
                <div className="flex gap-2">
                  {Object.entries(TIERS).map(([key, tier]) => (
                    <button
                      key={key}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium ${tier.bg} ${tier.color} ${tier.border} border`}
                    >
                      {tier.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {mockMatches.length} matches found
              </p>
            </div>

            {/* Match Cards */}
            <div className="space-y-4">
              {mockMatches.map((match) => {
                const tier = TIERS[match.tier as keyof typeof TIERS] || TIERS.C
                const status = STATUS_CONFIG[match.status] || STATUS_CONFIG.pending

                return (
                  <div 
                    key={match.id}
                    className="bg-card/50 border border-border/50 rounded-xl p-6 hover:border-foreground/20 transition-all"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                          <Building2 className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="font-display font-semibold flex items-center gap-2">
                            {match.firmName}
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tier.bg} ${tier.color}`}>
                              {tier.label}
                            </span>
                          </h3>
                          <p className="text-sm text-muted-foreground">{match.investorName}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-display text-2xl font-semibold">{match.score}</div>
                        <div className="text-xs text-muted-foreground">match score</div>
                      </div>
                    </div>

                    {/* Factor Breakdown */}
                    <div className="grid grid-cols-6 gap-2 mb-4">
                      {[
                        { label: "Industry", val: match.factorIndustry },
                        { label: "Stage", val: match.factorStage },
                        { label: "Geo", val: match.factorGeo },
                        { label: "Check", val: match.factorCheckSize },
                        { label: "Type", val: match.factorInvestorType },
                        { label: "Team", val: match.factorTeamSignal },
                      ].map((factor) => (
                        <div key={factor.label} className="text-center">
                          <div className="text-xs text-muted-foreground mb-1">{factor.label}</div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-foreground/60 rounded-full"
                              style={{ width: `${factor.val * 100}%` }}
                            />
                          </div>
                          <div className="font-mono text-[10px] mt-1">{Math.round(factor.val * 100)}</div>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-border/50">
                      <div className="flex items-center gap-4">
                        <span className={`text-sm font-medium ${status.color}`}>
                          {status.label}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {match.winProbability}% win probability
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm">
                          <Star className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Mail className="w-4 h-4" />
                          Add to CRM
                        </Button>
                        <Button size="sm" className="gap-2">
                          View Profile
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Deals Tab */}
        {activeTab === "deals" && (
          <div className="max-w-4xl">
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-6">
                <Handshake className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="font-display text-xl font-semibold mb-2">No Active Deals Yet</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                When you advance matches to deal stage, they will appear here with shared data rooms and negotiation tools.
              </p>
              <Button onClick={() => setActiveTab("matches")}>
                View Matches
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
