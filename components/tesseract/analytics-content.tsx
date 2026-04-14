"use client"

import type { User } from "@supabase/supabase-js"
import { 
  LineChart, 
  BarChart3,
  TrendingUp,
  TrendingDown,
  Eye,
  MousePointer,
  Clock,
  Users,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface AnalyticsContentProps {
  user: User
}

const metrics = [
  {
    label: "Pitch Deck Views",
    value: "47",
    change: "+12%",
    trend: "up",
    icon: Eye,
  },
  {
    label: "Avg. View Time",
    value: "3:24",
    change: "+8%",
    trend: "up",
    icon: Clock,
  },
  {
    label: "Investor Visits",
    value: "23",
    change: "-5%",
    trend: "down",
    icon: Users,
  },
  {
    label: "Engagement Rate",
    value: "68%",
    change: "+15%",
    trend: "up",
    icon: MousePointer,
  },
]

const topInvestors = [
  { name: "Sequoia Capital", views: 12, lastViewed: "2 hours ago" },
  { name: "Andreessen Horowitz", views: 8, lastViewed: "1 day ago" },
  { name: "Y Combinator", views: 6, lastViewed: "3 days ago" },
  { name: "First Round Capital", views: 4, lastViewed: "5 days ago" },
]

const slideEngagement = [
  { slide: "Problem Statement", views: 47, avgTime: "0:42" },
  { slide: "Solution Overview", views: 45, avgTime: "0:58" },
  { slide: "Market Size", views: 44, avgTime: "0:35" },
  { slide: "Business Model", views: 42, avgTime: "1:12" },
  { slide: "Traction", views: 40, avgTime: "0:55" },
  { slide: "Team", views: 38, avgTime: "0:48" },
  { slide: "Financials", views: 35, avgTime: "1:24" },
  { slide: "Ask", views: 32, avgTime: "0:38" },
]

export function AnalyticsContent({ user }: AnalyticsContentProps) {
  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <LineChart className="w-4 h-4 text-primary" />
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Insights</span>
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Analytics
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm">Last 7 days</Button>
            <Button variant="outline" size="sm">Export</Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="px-8 py-8 space-y-8">
        {/* Key metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((metric, index) => (
            <div 
              key={index}
              className="bg-card/50 border border-border/50 rounded-xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <metric.icon className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className={`flex items-center gap-1 text-sm font-medium ${
                  metric.trend === "up" ? "text-green-600" : "text-red-600"
                }`}>
                  {metric.trend === "up" ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4" />
                  )}
                  {metric.change}
                </div>
              </div>
              <p className="font-display text-3xl font-semibold mb-1">{metric.value}</p>
              <p className="text-sm text-muted-foreground">{metric.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Top investors */}
          <div className="bg-card/50 border border-border/50 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border/50">
              <h2 className="font-display font-semibold">Top Investors by Views</h2>
            </div>
            <div className="divide-y divide-border/50">
              {topInvestors.map((investor, index) => (
                <div 
                  key={index}
                  className="px-6 py-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-mono">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-medium">{investor.name}</p>
                      <p className="text-xs text-muted-foreground">{investor.lastViewed}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-medium">{investor.views}</p>
                    <p className="text-xs text-muted-foreground">views</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Slide engagement */}
          <div className="bg-card/50 border border-border/50 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border/50">
              <h2 className="font-display font-semibold">Slide Engagement</h2>
            </div>
            <div className="divide-y divide-border/50">
              {slideEngagement.map((slide, index) => (
                <div 
                  key={index}
                  className="px-6 py-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground font-mono w-4">{index + 1}</span>
                    <p className="text-sm">{slide.slide}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm font-mono">{slide.views}</p>
                      <p className="text-xs text-muted-foreground">views</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono">{slide.avgTime}</p>
                      <p className="text-xs text-muted-foreground">avg. time</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chart placeholder */}
        <div className="bg-card/50 border border-border/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display font-semibold">Views Over Time</h2>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm">Views</Button>
              <Button variant="ghost" size="sm">Visitors</Button>
              <Button variant="ghost" size="sm">Engagement</Button>
            </div>
          </div>
          <div className="h-64 flex items-center justify-center border-2 border-dashed border-border rounded-xl">
            <div className="text-center">
              <BarChart3 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Analytics chart will appear here once you have more data
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
