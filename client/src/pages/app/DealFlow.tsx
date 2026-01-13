import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Zap,
  Filter,
  MoreVertical,
  Edit2,
  Trash2,
  Eye,
  Calendar,
  Building2,
  Clock,
  ArrowRight
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
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
  const [createDealOpen, setCreateDealOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [viewDealOpen, setViewDealOpen] = useState(false);
  const { toast } = useToast();

  const [newDeal, setNewDeal] = useState({
    title: "",
    firmId: "",
    stage: "lead",
    status: "active",
    dealSize: "",
    probability: "50",
    notes: "",
  });

  const { data: deals = [], isLoading: dealsLoading, refetch: refetchDeals } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
  });

  const { data: firmsResponse, isLoading: firmsLoading } = useQuery<{ data: InvestmentFirm[], total: number }>({
    queryKey: ["/api/firms"],
  });
  const firms = firmsResponse?.data ?? [];

  const firmsMap = useMemo(
    () => firms.reduce((acc, f) => ({ ...acc, [f.id]: f }), {} as Record<string, InvestmentFirm>),
    [firms]
  );

  const createDealMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/deals", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      setCreateDealOpen(false);
      setNewDeal({
        title: "",
        firmId: "",
        stage: "lead",
        status: "active",
        dealSize: "",
        probability: "50",
        notes: "",
      });
      toast({ title: "Deal created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create deal", variant: "destructive" });
    },
  });

  const updateDealStageMutation = useMutation({
    mutationFn: async ({ dealId, stage }: { dealId: number; stage: string }) => {
      const response = await apiRequest("PATCH", `/api/deals/${dealId}`, { stage });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      toast({ title: "Deal stage updated" });
    },
    onError: () => {
      toast({ title: "Failed to update deal", variant: "destructive" });
    },
  });

  const deleteDealMutation = useMutation({
    mutationFn: async (dealId: number) => {
      const response = await apiRequest("DELETE", `/api/deals/${dealId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      toast({ title: "Deal deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete deal", variant: "destructive" });
    },
  });

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

  const handleCreateDeal = () => {
    if (!newDeal.title) {
      toast({ title: "Please enter a deal title", variant: "destructive" });
      return;
    }
    createDealMutation.mutate({
      title: newDeal.title,
      firmId: newDeal.firmId || null,
      stage: newDeal.stage,
      status: newDeal.status,
      dealSize: newDeal.dealSize ? parseFloat(newDeal.dealSize) * 1000000 : null,
      probability: parseInt(newDeal.probability),
      notes: newDeal.notes || null,
    });
  };

  const handleMoveStage = (deal: Deal, direction: 'next' | 'prev') => {
    const currentIndex = dealStages.indexOf(deal.stage || 'lead');
    let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= dealStages.length) newIndex = dealStages.length - 1;
    updateDealStageMutation.mutate({ dealId: deal.id, stage: dealStages[newIndex] });
  };

  const handleViewDeal = (deal: Deal) => {
    setSelectedDeal(deal);
    setViewDealOpen(true);
  };

  return (
    <AppLayout 
      title="Deal Flow" 
      subtitle="Track and manage your investment opportunities"
      videoUrl={videoBackgrounds.dealFlow}
    >
      <div className="max-w-7xl mx-auto py-8 px-6 space-y-8">
        {/* Quick Actions Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
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
            
            <Dialog open={createDealOpen} onOpenChange={setCreateDealOpen}>
              <DialogTrigger asChild>
                <Button 
                  className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black font-medium hover:opacity-90"
                  data-testid="button-add-deal"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Deal
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-[rgb(30,30,30)] border-white/10 text-white max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create New Deal</DialogTitle>
                  <DialogDescription className="text-white/60">
                    Add a new investment opportunity to your pipeline
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Deal Title *</Label>
                    <Input 
                      placeholder="Series A - TechCo" 
                      value={newDeal.title}
                      onChange={(e) => setNewDeal({ ...newDeal, title: e.target.value })}
                      className="bg-white/5 border-white/20"
                      data-testid="input-deal-title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Investment Firm</Label>
                    <Select value={newDeal.firmId} onValueChange={(v) => setNewDeal({ ...newDeal, firmId: v })}>
                      <SelectTrigger className="bg-white/5 border-white/20" data-testid="select-firm">
                        <SelectValue placeholder="Select firm..." />
                      </SelectTrigger>
                      <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                        {firms.slice(0, 20).map((firm) => (
                          <SelectItem key={firm.id} value={firm.id} className="text-white">
                            {firm.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Stage</Label>
                      <Select value={newDeal.stage} onValueChange={(v) => setNewDeal({ ...newDeal, stage: v })}>
                        <SelectTrigger className="bg-white/5 border-white/20" data-testid="select-stage">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                          {dealStages.map((stage) => (
                            <SelectItem key={stage} value={stage} className="text-white">
                              {stageLabels[stage]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={newDeal.status} onValueChange={(v) => setNewDeal({ ...newDeal, status: v })}>
                        <SelectTrigger className="bg-white/5 border-white/20" data-testid="select-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                          {dealStatuses.map((status) => (
                            <SelectItem key={status} value={status} className="text-white">
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Deal Size (in millions)</Label>
                      <Input 
                        type="number"
                        placeholder="5.0" 
                        value={newDeal.dealSize}
                        onChange={(e) => setNewDeal({ ...newDeal, dealSize: e.target.value })}
                        className="bg-white/5 border-white/20"
                        data-testid="input-deal-size"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Probability (%)</Label>
                      <Input 
                        type="number"
                        placeholder="50" 
                        min="0"
                        max="100"
                        value={newDeal.probability}
                        onChange={(e) => setNewDeal({ ...newDeal, probability: e.target.value })}
                        className="bg-white/5 border-white/20"
                        data-testid="input-probability"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea 
                      placeholder="Additional notes about this deal..." 
                      value={newDeal.notes}
                      onChange={(e) => setNewDeal({ ...newDeal, notes: e.target.value })}
                      className="bg-white/5 border-white/20 min-h-[80px]"
                      data-testid="input-notes"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDealOpen(false)} className="border-white/20">
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateDeal}
                    disabled={createDealMutation.isPending}
                    className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black"
                    data-testid="button-submit-deal"
                  >
                    {createDealMutation.isPending ? "Creating..." : "Create Deal"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
              transition={{ delay: 0.1 + idx * 0.05 }}
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
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
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
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-[rgb(142,132,247)] blur-xl opacity-50 animate-pulse" />
                <Loader2 className="h-8 w-8 animate-spin text-[rgb(142,132,247)] relative" />
              </div>
              <span className="text-white/60 text-sm font-light tracking-wide">Loading deals...</span>
            </div>
          </div>
        ) : (
          <>
            {/* Pipeline View */}
            {viewMode === "pipeline" ? (
              <div className="overflow-x-auto pb-4">
                <div className="flex gap-4 min-w-max">
                  {dealStages.slice(0, 6).map((stage, stageIdx) => {
                    const stageStyle = stageColors[stage] || stageColors.lead;
                    return (
                      <motion.div 
                        key={stage} 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + stageIdx * 0.05 }}
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
                                  transition={{ delay: 0.2 + dealIdx * 0.02 }}
                                  className="group p-4 rounded-xl bg-white/5 border border-white/10 hover:border-[rgb(142,132,247)]/50 hover:bg-white/10 transition-all cursor-pointer"
                                  data-testid={`card-deal-${deal.id}`}
                                  onClick={() => handleViewDeal(deal)}
                                >
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="font-medium text-white text-sm group-hover:text-[rgb(142,132,247)] transition-colors flex-1">
                                      {deal.title}
                                    </div>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-white/30 hover:text-white">
                                          <MoreVertical className="w-4 h-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent className="bg-[rgb(28,28,28)] border-white/10">
                                        <DropdownMenuItem 
                                          onClick={(e) => { e.stopPropagation(); handleViewDeal(deal); }}
                                          className="text-white hover:bg-white/10"
                                        >
                                          <Eye className="w-4 h-4 mr-2" />
                                          View Details
                                        </DropdownMenuItem>
                                        <DropdownMenuItem 
                                          onClick={(e) => { e.stopPropagation(); handleMoveStage(deal, 'next'); }}
                                          className="text-white hover:bg-white/10"
                                        >
                                          <ArrowRight className="w-4 h-4 mr-2" />
                                          Move to Next Stage
                                        </DropdownMenuItem>
                                        <DropdownMenuItem 
                                          onClick={(e) => { e.stopPropagation(); deleteDealMutation.mutate(deal.id); }}
                                          className="text-red-400 hover:bg-red-500/10"
                                        >
                                          <Trash2 className="w-4 h-4 mr-2" />
                                          Delete Deal
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                  <div className="text-xs text-white/50 mb-3">
                                    {firmsMap[deal.firmId || ""]?.name || "No firm assigned"}
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
              </div>
            ) : (
              /* Table View */
              <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm overflow-hidden">
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
                        <th className="text-left p-4 text-sm font-medium text-white/60 tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDeals.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-12 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <Briefcase className="w-12 h-12 text-white/20" />
                              <span className="text-white/40">No deals found</span>
                              <Button 
                                onClick={() => setCreateDealOpen(true)}
                                className="mt-2 bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black"
                              >
                                <Plus className="w-4 h-4 mr-2" />
                                Create Your First Deal
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredDeals.map((deal, idx) => {
                          const stageStyle = stageColors[deal.stage || "lead"] || stageColors.lead;
                          const statusStyle = statusColors[deal.status || "active"] || statusColors.active;
                          return (
                            <tr 
                              key={deal.id}
                              className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors group"
                              data-testid={`row-deal-${deal.id}`}
                              onClick={() => handleViewDeal(deal)}
                            >
                              <td className="p-4">
                                <span className="font-medium text-white group-hover:text-[rgb(142,132,247)] transition-colors">
                                  {deal.title}
                                </span>
                              </td>
                              <td className="p-4 text-white/60">
                                {firmsMap[deal.firmId || ""]?.name || "—"}
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
                              <td className="p-4">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white/50 hover:text-white">
                                      <MoreVertical className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent className="bg-[rgb(28,28,28)] border-white/10">
                                    <DropdownMenuItem 
                                      onClick={(e) => { e.stopPropagation(); handleViewDeal(deal); }}
                                      className="text-white hover:bg-white/10"
                                    >
                                      <Eye className="w-4 h-4 mr-2" />
                                      View Details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={(e) => { e.stopPropagation(); handleMoveStage(deal, 'next'); }}
                                      className="text-white hover:bg-white/10"
                                    >
                                      <ArrowRight className="w-4 h-4 mr-2" />
                                      Move to Next Stage
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={(e) => { e.stopPropagation(); deleteDealMutation.mutate(deal.id); }}
                                      className="text-red-400 hover:bg-red-500/10"
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete Deal
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* View Deal Dialog */}
        <Dialog open={viewDealOpen} onOpenChange={setViewDealOpen}>
          <DialogContent className="bg-[rgb(30,30,30)] border-white/10 text-white max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl">{selectedDeal?.title}</DialogTitle>
              <DialogDescription className="text-white/60">
                Deal details and progress
              </DialogDescription>
            </DialogHeader>
            {selectedDeal && (
              <div className="space-y-6 py-4">
                {/* Deal Info Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2 text-white/50 text-sm mb-2">
                      <Building2 className="w-4 h-4" />
                      Firm
                    </div>
                    <p className="text-white font-medium">
                      {firmsMap[selectedDeal.firmId || ""]?.name || "Not assigned"}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2 text-white/50 text-sm mb-2">
                      <DollarSign className="w-4 h-4" />
                      Deal Size
                    </div>
                    <p className="text-[rgb(251,194,213)] font-medium text-lg">
                      ${((selectedDeal.dealSize || 0) / 1000000).toFixed(1)}M
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2 text-white/50 text-sm mb-2">
                      <Target className="w-4 h-4" />
                      Probability
                    </div>
                    <p className="text-[rgb(142,132,247)] font-medium text-lg">
                      {selectedDeal.probability || 0}%
                    </p>
                  </div>
                </div>

                {/* Stage Progress */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center gap-2 text-white/50 text-sm mb-4">
                    <TrendingUp className="w-4 h-4" />
                    Deal Progress
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {dealStages.slice(0, 7).map((stage, idx) => {
                      const isActive = selectedDeal.stage === stage;
                      const isPassed = dealStages.indexOf(selectedDeal.stage || 'lead') > idx;
                      return (
                        <div key={stage} className="flex items-center">
                          <button
                            onClick={() => updateDealStageMutation.mutate({ dealId: selectedDeal.id, stage })}
                            className={`px-3 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                              isActive
                                ? 'bg-[rgb(142,132,247)] text-white'
                                : isPassed
                                ? 'bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)]'
                                : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                            }`}
                          >
                            {stageLabels[stage]}
                          </button>
                          {idx < 6 && (
                            <ArrowRight className="w-4 h-4 text-white/20 mx-1 flex-shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Notes */}
                {selectedDeal.notes && (
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2 text-white/50 text-sm mb-2">
                      <Edit2 className="w-4 h-4" />
                      Notes
                    </div>
                    <p className="text-white/80">{selectedDeal.notes}</p>
                  </div>
                )}

                {/* Status & Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2 text-white/50 text-sm mb-2">
                      <CheckCircle className="w-4 h-4" />
                      Status
                    </div>
                    <Badge className={`${statusColors[selectedDeal.status || 'active']?.bg} ${statusColors[selectedDeal.status || 'active']?.text}`}>
                      {(selectedDeal.status || 'active').charAt(0).toUpperCase() + (selectedDeal.status || 'active').slice(1)}
                    </Badge>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-2 text-white/50 text-sm mb-2">
                      <Calendar className="w-4 h-4" />
                      Created
                    </div>
                    <p className="text-white/80">
                      {selectedDeal.createdAt ? new Date(selectedDeal.createdAt).toLocaleDateString() : 'Unknown'}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewDealOpen(false)} className="border-white/20">
                Close
              </Button>
              <Button 
                onClick={() => selectedDeal && deleteDealMutation.mutate(selectedDeal.id)}
                variant="destructive"
                className="bg-red-500/20 text-red-400 hover:bg-red-500/30"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Deal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
    </AppLayout>
  );
}
