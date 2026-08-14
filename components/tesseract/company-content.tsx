"use client"

import { useState } from "react"
import type { User } from "@supabase/supabase-js"
import { 
  Building2,
  Plus,
  ChevronRight,
  Globe,
  MapPin,
  Users,
  Calendar,
  DollarSign,
  FileText,
  Linkedin,
  Twitter,
  ArrowRight,
  Edit3,
  Trash2,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface CompanyContentProps {
  user: User
}

// Mock companies data
const mockCompanies = [
  {
    id: "1",
    name: "TechVenture AI",
    industry: "Artificial Intelligence",
    stage: "Seed",
    location: "San Francisco, CA",
    fundingTarget: "$2M - $4M",
    website: "techventure.ai",
    description: "AI-powered automation for enterprise workflows",
    teamSize: "5-10",
    founded: "2024",
    logo: null,
  },
]

export function CompanyContent({ user }: CompanyContentProps) {
  const [companies] = useState(mockCompanies)
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              <span className="w-2.5 h-2.5 bg-[#2f45e0]" /> Workspace
            </div>
            <h1 className="text-3xl font-display tracking-tight">
              My companies
            </h1>
          </div>
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Company
          </Button>
        </div>
      </header>

      <div className="px-8 py-8">
        {companies.length === 0 ? (
          /* Empty state */
          <div className="text-center py-16 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-6">
              <Building2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="font-display text-xl font-semibold mb-2">No Companies Yet</h2>
            <p className="text-muted-foreground mb-6">
              Add your first company profile to start finding investors and managing your fundraise.
            </p>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Your Company
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Company Cards */}
            {companies.map((company) => (
              <div 
                key={company.id}
                className="bg-card/50 border border-border/50 rounded-xl overflow-hidden"
              >
                {/* Company header */}
                <div className="p-6 border-b border-border/50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl bg-foreground/5 border border-border flex items-center justify-center">
                        <Building2 className="w-7 h-7 text-muted-foreground" />
                      </div>
                      <div>
                        <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                          {company.name}
                          <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full font-mono text-[10px] uppercase">
                            {company.stage}
                          </span>
                        </h2>
                        <p className="text-sm text-muted-foreground">{company.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm">
                        <Edit3 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Company details */}
                <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Globe className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-muted-foreground uppercase">Industry</p>
                      <p className="text-sm font-medium">{company.industry}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-muted-foreground uppercase">Location</p>
                      <p className="text-sm font-medium">{company.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-muted-foreground uppercase">Target Raise</p>
                      <p className="text-sm font-medium">{company.fundingTarget}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <Users className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-muted-foreground uppercase">Team Size</p>
                      <p className="text-sm font-medium">{company.teamSize}</p>
                    </div>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="px-6 py-4 bg-muted/30 border-t border-border/50 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <a href={`https://${company.website}`} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <Globe className="w-4 h-4" />
                      {company.website}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-2">
                      <FileText className="w-4 h-4" />
                      Upload Pitch Deck
                    </Button>
                    <Button size="sm" className="gap-2">
                      <Sparkles className="w-4 h-4" />
                      Find Investors
                      <ArrowRight className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {/* Add another company */}
            <button
              onClick={() => setShowForm(true)}
              className="w-full p-6 border border-dashed border-border/50 rounded-xl text-center hover:border-foreground/30 transition-colors group"
            >
              <Plus className="w-6 h-6 text-muted-foreground mx-auto mb-2 group-hover:text-foreground transition-colors" />
              <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                Add another company
              </p>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
