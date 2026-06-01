"use client"

import type { User } from "@supabase/supabase-js"
import { 
  FileText, 
  Upload,
  Sparkles,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Download,
  Eye,
  Share2,
  BarChart3,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface PitchDeckContentProps {
  user: User
}

const feedbackCategories = [
  { name: "Story & Narrative", score: null, status: "pending" },
  { name: "Market Opportunity", score: null, status: "pending" },
  { name: "Business Model", score: null, status: "pending" },
  { name: "Traction & Metrics", score: null, status: "pending" },
  { name: "Team & Execution", score: null, status: "pending" },
  { name: "Financial Projections", score: null, status: "pending" },
  { name: "Ask & Use of Funds", score: null, status: "pending" },
  { name: "Design & Clarity", score: null, status: "pending" },
]

export function PitchDeckContent({ user }: PitchDeckContentProps) {
  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-primary" />
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">MBB-Style Analysis</span>
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Pitch Deck Analyzer
            </h1>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="px-8 py-8 space-y-8">
        {/* Upload section */}
        <div className="bg-card/50 border border-border/50 rounded-xl p-8">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <h2 className="font-display text-xl font-semibold mb-2">
              Upload Your Pitch Deck
            </h2>
            <p className="text-muted-foreground mb-6">
              Get MBB-style feedback and AI-powered investor matching in minutes. 
              Supports PDF, PPT, and PPTX formats up to 50MB.
            </p>
            <div className="border-2 border-dashed border-border rounded-xl p-12 hover:border-primary/50 transition-colors cursor-pointer">
              <input type="file" className="hidden" accept=".pdf,.ppt,.pptx" />
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">
                Drag and drop your pitch deck here, or{" "}
                <span className="text-primary font-medium">browse files</span>
              </p>
            </div>
          </div>
        </div>

        {/* What you get section */}
        <div>
          <h3 className="font-display text-lg font-semibold mb-4">What you&apos;ll get</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card/50 border border-border/50 rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center mb-4">
                <BarChart3 className="w-5 h-5 text-amber-600" />
              </div>
              <h4 className="font-display font-semibold mb-2">MBB-Style Feedback</h4>
              <p className="text-sm text-muted-foreground">
                Comprehensive analysis of your pitch across 8 critical dimensions used by top consulting firms.
              </p>
            </div>
            <div className="bg-card/50 border border-border/50 rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5 text-blue-600" />
              </div>
              <h4 className="font-display font-semibold mb-2">Investor Matching</h4>
              <p className="text-sm text-muted-foreground">
                AI-powered recommendations of investors most likely to be interested in your startup.
              </p>
            </div>
            <div className="bg-card/50 border border-border/50 rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center mb-4">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <h4 className="font-display font-semibold mb-2">Actionable Insights</h4>
              <p className="text-sm text-muted-foreground">
                Specific recommendations to strengthen your pitch and increase your chances of success.
              </p>
            </div>
          </div>
        </div>

        {/* Analysis categories preview */}
        <div className="bg-card/50 border border-border/50 rounded-xl p-6">
          <h3 className="font-display font-semibold mb-4">Analysis Categories</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {feedbackCategories.map((category) => (
              <div 
                key={category.name}
                className="p-4 bg-muted/30 rounded-lg"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                  <span className="text-xs text-muted-foreground">Pending</span>
                </div>
                <p className="text-sm font-medium">{category.name}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
