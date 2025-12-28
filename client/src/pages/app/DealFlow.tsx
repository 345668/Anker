import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
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
  List,
  ArrowUpRight,
  Target,
  Zap
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
import Video from '@/framer/video';
import Primary from '@/framer/primary';
import Secondary from '@/framer/secondary';
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

const stageColors: Record<string, { bg: string; text: string; glow: string }> = {
  "lead": { bg: "bg-white/10", text: "text-white/80", glow: "shadow-white/10" },
  "contacted": { bg: "bg-[rgb(142,132,247)]/20", text: "text-[rgb(142,132,247)]", glow: "shadow-[rgb(142,132,247)]/20" },
  "meeting": { bg: "bg-amber-500/20", text: "text-amber-300", glow: "shadow-amber-500/20" },
  "due_diligence": { bg: "bg-purple-500/20", text: "text-purple-300", glow: "shadow-purple-500/20" },
  "term_sheet": { bg: "bg-[rgb(251,194,213)]/20", text: "text-[rgb(251,194,213)]", glow: "shadow-[rgb(251,194,213)]/20" },
  "closing": { bg: "bg-emerald-500/20", text: "text-emerald-300", glow: "shadow-emerald-500/20" },
  "closed": { bg: "bg-green-500/20", text: "text-green-300", glow: "shadow-green-500/20" },
  "passed": { bg: "bg-red-500/20", text: "text-red-300", glow: "shadow-red-500/20" },
};

const statusColors: Record<string, { bg: string; text: string }> = {
  "active": { bg: "bg-[rgb(142,132,247)]/20", text: "text-[rgb(142,132,247)]" },
  "won": { bg: "bg-emerald-500/20", text: "text-emerald-300" },
  "lost": { bg: "bg-red-500/20", text: "text-red-300" },
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
      <div className="relative min-h-screen bg-[rgb(18,18,18)]">
        <div className="absolute inset-0 w-full h-full opacity-30">
          <Video 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[rgb(18,18,18)] via-transparent to-[rgb(18,18,18)]" />
        </div>
        <div className="flex h-screen items-center justify-center relative z-10">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-[rgb(142,132,247)] blur-xl opacity-50 animate-pulse" />
              <Loader2 className="h-8 w-8 animate-spin text-[rgb(142,132,247)] relative" />
            </div>
            <span className="text-white/60 text-sm font-light tracking-wide">Loading deal flow...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[rgb(18,18,18)]">
      {/* Video Background */}
      <div className="fixed inset-0 w-full h-full opacity-20 pointer-events-none">
        <Video 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[rgb(18,18,18)] via-[rgb(18,18,18)]/80 to-[rgb(18,18,18)]" />
      </div>

      {/* Content */}
      <div className="relative z-10 p-6 lg:p-8 space-y-8">
        {/* Header Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6"
        >
          <div>
            <motion.span 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-block px-4 py-1.5 rounded-full text-xs font-medium tracking-[0.2em] uppercase border border-white/20 text-white/60 bg-white/5 mb-4"
            >
              INVESTMENT PIPELINE
            </motion.span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-light text-white mb-3">
              Deal{" "}
              <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>Flow</span>
            </h1>
            <p className="text-white/50 text-lg font-light max-w-md">
              Track and manage your investment opportunities in one place.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* View Toggle */}
            <div className="flex bg-white/5 rounded-full p-1 border border-white/10 backdrop-blur-sm">
              <button 
                onClick={() => setViewMode("pipeline")}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-light transition-all ${
                  viewMode === "pipeline" 
                    ? "bg-[rgb(142,132,247)] text-white" 
                    : "text-white/60 hover:text-white"
                }`}
                data-testid="button-view-pipeline"
              >
                <LayoutGrid className="w-4 h-4" />
                Pipeline
              </button>
              <button 
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-light transition-all ${
                  viewMode === "table" 
                    ? "bg-[rgb(142,132,247)] text-white" 
                    : "text-white/60 hover:text-white"
                }`}
                data-testid="button-view-table"
              >
                <List className="w-4 h-4" />
                Table
              </button>
            </div>
            
            <Secondary 
              text="AI Sourcing" 
              link="#"
              style={{ width: 'auto' }}
              data-testid="button-ai-sourcing"
            />
            <Primary 
              text="Add Deal" 
              link="#"
              style={{ width: 'auto' }}
              data-testid="button-add-deal"
            />
          </div>
        </motion.div>

        {/* Stats Cards */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {[
            { icon: Briefcase, label: "Total Deals", value: filteredDeals.length.toString(), color: "rgb(142,132,247)" },
            { icon: DollarSign, label: "Total Value", value: `$${(totalValue / 1000000).toFixed(1)}M`, color: "rgb(251,194,213)" },
            { icon: Target, label: "Avg Probability", value: `${avgProbability.toFixed(0)}%`, color: "rgb(196,227,230)" },
            { icon: Zap, label: "Active Deals", value: filteredDeals.filter(d => d.status === "active").length.toString(), color: "rgb(254,212,92)" },
          ].map((stat, idx) => (
            <motion.div 
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + idx * 0.05 }}
              className="relative group"
            >
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: `radial-gradient(circle at 50% 100%, ${stat.color}20, transparent 70%)` }} />
              <div className="relative p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:border-white/20 transition-all">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: `${stat.color}20` }}>
                    <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
                  </div>
                  <span className="text-white/50 text-sm font-light">{stat.label}</span>
                </div>
                <p className="text-3xl font-light text-white">{stat.value}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Filters */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex flex-col md:flex-row gap-4"
        >
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              placeholder="Search deals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 h-12 rounded-full bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-[rgb(142,132,247)] focus:ring-[rgb(142,132,247)]/20"
              data-testid="input-search-deals"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-48 h-12 rounded-full bg-white/5 border-white/10 text-white" data-testid="select-stage-filter">
              <SelectValue placeholder="Filter by stage" />
            </SelectTrigger>
            <SelectContent className="rounded-xl bg-[rgb(28,28,28)] border-white/10">
              <SelectItem value="all" className="text-white hover:bg-white/10">All Stages</SelectItem>
              {dealStages.map(stage => (
                <SelectItem key={stage} value={stage} className="text-white hover:bg-white/10">{stageLabels[stage] || stage}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48 h-12 rounded-full bg-white/5 border-white/10 text-white" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl bg-[rgb(28,28,28)] border-white/10">
              <SelectItem value="all" className="text-white hover:bg-white/10">All Statuses</SelectItem>
              {dealStatuses.map(status => (
                <SelectItem key={status} value={status} className="text-white hover:bg-white/10">{status.charAt(0).toUpperCase() + status.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </motion.div>

        {/* Pipeline View */}
        {viewMode === "pipeline" ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="overflow-x-auto pb-4"
          >
            <div className="flex gap-4 min-w-max">
              {dealStages.slice(0, 6).map((stage, stageIdx) => {
                const stageStyle = stageColors[stage] || stageColors.lead;
                return (
                  <motion.div 
                    key={stage} 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + stageIdx * 0.05 }}
                    className="w-80 flex-shrink-0"
                  >
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
                      {/* Stage Header */}
                      <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10">
                        <h3 className="font-medium text-white text-sm tracking-wide">{stageLabels[stage] || stage}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${stageStyle.bg} ${stageStyle.text}`}>
                          {dealsByStage[stage]?.length || 0}
                        </span>
                      </div>
                      
                      {/* Deal Cards */}
                      <div className="space-y-3 min-h-[300px] max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                        {dealsByStage[stage]?.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-48 text-white/30 text-sm">
                            <Briefcase className="w-8 h-8 mb-2 opacity-50" />
                            <span>No deals in this stage</span>
                          </div>
                        ) : (
                          dealsByStage[stage]?.map((deal, dealIdx) => (
                            <motion.div
                              key={deal.id}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.4 + dealIdx * 0.02 }}
                              className="group p-4 rounded-xl bg-white/5 border border-white/10 hover:border-[rgb(142,132,247)]/50 hover:bg-white/10 transition-all cursor-pointer"
                              data-testid={`card-deal-${deal.id}`}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div className="font-medium text-white text-sm group-hover:text-[rgb(142,132,247)] transition-colors">
                                  {deal.title}
                                </div>
                                <ArrowUpRight className="w-4 h-4 text-white/30 group-hover:text-[rgb(142,132,247)] transition-colors" />
                              </div>
                              <div className="text-xs text-white/50 mb-3">
                                {firmsMap[deal.firmId || ""]?.name || "Unknown Firm"}
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-[rgb(251,194,213)]">
                                  ${((deal.dealSize || 0) / 1000000).toFixed(1)}M
                                </span>
                                <div className="flex items-center gap-2">
                                  <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                    <div 
                                      className="h-full rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)]" 
                                      style={{ width: `${deal.probability || 0}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-white/50">{deal.probability || 0}%</span>
                                </div>
                              </div>
                            </motion.div>
                          ))
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          /* Table View */
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left p-4 text-sm font-medium text-white/60 tracking-wide">Deal</th>
                    <th className="text-left p-4 text-sm font-medium text-white/60 tracking-wide">Firm</th>
                    <th className="text-left p-4 text-sm font-medium text-white/60 tracking-wide">Stage</th>
                    <th className="text-left p-4 text-sm font-medium text-white/60 tracking-wide">Value</th>
                    <th className="text-left p-4 text-sm font-medium text-white/60 tracking-wide">Probability</th>
                    <th className="text-left p-4 text-sm font-medium text-white/60 tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeals.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <Briefcase className="w-12 h-12 text-white/20" />
                          <span className="text-white/40">No deals found</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredDeals.map((deal, idx) => {
                      const stageStyle = stageColors[deal.stage || "lead"] || stageColors.lead;
                      const statusStyle = statusColors[deal.status || "active"] || statusColors.active;
                      return (
                        <motion.tr 
                          key={deal.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3 + idx * 0.02 }}
                          className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group"
                          data-testid={`row-deal-${deal.id}`}
                        >
                          <td className="p-4">
                            <span className="font-medium text-white group-hover:text-[rgb(142,132,247)] transition-colors">
                              {deal.title}
                            </span>
                          </td>
                          <td className="p-4 text-white/60">
                            {firmsMap[deal.firmId || ""]?.name || "Unknown"}
                          </td>
                          <td className="p-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${stageStyle.bg} ${stageStyle.text}`}>
                              {stageLabels[deal.stage || ""] || deal.stage}
                            </span>
                          </td>
                          <td className="p-4 text-[rgb(251,194,213)] font-medium">
                            ${((deal.dealSize || 0) / 1000000).toFixed(1)}M
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                <div 
                                  className="h-full rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)]" 
                                  style={{ width: `${deal.probability || 0}%` }}
                                />
                              </div>
                              <span className="text-sm text-white/50">{deal.probability || 0}%</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                              {(deal.status || "").charAt(0).toUpperCase() + (deal.status || "").slice(1)}
                            </span>
                          </td>
                        </motion.tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>

      {/* Custom scrollbar styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.05);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(142,132,247,0.3);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(142,132,247,0.5);
        }
      `}</style>
    </div>
  );
}
