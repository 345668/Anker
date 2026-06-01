"use client"

import type { User } from "@supabase/supabase-js"
import { 
  Target, 
  Plus,
  ArrowRight,
  Building2,
  MoreHorizontal,
  GripVertical,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface PipelineContentProps {
  user: User
}

const pipelineStages = [
  { 
    id: "prospecting", 
    name: "Prospecting", 
    color: "bg-gray-100 border-gray-200",
    deals: [
      { id: 1, investor: "Accel Partners", amount: "$3M", daysInStage: 5 },
      { id: 2, investor: "General Catalyst", amount: "$2.5M", daysInStage: 3 },
    ]
  },
  { 
    id: "initial-contact", 
    name: "Initial Contact", 
    color: "bg-blue-50 border-blue-200",
    deals: [
      { id: 3, investor: "First Round Capital", amount: "$1.5M", daysInStage: 7 },
    ]
  },
  { 
    id: "pitch", 
    name: "Pitch", 
    color: "bg-amber-50 border-amber-200",
    deals: [
      { id: 4, investor: "Sequoia Capital", amount: "$2M", daysInStage: 12 },
    ]
  },
  { 
    id: "due-diligence", 
    name: "Due Diligence", 
    color: "bg-purple-50 border-purple-200",
    deals: []
  },
  { 
    id: "term-sheet", 
    name: "Term Sheet", 
    color: "bg-green-50 border-green-200",
    deals: [
      { id: 5, investor: "Y Combinator", amount: "$500K", daysInStage: 4 },
    ]
  },
]

export function PipelineContent({ user }: PipelineContentProps) {
  const totalDeals = pipelineStages.reduce((acc, stage) => acc + stage.deals.length, 0)
  const totalValue = pipelineStages.reduce((acc, stage) => {
    return acc + stage.deals.reduce((sum, deal) => {
      const amount = parseFloat(deal.amount.replace(/[$M]/g, ""))
      return sum + amount
    }, 0)
  }, 0)

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-primary" />
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Pipeline</span>
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Investor Pipeline
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-6 mr-4">
              <div className="text-right">
                <p className="font-display text-lg font-semibold">{totalDeals}</p>
                <p className="text-xs text-muted-foreground">Total Deals</p>
              </div>
              <div className="text-right">
                <p className="font-display text-lg font-semibold">${totalValue.toFixed(1)}M</p>
                <p className="text-xs text-muted-foreground">Pipeline Value</p>
              </div>
            </div>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Deal
            </Button>
          </div>
        </div>
      </header>

      {/* Pipeline board */}
      <div className="px-8 py-8">
        <div className="flex gap-4 overflow-x-auto pb-4">
          {pipelineStages.map((stage) => (
            <div 
              key={stage.id}
              className="flex-shrink-0 w-72"
            >
              {/* Stage header */}
              <div className={`rounded-t-xl border ${stage.color} px-4 py-3`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm">{stage.name}</h3>
                    <span className="w-5 h-5 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-mono">
                      {stage.deals.length}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* Stage deals */}
              <div className="bg-muted/30 border border-t-0 border-border/50 rounded-b-xl p-3 min-h-[400px] space-y-3">
                {stage.deals.map((deal) => (
                  <div 
                    key={deal.id}
                    className="bg-background border border-border/50 rounded-lg p-4 cursor-grab hover:shadow-sm transition-shadow group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">{deal.investor}</h4>
                          <p className="text-xs text-muted-foreground">{deal.daysInStage} days in stage</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-medium">{deal.amount}</span>
                      <GripVertical className="w-4 h-4 text-muted-foreground/50" />
                    </div>
                  </div>
                ))}

                {stage.deals.length === 0 && (
                  <div className="h-32 flex items-center justify-center border-2 border-dashed border-border/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Drop deals here</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
