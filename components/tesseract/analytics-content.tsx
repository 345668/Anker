"use client"

import type { User } from "@supabase/supabase-js"
import { 
  BarChart3,
  TrendingUp,
  Users,
  Building2,
  Target,
  DollarSign,
  CheckCircle2,
  XCircle,
  Percent,
} from "lucide-react"

interface DealAnalytics {
  total: number
  byStage: Record<string, number>
  totalValue: number
  avgDealSize: number
  closedWon: number
  closedLost: number
}

interface FirmAnalytics {
  total: number
  byType: Record<string, number>
}

interface AnalyticsContentProps {
  user: User
  analytics: {
    deals: DealAnalytics
    firms: FirmAnalytics
    contacts: { total: number }
  }
}

function formatAmount(amount: number): string {
  if (amount >= 1000000000) return `$${(amount / 1000000000).toFixed(1)}B`
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`
  return `$${amount.toFixed(0)}`
}

const STAGE_LABELS: Record<string, string> = {
  'prospect': 'Prospect',
  'contacted': 'Contacted',
  'meeting': 'Meeting',
  'due_diligence': 'Due Diligence',
  'term_sheet': 'Term Sheet',
  'closed_won': 'Won',
  'won': 'Won',
  'closed_lost': 'Lost',
  'lost': 'Lost',
}

const STAGE_COLORS: Record<string, string> = {
  'prospect': 'bg-slate-400',
  'contacted': 'bg-blue-500',
  'meeting': 'bg-purple-500',
  'due_diligence': 'bg-amber-500',
  'term_sheet': 'bg-orange-500',
  'closed_won': 'bg-green-500',
  'won': 'bg-green-500',
  'closed_lost': 'bg-red-500',
  'lost': 'bg-red-500',
}

export function AnalyticsContent({ user, analytics }: AnalyticsContentProps) {
  const { deals, firms, contacts } = analytics
  
  // Calculate win rate
  const totalClosed = deals.closedWon + deals.closedLost
  const winRate = totalClosed > 0 ? Math.round((deals.closedWon / totalClosed) * 100) : 0

  // Get top stages by count
  const stageData = Object.entries(deals.byStage)
    .map(([stage, count]) => ({
      stage,
      label: STAGE_LABELS[stage] || stage,
      count,
      color: STAGE_COLORS[stage] || 'bg-gray-400'
    }))
    .sort((a, b) => b.count - a.count)

  const maxStageCount = Math.max(...stageData.map(s => s.count), 1)

  // Get firm types
  const firmTypeData = Object.entries(firms.byType)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const maxFirmCount = Math.max(...firmTypeData.map(f => f.count), 1)

  const keyMetrics = [
    {
      label: "Total Deals",
      value: deals.total.toString(),
      icon: Target,
      subtext: `${formatAmount(deals.totalValue)} total value`
    },
    {
      label: "Investment Firms",
      value: firms.total.toString(),
      icon: Building2,
      subtext: `${Object.keys(firms.byType).length} types`
    },
    {
      label: "Win Rate",
      value: `${winRate}%`,
      icon: Percent,
      subtext: `${deals.closedWon} won, ${deals.closedLost} lost`
    },
    {
      label: "Avg Deal Size",
      value: formatAmount(deals.avgDealSize),
      icon: DollarSign,
      subtext: "Per deal"
    },
  ]

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-foreground/10">
        <div className="px-8 py-4">
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-2">
            <span className="w-8 h-px bg-foreground/30" />
            Analytics
          </span>
          <h1 className="font-display text-2xl tracking-tight">Pipeline Analytics</h1>
        </div>
      </header>

      {/* Main content */}
      <div className="px-8 py-8 space-y-8">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-foreground/10">
          {keyMetrics.map((metric, index) => (
            <div key={index} className="bg-background p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 flex items-center justify-center bg-foreground/5">
                  <metric.icon className="w-5 h-5 text-muted-foreground" />
                </div>
              </div>
              <p className="font-display text-3xl tracking-tight mb-1">{metric.value}</p>
              <p className="text-sm text-muted-foreground font-mono">{metric.label}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{metric.subtext}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Deals by Stage */}
          <div className="border border-foreground/10">
            <div className="px-6 py-4 border-b border-foreground/10 flex items-center justify-between">
              <h2 className="font-display text-lg">Deals by Stage</h2>
              <span className="text-xs font-mono text-muted-foreground">{deals.total} total</span>
            </div>
            <div className="p-6 space-y-4">
              {stageData.length > 0 ? (
                stageData.map((stage, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                        <span className="text-sm">{stage.label}</span>
                      </div>
                      <span className="font-mono text-sm">{stage.count}</span>
                    </div>
                    <div className="h-2 bg-foreground/5 overflow-hidden">
                      <div 
                        className={`h-full ${stage.color} transition-all`}
                        style={{ width: `${(stage.count / maxStageCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No deal data yet</p>
                </div>
              )}
            </div>
          </div>

          {/* Firms by Type */}
          <div className="border border-foreground/10">
            <div className="px-6 py-4 border-b border-foreground/10 flex items-center justify-between">
              <h2 className="font-display text-lg">Firms by Type</h2>
              <span className="text-xs font-mono text-muted-foreground">{firms.total} total</span>
            </div>
            <div className="p-6 space-y-4">
              {firmTypeData.length > 0 ? (
                firmTypeData.map((firm, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm capitalize">{firm.type.replace(/_/g, ' ')}</span>
                      <span className="font-mono text-sm">{firm.count}</span>
                    </div>
                    <div className="h-2 bg-foreground/5 overflow-hidden">
                      <div 
                        className="h-full bg-foreground/40 transition-all"
                        style={{ width: `${(firm.count / maxFirmCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No firm data yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-foreground/10">
          <div className="bg-background p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-display text-2xl">{deals.closedWon}</p>
                <p className="text-xs text-muted-foreground font-mono">Deals Won</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {deals.closedWon > 0 
                ? `${formatAmount(deals.totalValue * (deals.closedWon / deals.total))} estimated closed value`
                : 'No won deals yet'
              }
            </p>
          </div>

          <div className="bg-background p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500/10 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-display text-2xl">{deals.closedLost}</p>
                <p className="text-xs text-muted-foreground font-mono">Deals Lost</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {deals.closedLost > 0 
                ? `${Math.round((deals.closedLost / (totalClosed || 1)) * 100)}% loss rate`
                : 'No lost deals yet'
              }
            </p>
          </div>

          <div className="bg-background p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-foreground/5 flex items-center justify-center">
                <Users className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-display text-2xl">{contacts.total}</p>
                <p className="text-xs text-muted-foreground font-mono">Contacts</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              In your network
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
