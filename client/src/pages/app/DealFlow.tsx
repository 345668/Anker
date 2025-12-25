import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Briefcase, 
  Plus, 
  Loader2, 
  Search, 
  DollarSign,
  TrendingUp, 
  CheckCircle, 
  Sparkles, 
  LayoutGrid, 
  List
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { 
  LiquidBackground, 
  GlassSurface, 
  UnderGlow, 
  Pill,
  RainbowButton,
  SecondaryGlassButton,
  AnimatedGrid
} from "@/components/liquid-glass";
import type { Deal, InvestmentFirm } from "@shared/schema";

const dealStages = ["lead", "contacted", "meeting", "due_diligence", "term_sheet", "closing", "closed", "passed"];
const dealStatuses = ["active", "won", "lost"];

const stageLabels: Record<string, string> = {
  "lead": "Lead",
  "contacted": "Contacted",
  "meeting": "Meeting",
  "due_diligence": "Due Diligence",
  "term_sheet": "Term Sheet",
  "closing": "Closing",
  "closed": "Closed",
  "passed": "Passed",
};

const stageColors: Record<string, string> = {
  "lead": "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200",
  "contacted": "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  "meeting": "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  "due_diligence": "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
  "term_sheet": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300",
  "closing": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  "closed": "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  "passed": "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

const statusColors: Record<string, string> = {
  "active": "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  "won": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  "lost": "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
};

export default function DealFlowPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "pipeline">("pipeline");

  const { data: deals = [], isLoading: dealsLoading } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
  });

  const { data: firms = [], isLoading: firmsLoading } = useQuery<InvestmentFirm[]>({
    queryKey: ["/api/investment-firms"],
  });

  const firmsMap = useMemo(
    () => firms.reduce((acc, f) => ({ ...acc, [f.id]: f }), {} as Record<string, InvestmentFirm>),
    [firms]
  );

  const filteredDeals = useMemo(() => {
    return deals.filter(deal => {
      if (stageFilter !== "all" && deal.stage !== stageFilter) return false;
      if (statusFilter !== "all" && deal.status !== statusFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const firmName = firmsMap[deal.firmId || ""]?.name || "";
        if (!deal.title?.toLowerCase().includes(query) &&
            !firmName.toLowerCase().includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [deals, stageFilter, statusFilter, searchQuery, firmsMap]);

  const totalValue = filteredDeals.reduce((sum, deal) => sum + (deal.dealSize || 0), 0);
  const avgProbability = filteredDeals.length > 0 
    ? filteredDeals.reduce((sum, deal) => sum + (deal.probability || 0), 0) / filteredDeals.length 
    : 0;

  const dealsByStage = useMemo(() => {
    const grouped: Record<string, Deal[]> = {};
    dealStages.forEach(stage => {
      grouped[stage] = filteredDeals.filter(d => d.stage === stage);
    });
    return grouped;
  }, [filteredDeals]);

  const isLoading = dealsLoading || firmsLoading;

  if (isLoading) {
    return (
      <div className="relative min-h-[55vh]">
        <LiquidBackground />
        <div className="flex h-[55vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading deal flow...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <LiquidBackground />
      <AnimatedGrid />

      <div className="space-y-6 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <Pill className="mb-3">Deal Management</Pill>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">
              Deal{" "}
              <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                Flow
              </span>
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Track and manage investment deals
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <div className="flex bg-white/55 dark:bg-slate-800/55 rounded-xl p-1 border-2 border-white/60 dark:border-white/20 backdrop-blur-2xl">
              <Button 
                variant={viewMode === "table" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("table")}
                className="rounded-lg"
                data-testid="button-view-table"
              >
                <List className="w-4 h-4 mr-2" />
                Table
              </Button>
              <Button 
                variant={viewMode === "pipeline" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("pipeline")}
                className="rounded-lg"
                data-testid="button-view-pipeline"
              >
                <LayoutGrid className="w-4 h-4 mr-2" />
                Pipeline
              </Button>
            </div>
            <SecondaryGlassButton data-testid="button-ai-sourcing">
              <Sparkles className="w-4 h-4 mr-2" />
              AI Sourcing
            </SecondaryGlassButton>
            <RainbowButton data-testid="button-add-deal">
              <Plus className="w-4 h-4 mr-2" />
              Add Deal
            </RainbowButton>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <UnderGlow className="opacity-20" />
            <GlassSurface className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Total Deals</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{filteredDeals.length}</p>
            </GlassSurface>
          </div>
          <div className="relative">
            <UnderGlow className="opacity-20" />
            <GlassSurface className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Total Value</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                ${(totalValue / 1000000).toFixed(1)}M
              </p>
            </GlassSurface>
          </div>
          <div className="relative">
            <UnderGlow className="opacity-20" />
            <GlassSurface className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Avg Probability</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{avgProbability.toFixed(0)}%</p>
            </GlassSurface>
          </div>
          <div className="relative">
            <UnderGlow className="opacity-20" />
            <GlassSurface className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Active</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {filteredDeals.filter(d => d.status === "active").length}
              </p>
            </GlassSurface>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search deals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl bg-white/50 dark:bg-slate-800/50 border-white/40 dark:border-white/10"
              data-testid="input-search-deals"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-48 rounded-xl bg-white/50 dark:bg-slate-800/50" data-testid="select-stage-filter">
              <SelectValue placeholder="Filter by stage" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">All Stages</SelectItem>
              {dealStages.map(stage => (
                <SelectItem key={stage} value={stage}>{stageLabels[stage] || stage}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48 rounded-xl bg-white/50 dark:bg-slate-800/50" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">All Statuses</SelectItem>
              {dealStatuses.map(status => (
                <SelectItem key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {viewMode === "pipeline" ? (
          <div className="overflow-x-auto">
            <div className="flex gap-4 min-w-max pb-4">
              {dealStages.slice(0, 6).map(stage => (
                <div key={stage} className="w-72 flex-shrink-0">
                  <div className="relative">
                    <UnderGlow className="opacity-15" />
                    <GlassSurface className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{stageLabels[stage] || stage}</h3>
                        <Badge className={stageColors[stage] || "bg-slate-100 text-slate-800"}>
                          {dealsByStage[stage]?.length || 0}
                        </Badge>
                      </div>
                      <div className="space-y-3 min-h-[200px]">
                        {dealsByStage[stage]?.length === 0 ? (
                          <div className="flex items-center justify-center h-32 text-slate-400 dark:text-slate-500 text-sm">
                            No deals
                          </div>
                        ) : (
                          dealsByStage[stage]?.map(deal => (
                            <GlassSurface 
                              key={deal.id} 
                              className="p-3 cursor-pointer"
                              data-testid={`card-deal-${deal.id}`}
                            >
                              <div className="font-medium text-slate-900 dark:text-slate-100 text-sm mb-1">
                                {deal.title}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                {firmsMap[deal.firmId || ""]?.name || "Unknown Firm"}
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                  ${((deal.dealSize || 0) / 1000000).toFixed(1)}M
                                </span>
                                <div className="flex items-center gap-1">
                                  <Progress value={deal.probability || 0} className="w-12 h-1.5" />
                                  <span className="text-xs text-slate-500">{deal.probability || 0}%</span>
                                </div>
                              </div>
                            </GlassSurface>
                          ))
                        )}
                      </div>
                    </GlassSurface>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="relative">
            <UnderGlow className="opacity-20" />
            <GlassSurface className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/20 dark:border-white/10">
                      <th className="text-left p-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Deal</th>
                      <th className="text-left p-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Firm</th>
                      <th className="text-left p-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Stage</th>
                      <th className="text-left p-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Value</th>
                      <th className="text-left p-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Probability</th>
                      <th className="text-left p-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeals.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500 dark:text-slate-400">
                          No deals found
                        </td>
                      </tr>
                    ) : (
                      filteredDeals.map(deal => (
                        <tr 
                          key={deal.id} 
                          className="border-b border-white/10 dark:border-white/5 hover:bg-white/30 dark:hover:bg-slate-700/30 cursor-pointer"
                          data-testid={`row-deal-${deal.id}`}
                        >
                          <td className="p-4 font-medium text-slate-900 dark:text-slate-100">{deal.title}</td>
                          <td className="p-4 text-slate-600 dark:text-slate-400">
                            {firmsMap[deal.firmId || ""]?.name || "Unknown"}
                          </td>
                          <td className="p-4">
                            <Badge className={stageColors[deal.stage || ""] || "bg-slate-100 text-slate-800"}>
                              {stageLabels[deal.stage || ""] || deal.stage}
                            </Badge>
                          </td>
                          <td className="p-4 text-slate-900 dark:text-slate-100">
                            ${((deal.dealSize || 0) / 1000000).toFixed(1)}M
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <Progress value={deal.probability || 0} className="w-16 h-2" />
                              <span className="text-sm text-slate-600 dark:text-slate-400">{deal.probability || 0}%</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <Badge className={statusColors[deal.status || ""] || "bg-slate-100 text-slate-800"}>
                              {(deal.status || "").charAt(0).toUpperCase() + (deal.status || "").slice(1)}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </GlassSurface>
          </div>
        )}
      </div>
    </div>
  );
}
