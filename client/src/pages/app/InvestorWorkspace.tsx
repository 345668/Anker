import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { 
  TrendingUp, Briefcase, Search as SearchIcon, Users, Plus, Edit, Trash2,
  MoreVertical, Globe, MapPin, DollarSign, FileText, 
  Sparkles, Loader2, Eye, ExternalLink, Target, Building2,
  ChevronRight, ArrowRight, Clock, CheckCircle, XCircle,
  Rocket, BarChart3, Zap, Filter, PieChart, LineChart, Wallet
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AppLayout from "@/components/AppLayout";
import type { Deal, Startup, Contact } from "@shared/schema";

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

const stageColors: Record<string, { bg: string; text: string }> = {
  "lead": { bg: "bg-white/10", text: "text-white/80" },
  "contacted": { bg: "bg-[rgb(142,132,247)]/20", text: "text-[rgb(142,132,247)]" },
  "meeting": { bg: "bg-amber-500/20", text: "text-amber-300" },
  "due_diligence": { bg: "bg-purple-500/20", text: "text-purple-300" },
  "term_sheet": { bg: "bg-[rgb(251,194,213)]/20", text: "text-[rgb(251,194,213)]" },
  "closing": { bg: "bg-emerald-500/20", text: "text-emerald-300" },
  "closed": { bg: "bg-green-500/20", text: "text-green-300" },
  "passed": { bg: "bg-red-500/20", text: "text-red-300" },
};

export default function InvestorWorkspace() {
  const { user, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-white/50" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(196,227,230)] flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-light text-white">Deal Flow</h1>
                <p className="text-white/50">Manage your investment pipeline and discover opportunities</p>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl flex-wrap">
                <TabsTrigger 
                  value="overview" 
                  className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60 rounded-lg px-4"
                  data-testid="tab-overview"
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Overview
                </TabsTrigger>
                <TabsTrigger 
                  value="pipeline" 
                  className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60 rounded-lg px-4"
                  data-testid="tab-pipeline"
                >
                  <Briefcase className="w-4 h-4 mr-2" />
                  Pipeline
                </TabsTrigger>
                <TabsTrigger 
                  value="sourcing" 
                  className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60 rounded-lg px-4"
                  data-testid="tab-sourcing"
                >
                  <SearchIcon className="w-4 h-4 mr-2" />
                  Sourcing
                </TabsTrigger>
                <TabsTrigger 
                  value="network" 
                  className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60 rounded-lg px-4"
                  data-testid="tab-network"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Network
                </TabsTrigger>
                <TabsTrigger 
                  value="portfolio" 
                  className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60 rounded-lg px-4"
                  data-testid="tab-portfolio"
                >
                  <PieChart className="w-4 h-4 mr-2" />
                  Portfolio
                </TabsTrigger>
                <TabsTrigger 
                  value="lp-reporting" 
                  className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60 rounded-lg px-4"
                  data-testid="tab-lp-reporting"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  LP Reports
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-6">
                <OverviewTab />
              </TabsContent>

              <TabsContent value="pipeline" className="mt-6">
                <PipelineTab />
              </TabsContent>

              <TabsContent value="sourcing" className="mt-6">
                <SourcingTab />
              </TabsContent>

              <TabsContent value="network" className="mt-6">
                <NetworkTab />
              </TabsContent>

              <TabsContent value="portfolio" className="mt-6">
                <PortfolioTab />
              </TabsContent>

              <TabsContent value="lp-reporting" className="mt-6">
                <LPReportingTab />
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}

function StatCard({ icon: Icon, label, value, color, delay = 0 }: { 
  icon: any; label: string; value: string; color: string; delay?: number 
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay }}
      className="p-6 rounded-2xl border border-white/10 bg-white/5"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
          <Icon className="w-6 h-6" style={{ color }} />
        </div>
        <div>
          <p className="text-2xl font-light text-white">{value}</p>
          <p className="text-sm text-white/50">{label}</p>
        </div>
      </div>
    </motion.div>
  );
}

function OverviewTab() {
  const { data: deals = [], isLoading: dealsLoading } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const dealsByStage = useMemo(() => {
    const counts: Record<string, number> = {};
    dealStages.forEach(stage => counts[stage] = 0);
    deals.forEach(deal => {
      if (deal.stage && counts[deal.stage] !== undefined) {
        counts[deal.stage]++;
      }
    });
    return counts;
  }, [deals]);

  const totalValue = useMemo(() => {
    return deals.reduce((sum, deal) => sum + (deal.dealSize || 0), 0);
  }, [deals]);

  const activeDeals = useMemo(() => {
    return deals.filter(d => d.status === "active").length;
  }, [deals]);

  const wonDeals = useMemo(() => {
    return deals.filter(d => d.status === "won").length;
  }, [deals]);

  if (dealsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          icon={Briefcase} 
          label="Total Deals" 
          value={deals.length.toString()} 
          color="rgb(142, 132, 247)" 
          delay={0}
        />
        <StatCard 
          icon={Zap} 
          label="Active Deals" 
          value={activeDeals.toString()} 
          color="rgb(254, 212, 92)" 
          delay={0.1}
        />
        <StatCard 
          icon={CheckCircle} 
          label="Won Deals" 
          value={wonDeals.toString()} 
          color="rgb(196, 227, 230)" 
          delay={0.2}
        />
        <StatCard 
          icon={DollarSign} 
          label="Total Value" 
          value={`$${(totalValue / 1000000).toFixed(1)}M`} 
          color="rgb(251, 194, 213)" 
          delay={0.3}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          className="p-6 rounded-2xl border border-white/10 bg-white/5"
        >
          <h3 className="text-lg font-light text-white mb-6">Deal Pipeline</h3>
          <div className="space-y-4">
            {dealStages.slice(0, 6).map((stage, index) => {
              const count = dealsByStage[stage] || 0;
              const maxCount = Math.max(...Object.values(dealsByStage), 1);
              return (
                <div key={stage} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70">{stageLabels[stage]}</span>
                    <span className="text-sm font-medium text-white">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(count / maxCount) * 100}%` }}
                      transition={{ duration: 0.6, delay: 0.5 + index * 0.1 }}
                      className={`h-full rounded-full ${stageColors[stage]?.bg?.replace('/20', '')}`}
                      style={{ backgroundColor: stageColors[stage]?.text.includes('rgb') ? stageColors[stage].text.replace('text-', '').replace('[', '').replace(']', '') : undefined }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="p-6 rounded-2xl border border-white/10 bg-white/5"
        >
          <h3 className="text-lg font-light text-white mb-6">Recent Deals</h3>
          <div className="space-y-3">
            {deals.slice(0, 5).map((deal) => (
              <div key={deal.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-[rgb(142,132,247)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{deal.title}</p>
                    <p className="text-xs text-white/50">{stageLabels[deal.stage || 'lead']}</p>
                  </div>
                </div>
                {deal.dealSize && (
                  <span className="text-sm text-white/60">${(deal.dealSize / 1000000).toFixed(1)}M</span>
                )}
              </div>
            ))}
            {deals.length === 0 && (
              <div className="text-center py-8">
                <Briefcase className="w-8 h-8 text-white/20 mx-auto mb-2" />
                <p className="text-sm text-white/40">No deals yet</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        className="p-6 rounded-2xl border border-white/10 bg-white/5"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-light text-white">Network Summary</h3>
          <Badge variant="secondary" className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] border-0">
            {contacts.length} Contacts
          </Badge>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="p-4 rounded-xl bg-white/5 text-center">
            <p className="text-2xl font-light text-white">{contacts.filter(c => c.type === 'founder').length}</p>
            <p className="text-sm text-white/50">Founders</p>
          </div>
          <div className="p-4 rounded-xl bg-white/5 text-center">
            <p className="text-2xl font-light text-[rgb(196,227,230)]">{contacts.filter(c => c.type === 'investor').length}</p>
            <p className="text-sm text-white/50">Co-Investors</p>
          </div>
          <div className="p-4 rounded-xl bg-white/5 text-center">
            <p className="text-2xl font-light text-white/50">{contacts.filter(c => c.type !== 'founder' && c.type !== 'investor').length}</p>
            <p className="text-sm text-white/50">Other</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function PipelineTab() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [createDealOpen, setCreateDealOpen] = useState(false);
  const [editDealOpen, setEditDealOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [newDeal, setNewDeal] = useState({
    title: "",
    stage: "lead",
    status: "active",
    dealSize: "",
    notes: "",
  });
  const [editFormData, setEditFormData] = useState({
    title: "",
    stage: "lead",
    status: "active",
    dealSize: "",
    notes: "",
    probability: "",
  });

  const { data: deals = [], isLoading } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
  });

  const createDealMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/deals", {
        title: newDeal.title,
        stage: newDeal.stage,
        status: newDeal.status,
        dealSize: newDeal.dealSize ? parseInt(newDeal.dealSize) : null,
        notes: newDeal.notes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      setCreateDealOpen(false);
      setNewDeal({ title: "", stage: "lead", status: "active", dealSize: "", notes: "" });
      toast({ title: "Deal created", description: "New deal added to your pipeline." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create deal", variant: "destructive" });
    },
  });

  const updateDealMutation = useMutation({
    mutationFn: async ({ dealId, stage }: { dealId: string; stage: string }) => {
      return apiRequest("PATCH", `/api/deals/${dealId}`, { stage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      toast({ title: "Deal updated" });
    },
  });

  const editDealMutation = useMutation({
    mutationFn: async ({ dealId, data }: { dealId: string; data: typeof editFormData }) => {
      return apiRequest("PATCH", `/api/deals/${dealId}`, {
        title: data.title,
        stage: data.stage,
        status: data.status,
        dealSize: data.dealSize ? parseInt(data.dealSize) : null,
        notes: data.notes || null,
        probability: data.probability ? parseInt(data.probability) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      setEditDealOpen(false);
      setEditingDeal(null);
      toast({ title: "Deal updated", description: "Deal details have been updated." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update deal", variant: "destructive" });
    },
  });

  const deleteDealMutation = useMutation({
    mutationFn: async (dealId: string) => {
      return apiRequest("DELETE", `/api/deals/${dealId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      toast({ title: "Deal deleted" });
    },
  });

  const openEditModal = (deal: Deal) => {
    setEditingDeal(deal);
    setEditFormData({
      title: deal.title || "",
      stage: deal.stage || "lead",
      status: deal.status || "active",
      dealSize: deal.dealSize?.toString() || "",
      notes: deal.notes || "",
      probability: deal.probability?.toString() || "",
    });
    setEditDealOpen(true);
  };

  const filteredDeals = useMemo(() => {
    let result = deals;
    if (stageFilter !== "all") {
      result = result.filter(d => d.stage === stageFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d => d.title?.toLowerCase().includes(q));
    }
    return result;
  }, [deals, stageFilter, searchQuery]);

  const dealsByStage = useMemo(() => {
    const grouped: Record<string, Deal[]> = {};
    dealStages.forEach(stage => grouped[stage] = []);
    filteredDeals.forEach(deal => {
      if (deal.stage && grouped[deal.stage]) {
        grouped[deal.stage].push(deal);
      }
    });
    return grouped;
  }, [filteredDeals]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search deals..."
              className="pl-10 bg-white/5 border-white/10 text-white w-[200px]"
              data-testid="input-search-deals"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[150px] bg-white/5 border-white/10 text-white" data-testid="select-stage-filter">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
              <SelectItem value="all" className="text-white">All Stages</SelectItem>
              {dealStages.map((stage) => (
                <SelectItem key={stage} value={stage} className="text-white">{stageLabels[stage]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Dialog open={createDealOpen} onOpenChange={setCreateDealOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80" data-testid="button-create-deal">
              <Plus className="w-4 h-4 mr-2" />
              New Deal
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[rgb(25,25,25)] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle>Create New Deal</DialogTitle>
              <DialogDescription className="text-white/50">
                Add a new investment opportunity to your pipeline
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Deal Title</Label>
                <Input
                  value={newDeal.title}
                  onChange={(e) => setNewDeal({ ...newDeal, title: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="Company Name - Series A"
                  data-testid="input-deal-title"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Stage</Label>
                  <Select value={newDeal.stage} onValueChange={(v) => setNewDeal({ ...newDeal, stage: v })}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
                      {dealStages.map((stage) => (
                        <SelectItem key={stage} value={stage} className="text-white">{stageLabels[stage]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Deal Size ($)</Label>
                  <Input
                    type="number"
                    value={newDeal.dealSize}
                    onChange={(e) => setNewDeal({ ...newDeal, dealSize: e.target.value })}
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="1000000"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={newDeal.notes}
                  onChange={(e) => setNewDeal({ ...newDeal, notes: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="Investment thesis, key metrics..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDealOpen(false)} className="border-white/10 text-white">
                Cancel
              </Button>
              <Button 
                onClick={() => createDealMutation.mutate()}
                disabled={!newDeal.title.trim() || createDealMutation.isPending}
                className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
                data-testid="button-submit-deal"
              >
                {createDealMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Deal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editDealOpen} onOpenChange={(open) => { setEditDealOpen(open); if (!open) setEditingDeal(null); }}>
          <DialogContent className="bg-[rgb(25,25,25)] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle>Edit Deal</DialogTitle>
              <DialogDescription className="text-white/50">
                Update deal details
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Deal Title</Label>
                <Input
                  value={editFormData.title}
                  onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="Company Name - Series A"
                  data-testid="input-edit-deal-title"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Stage</Label>
                  <Select value={editFormData.stage} onValueChange={(v) => setEditFormData({ ...editFormData, stage: v })}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
                      {dealStages.map((stage) => (
                        <SelectItem key={stage} value={stage} className="text-white">{stageLabels[stage]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={editFormData.status} onValueChange={(v) => setEditFormData({ ...editFormData, status: v })}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
                      {dealStatuses.map((status) => (
                        <SelectItem key={status} value={status} className="text-white capitalize">{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Deal Size ($)</Label>
                  <Input
                    type="number"
                    value={editFormData.dealSize}
                    onChange={(e) => setEditFormData({ ...editFormData, dealSize: e.target.value })}
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="1000000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Probability (%)</Label>
                  <Input
                    type="number"
                    value={editFormData.probability}
                    onChange={(e) => setEditFormData({ ...editFormData, probability: e.target.value })}
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="50"
                    min="0"
                    max="100"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="Investment thesis, key metrics..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditDealOpen(false); setEditingDeal(null); }} className="border-white/10 text-white">
                Cancel
              </Button>
              <Button 
                onClick={() => editingDeal && editDealMutation.mutate({ dealId: editingDeal.id, data: editFormData })}
                disabled={!editFormData.title.trim() || editDealMutation.isPending}
                className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
                data-testid="button-update-deal"
              >
                {editDealMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Update Deal
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {dealStages.slice(0, 6).map((stage) => (
          <div 
            key={stage}
            className="p-4 rounded-2xl border border-white/10 bg-white/5 min-h-[300px]"
          >
            <div className="flex items-center justify-between mb-4">
              <Badge className={`${stageColors[stage]?.bg} ${stageColors[stage]?.text} border-0`}>
                {stageLabels[stage]}
              </Badge>
              <span className="text-xs text-white/40">{dealsByStage[stage]?.length || 0}</span>
            </div>
            <div className="space-y-3">
              <AnimatePresence>
                {dealsByStage[stage]?.map((deal) => (
                  <motion.div
                    key={deal.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors group"
                    data-testid={`deal-card-${deal.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-white line-clamp-2">{deal.title}</p>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="w-3 h-3 text-white/50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-[rgb(30,30,30)] border-white/10">
                          <DropdownMenuItem
                            onClick={() => openEditModal(deal)}
                            className="text-white/70 hover:text-white cursor-pointer"
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Deal
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-white/10" />
                          {dealStages.filter(s => s !== stage).map((s) => (
                            <DropdownMenuItem
                              key={s}
                              onClick={() => updateDealMutation.mutate({ dealId: deal.id, stage: s })}
                              className="text-white/70 hover:text-white cursor-pointer"
                            >
                              <ArrowRight className="w-4 h-4 mr-2" />
                              Move to {stageLabels[s]}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator className="bg-white/10" />
                          <DropdownMenuItem
                            onClick={() => deleteDealMutation.mutate(deal.id)}
                            className="text-red-400 hover:text-red-300 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {deal.dealSize && (
                      <p className="text-xs text-white/40 mt-1">${(deal.dealSize / 1000000).toFixed(1)}M</p>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {dealsByStage[stage]?.length === 0 && (
                <p className="text-xs text-white/30 text-center py-4">No deals</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourcingTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  const { data: startupsResponse, isLoading } = useQuery<{ data: Startup[], total: number }>({
    queryKey: ["/api/startups", { search: searchQuery, page: currentPage, limit: pageSize }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      params.set("offset", String((currentPage - 1) * pageSize));
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim());
      }
      const res = await fetch(`/api/startups?${params}`);
      if (!res.ok) throw new Error("Failed to fetch startups");
      return res.json();
    },
  });

  const startups = startupsResponse?.data || [];
  const totalPages = Math.ceil((startupsResponse?.total || 0) / pageSize);

  const filteredStartups = useMemo(() => {
    if (stageFilter === "all") return startups;
    return startups.filter(s => s.stage === stageFilter);
  }, [startups, stageFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-medium text-white">Discover Startups</h2>
          <p className="text-white/50 text-sm">Find investment opportunities on the platform</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Search startups..."
              className="pl-10 bg-white/5 border-white/10 text-white w-[250px]"
              data-testid="input-search-startups"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[150px] bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
              <SelectItem value="all" className="text-white">All Stages</SelectItem>
              <SelectItem value="Pre-seed" className="text-white">Pre-seed</SelectItem>
              <SelectItem value="Seed" className="text-white">Seed</SelectItem>
              <SelectItem value="Series A" className="text-white">Series A</SelectItem>
              <SelectItem value="Series B" className="text-white">Series B</SelectItem>
              <SelectItem value="Series C+" className="text-white">Series C+</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredStartups.length === 0 ? (
        <div className="text-center py-20">
          <Rocket className="w-12 h-12 text-white/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Startups Found</h3>
          <p className="text-white/50">Try adjusting your search or filters</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredStartups.map((startup, index) => (
              <motion.div
                key={startup.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
                data-testid={`startup-card-${startup.id}`}
              >
                <Link href={`/app/startups/${startup.id}`}>
                  <div className="flex items-start justify-between mb-4">
                    <Avatar className="h-12 w-12 border border-white/20">
                      <AvatarFallback className="bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white">
                        {startup.name?.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <ChevronRight className="w-5 h-5 text-white/30 group-hover:text-white/60 transition-colors" />
                  </div>
                  <h3 className="font-medium text-white mb-1">{startup.name}</h3>
                  {startup.tagline && (
                    <p className="text-sm text-white/50 line-clamp-2 mb-3">{startup.tagline}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {startup.stage && (
                      <Badge variant="secondary" className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] border-0 text-xs">
                        {startup.stage}
                      </Badge>
                    )}
                    {startup.location && (
                      <Badge variant="secondary" className="bg-white/10 text-white/60 border-0 text-xs">
                        <MapPin className="w-3 h-3 mr-1" />
                        {startup.location}
                      </Badge>
                    )}
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="border-white/10 text-white"
              >
                Previous
              </Button>
              <span className="text-sm text-white/50 px-4">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="border-white/10 text-white"
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NetworkTab() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const filteredContacts = useMemo(() => {
    let result = contacts;
    if (typeFilter !== "all") {
      result = result.filter(c => c.type === typeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.firstName?.toLowerCase().includes(q) ||
        c.lastName?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [contacts, typeFilter, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-medium text-white">Your Network</h2>
          <p className="text-white/50 text-sm">Founders, co-investors, and other contacts</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts..."
              className="pl-10 bg-white/5 border-white/10 text-white w-[200px]"
              data-testid="input-search-contacts"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px] bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
              <SelectItem value="all" className="text-white">All Types</SelectItem>
              <SelectItem value="founder" className="text-white">Founders</SelectItem>
              <SelectItem value="investor" className="text-white">Investors</SelectItem>
              <SelectItem value="advisor" className="text-white">Advisors</SelectItem>
              <SelectItem value="other" className="text-white">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredContacts.length === 0 ? (
        <div className="text-center py-20">
          <Users className="w-12 h-12 text-white/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Contacts Found</h3>
          <p className="text-white/50">Build your network by adding founders and co-investors</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredContacts.map((contact, index) => {
            const initials = `${contact.firstName?.[0] || ''}${contact.lastName?.[0] || ''}`.toUpperCase();
            return (
              <motion.div
                key={contact.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                data-testid={`contact-card-${contact.id}`}
              >
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12 border border-white/20">
                    <AvatarImage src={contact.avatar || ''} />
                    <AvatarFallback className="bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(196,227,230)] text-white">
                      {initials || '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-white truncate">
                      {contact.firstName} {contact.lastName}
                    </h3>
                    {contact.title && (
                      <p className="text-sm text-white/50 truncate">{contact.title}</p>
                    )}
                    {contact.company && (
                      <p className="text-sm text-white/40 truncate">{contact.company}</p>
                    )}
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                  <Badge 
                    variant="secondary" 
                    className={`text-xs ${
                      contact.type === 'founder' ? 'bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)]' :
                      contact.type === 'investor' ? 'bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)]' :
                      'bg-white/10 text-white/60'
                    }`}
                  >
                    {contact.type}
                  </Badge>
                  {contact.email && (
                    <a 
                      href={`mailto:${contact.email}`}
                      className="text-white/40 hover:text-[rgb(142,132,247)] transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PortfolioTab() {
  const { data: deals = [], isLoading } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
  });

  const portfolioDeals = useMemo(() => {
    return deals.filter(d => d.status === 'won' || d.stage === 'closed');
  }, [deals]);

  const totalInvested = useMemo(() => {
    return portfolioDeals.reduce((sum, d) => sum + (d.dealSize || 0), 0);
  }, [portfolioDeals]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-medium text-white">Portfolio Companies</h2>
          <p className="text-white/50 text-sm">Track your investments and portfolio performance</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-2xl border border-white/10 bg-white/5"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[rgb(142,132,247)]/20 flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-[rgb(142,132,247)]" />
            </div>
            <div>
              <p className="text-2xl font-light text-white">{portfolioDeals.length}</p>
              <p className="text-sm text-white/50">Portfolio Companies</p>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-6 rounded-2xl border border-white/10 bg-white/5"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[rgb(254,212,92)]/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-[rgb(254,212,92)]" />
            </div>
            <div>
              <p className="text-2xl font-light text-white">
                ${(totalInvested / 1000000).toFixed(1)}M
              </p>
              <p className="text-sm text-white/50">Total Invested</p>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-6 rounded-2xl border border-white/10 bg-white/5"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-light text-white">--</p>
              <p className="text-sm text-white/50">Overall IRR</p>
            </div>
          </div>
        </motion.div>
      </div>

      {portfolioDeals.length === 0 ? (
        <div className="text-center py-20">
          <PieChart className="w-12 h-12 text-white/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Portfolio Companies Yet</h3>
          <p className="text-white/50">Closed deals will appear here as portfolio companies</p>
        </div>
      ) : (
        <div className="space-y-4">
          {portfolioDeals.map((deal, index) => (
            <motion.div
              key={deal.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
              data-testid={`portfolio-deal-${deal.id}`}
            >
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(196,227,230)] flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{deal.title}</h3>
                    <p className="text-sm text-white/50">
                      Invested: ${((deal.dealSize || 0) / 1000).toFixed(0)}K
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge className="bg-emerald-500/20 text-emerald-300">
                    Active
                  </Badge>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function LPReportingTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-medium text-white">LP Reporting</h2>
          <p className="text-white/50 text-sm">Generate and manage reports for your Limited Partners</p>
        </div>
        <Button 
          className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
          data-testid="button-generate-report"
        >
          <FileText className="w-4 h-4 mr-2" />
          Generate Report
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-2xl border border-white/10 bg-white/5"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-[rgb(142,132,247)]/20 flex items-center justify-center">
              <LineChart className="w-6 h-6 text-[rgb(142,132,247)]" />
            </div>
            <div>
              <h3 className="font-medium text-white">Quarterly Report</h3>
              <p className="text-sm text-white/50">Fund performance summary</p>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-white/60">
              <span>Last Generated:</span>
              <span className="text-white">Not yet generated</span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>Reporting Period:</span>
              <span className="text-white">Q1 2026</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-6 rounded-2xl border border-white/10 bg-white/5"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-[rgb(254,212,92)]/20 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-[rgb(254,212,92)]" />
            </div>
            <div>
              <h3 className="font-medium text-white">Capital Calls</h3>
              <p className="text-sm text-white/50">Track capital contributions</p>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-white/60">
              <span>Total Called:</span>
              <span className="text-white">$0</span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>Remaining Commitment:</span>
              <span className="text-white">$0</span>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="p-8 rounded-2xl border border-white/10 bg-white/5 text-center"
      >
        <FileText className="w-12 h-12 text-white/30 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">No Reports Generated</h3>
        <p className="text-white/50 mb-6">Create your first LP report to share fund performance with your investors</p>
        <Button 
          className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create First Report
        </Button>
      </motion.div>
    </div>
  );
}
