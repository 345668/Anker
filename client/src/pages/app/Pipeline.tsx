import { useState, KeyboardEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { 
  Plus, Search, MoreVertical, Trash2, Edit, X, 
  DollarSign, Grip, Briefcase, TrendingUp, Target, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import type { Deal, Startup, Investor } from "@shared/schema";

const dealStages = [
  { value: "lead", label: "Lead", color: "bg-white/20", textColor: "text-white/70" },
  { value: "contacted", label: "Contacted", color: "bg-[rgb(142,132,247)]/30", textColor: "text-[rgb(142,132,247)]" },
  { value: "meeting", label: "Meeting", color: "bg-[rgb(142,132,247)]/50", textColor: "text-[rgb(142,132,247)]" },
  { value: "due_diligence", label: "Due Diligence", color: "bg-[rgb(254,212,92)]/30", textColor: "text-[rgb(254,212,92)]" },
  { value: "term_sheet", label: "Term Sheet", color: "bg-[rgb(254,212,92)]/50", textColor: "text-[rgb(254,212,92)]" },
  { value: "closing", label: "Closing", color: "bg-[rgb(196,227,230)]/50", textColor: "text-[rgb(196,227,230)]" },
  { value: "closed", label: "Closed Won", color: "bg-[rgb(196,227,230)]", textColor: "text-black" },
  { value: "passed", label: "Passed", color: "bg-[rgb(251,194,213)]/40", textColor: "text-[rgb(251,194,213)]" },
];

const priorities = ["low", "medium", "high"];
const sources = ["referral", "inbound", "outbound", "event", "cold_outreach", "other"];

const emptyFormData = {
  title: "",
  description: "",
  stage: "lead",
  priority: "medium",
  dealSize: "",
  probability: "",
  source: "",
  notes: "",
  tags: [] as string[],
};

export default function Pipeline() {
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [formData, setFormData] = useState(emptyFormData);
  const [tagInput, setTagInput] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const { toast } = useToast();

  const { data: deals = [], isLoading } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
  });

  const { data: startups = [] } = useQuery<Startup[]>({
    queryKey: ["/api/startups/mine"],
  });

  const { data: investors = [] } = useQuery<Investor[]>({
    queryKey: ["/api/investors"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest("POST", "/api/deals", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      closeDialog();
      toast({ title: "Deal created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create deal", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      return apiRequest("PATCH", `/api/deals/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      closeDialog();
      toast({ title: "Deal updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update deal", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/deals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      toast({ title: "Deal deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete deal", description: error.message, variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingDeal(null);
    setFormData(emptyFormData);
    setTagInput("");
  };

  const openCreateDialog = () => {
    setEditingDeal(null);
    setFormData(emptyFormData);
    setIsDialogOpen(true);
  };

  const openEditDialog = (deal: Deal) => {
    setEditingDeal(deal);
    setFormData({
      title: deal.title || "",
      description: deal.description || "",
      stage: deal.stage || "lead",
      priority: deal.priority || "medium",
      dealSize: deal.dealSize?.toString() || "",
      probability: deal.probability?.toString() || "",
      source: deal.source || "",
      notes: deal.notes || "",
      tags: Array.isArray(deal.tags) ? deal.tags : [],
    });
    setIsDialogOpen(true);
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const tag = tagInput.trim();
      if (tag && !formData.tags.includes(tag)) {
        setFormData({ ...formData, tags: [...formData.tags, tag] });
      }
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData({ ...formData, tags: formData.tags.filter((t) => t !== tagToRemove) });
  };

  const filteredDeals = deals.filter((deal) => {
    const matchesSearch =
      !searchQuery ||
      deal.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      deal.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStage = stageFilter === "all" || deal.stage === stageFilter;

    return matchesSearch && matchesStage;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      return;
    }
    
    const submitData: Record<string, unknown> = {
      title: formData.title.trim(),
      stage: formData.stage,
      priority: formData.priority,
      tags: formData.tags,
    };
    
    const optionalFields = ["description", "source", "notes"] as const;
    
    for (const field of optionalFields) {
      const value = formData[field].trim();
      if (editingDeal) {
        const originalValue = editingDeal[field] || "";
        if (value !== originalValue) {
          submitData[field] = value || null;
        }
      } else {
        if (value) {
          submitData[field] = value;
        }
      }
    }
    
    if (formData.dealSize) {
      submitData.dealSize = parseInt(formData.dealSize);
    } else if (editingDeal?.dealSize) {
      submitData.dealSize = null;
    }
    
    if (formData.probability) {
      submitData.probability = parseInt(formData.probability);
    } else if (editingDeal?.probability) {
      submitData.probability = null;
    }
    
    if (editingDeal) {
      const originalTags = Array.isArray(editingDeal.tags) ? editingDeal.tags : [];
      const tagsChanged = JSON.stringify([...formData.tags].sort()) !== JSON.stringify([...originalTags].sort());
      if (!tagsChanged) {
        delete submitData.tags;
      }
      updateMutation.mutate({ id: editingDeal.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const getDealsForStage = (stage: string) => 
    filteredDeals.filter((deal) => deal.stage === stage);

  const formatDealSize = (size: number | null | undefined) => {
    if (!size) return null;
    if (size >= 1000000) return `$${(size / 1000000).toFixed(1)}M`;
    if (size >= 1000) return `$${(size / 1000).toFixed(0)}K`;
    return `$${size}`;
  };

  const totalValue = filteredDeals.reduce((sum, d) => sum + (d.dealSize || 0), 0);
  const avgProbability = filteredDeals.length > 0 
    ? Math.round(filteredDeals.reduce((sum, d) => sum + (d.probability || 0), 0) / filteredDeals.length)
    : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout
      title="Deal Pipeline"
      subtitle="Track and manage your investment deals"
      heroHeight="35vh"
      videoUrl={videoBackgrounds.pipeline}
    >
      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {[
              { icon: Briefcase, label: "Total Deals", value: filteredDeals.length, color: "rgb(142,132,247)" },
              { icon: DollarSign, label: "Total Value", value: `$${(totalValue / 1000000).toFixed(1)}M`, color: "rgb(251,194,213)" },
              { icon: Target, label: "Avg Probability", value: `${avgProbability}%`, color: "rgb(196,227,230)" },
              { icon: Zap, label: "Active", value: filteredDeals.filter(d => d.stage !== "closed" && d.stage !== "passed").length, color: "rgb(254,212,92)" },
            ].map((stat, idx) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="p-6 rounded-2xl border border-white/10 bg-white/5"
              >
                <div className="flex items-center gap-4">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${stat.color}20` }}
                  >
                    <stat.icon className="w-6 h-6" style={{ color: stat.color }} />
                  </div>
                  <div>
                    <p className="text-2xl font-light text-white">{stat.value}</p>
                    <p className="text-sm text-white/50">{stat.label}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Controls */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col md:flex-row gap-4 mb-8"
          >
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <Input
                placeholder="Search deals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                data-testid="input-search-deals"
              />
            </div>
            
            {viewMode === "list" && (
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="w-[180px] h-12 bg-white/5 border-white/10 text-white rounded-xl" data-testid="select-stage-filter">
                  <SelectValue placeholder="All Stages" />
                </SelectTrigger>
                <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                  <SelectItem value="all">All Stages</SelectItem>
                  {dealStages.map((stage) => (
                    <SelectItem key={stage.value} value={stage.value}>
                      {stage.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="flex bg-white/5 rounded-full p-1 border border-white/10">
              <button 
                onClick={() => setViewMode("kanban")}
                className={`px-5 py-2 rounded-full text-sm font-light transition-all ${
                  viewMode === "kanban" 
                    ? "bg-[rgb(142,132,247)] text-white" 
                    : "text-white/60 hover:text-white"
                }`}
                data-testid="button-view-kanban"
              >
                Board
              </button>
              <button 
                onClick={() => setViewMode("list")}
                className={`px-5 py-2 rounded-full text-sm font-light transition-all ${
                  viewMode === "list" 
                    ? "bg-[rgb(142,132,247)] text-white" 
                    : "text-white/60 hover:text-white"
                }`}
                data-testid="button-view-list"
              >
                List
              </button>
            </div>

            <button
              onClick={openCreateDialog}
              className="h-12 px-6 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
              data-testid="button-add-deal"
            >
              <Plus className="w-5 h-5" />
              Add Deal
            </button>
          </motion.div>

          {/* Kanban View */}
          {viewMode === "kanban" ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="overflow-x-auto pb-4"
            >
              <div className="flex gap-4 min-w-max">
                {dealStages.map((stage, stageIdx) => {
                  const stageDeals = getDealsForStage(stage.value);
                  return (
                    <motion.div
                      key={stage.value}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + stageIdx * 0.05 }}
                      className="w-80 flex-shrink-0"
                    >
                      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                            <h3 className="font-medium text-white text-sm">{stage.label}</h3>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${stage.color} ${stage.textColor}`}>
                            {stageDeals.length}
                          </span>
                        </div>
                        <div className="p-3 space-y-3 min-h-[300px] max-h-[500px] overflow-y-auto">
                          {stageDeals.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-white/30 text-sm">
                              <Briefcase className="w-8 h-8 mb-2 opacity-50" />
                              <span>No deals</span>
                            </div>
                          ) : (
                            stageDeals.map((deal, dealIdx) => (
                              <motion.div
                                key={deal.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.4 + dealIdx * 0.02 }}
                                className="group p-4 rounded-xl bg-white/5 border border-white/10 hover:border-[rgb(142,132,247)]/50 hover:bg-white/10 transition-all cursor-pointer"
                                onClick={() => openEditDialog(deal)}
                                data-testid={`card-deal-${deal.id}`}
                              >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <h4 className="font-medium text-sm text-white group-hover:text-[rgb(142,132,247)] transition-colors line-clamp-2">
                                    {deal.title}
                                  </h4>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                      <button className="p-1 rounded hover:bg-white/10">
                                        <MoreVertical className="w-4 h-4 text-white/40" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="bg-[rgb(28,28,28)] border-white/10">
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openEditDialog(deal);
                                        }}
                                        className="text-white hover:bg-white/10"
                                        data-testid={`button-edit-deal-${deal.id}`}
                                      >
                                        <Edit className="w-4 h-4 mr-2" />
                                        Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="text-red-400 hover:bg-red-500/10"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteMutation.mutate(deal.id);
                                        }}
                                        data-testid={`button-delete-deal-${deal.id}`}
                                      >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                                
                                {deal.dealSize && (
                                  <div className="flex items-center gap-1 text-xs text-[rgb(251,194,213)] mb-2">
                                    <DollarSign className="w-3 h-3" />
                                    {formatDealSize(deal.dealSize)}
                                  </div>
                                )}
                                
                                <div className="flex flex-wrap gap-1">
                                  <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${
                                    deal.priority === "high"
                                      ? "bg-[rgb(251,194,213)]/20 text-[rgb(251,194,213)]"
                                      : deal.priority === "low"
                                      ? "bg-white/10 text-white/50"
                                      : "bg-white/10 text-white/70"
                                  }`}>
                                    {deal.priority}
                                  </span>
                                  {Array.isArray(deal.tags) && deal.tags.slice(0, 2).map((tag) => (
                                    <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)]">
                                      {tag}
                                    </span>
                                  ))}
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
            /* List View */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              {filteredDeals.length === 0 ? (
                <div className="text-center py-24 rounded-2xl border border-white/10 bg-white/5">
                  <div 
                    className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-6"
                    style={{ backgroundColor: 'rgba(142, 132, 247, 0.2)' }}
                  >
                    <Briefcase className="w-10 h-10 text-[rgb(142,132,247)]" />
                  </div>
                  <h3 className="text-2xl font-light text-white mb-2">No deals found</h3>
                  <p className="text-white/50 font-light mb-8 max-w-md mx-auto">
                    {deals.length === 0
                      ? "Start tracking your investment pipeline by adding deals."
                      : "Try adjusting your search or filters."}
                  </p>
                  {deals.length === 0 && (
                    <button
                      onClick={openCreateDialog}
                      className="h-12 px-8 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium inline-flex items-center gap-2"
                      data-testid="button-add-first-deal"
                    >
                      <Plus className="w-5 h-5" />
                      Add Your First Deal
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left p-4 text-sm font-medium text-white/60">Deal</th>
                          <th className="text-left p-4 text-sm font-medium text-white/60">Stage</th>
                          <th className="text-left p-4 text-sm font-medium text-white/60">Value</th>
                          <th className="text-left p-4 text-sm font-medium text-white/60">Priority</th>
                          <th className="text-left p-4 text-sm font-medium text-white/60">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDeals.map((deal, idx) => {
                          const stageInfo = dealStages.find((s) => s.value === deal.stage);
                          return (
                            <motion.tr
                              key={deal.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.3 + idx * 0.02 }}
                              className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                              onClick={() => openEditDialog(deal)}
                              data-testid={`row-deal-${deal.id}`}
                            >
                              <td className="p-4">
                                <span className="font-medium text-white">{deal.title}</span>
                              </td>
                              <td className="p-4">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${stageInfo?.color} ${stageInfo?.textColor}`}>
                                  {stageInfo?.label || deal.stage}
                                </span>
                              </td>
                              <td className="p-4 text-[rgb(251,194,213)]">
                                {formatDealSize(deal.dealSize) || "-"}
                              </td>
                              <td className="p-4">
                                <span className={`px-2 py-1 rounded-full text-xs capitalize ${
                                  deal.priority === "high"
                                    ? "bg-[rgb(251,194,213)]/20 text-[rgb(251,194,213)]"
                                    : "bg-white/10 text-white/60"
                                }`}>
                                  {deal.priority}
                                </span>
                              </td>
                              <td className="p-4">
                                <div className="flex gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openEditDialog(deal);
                                    }}
                                    className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
                                    data-testid={`button-edit-deal-${deal.id}`}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteMutation.mutate(deal.id);
                                    }}
                                    className="p-2 rounded-lg hover:bg-red-500/10 text-white/60 hover:text-red-400"
                                    data-testid={`button-delete-deal-${deal.id}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-[rgb(28,28,28)] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">{editingDeal ? "Edit Deal" : "Add New Deal"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-white/70">Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder="e.g., Series A - Acme Corp"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                data-testid="input-deal-title"
              />
            </div>

            <div>
              <Label className="text-white/70">Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                data-testid="input-deal-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-white/70">Stage</Label>
                <Select value={formData.stage} onValueChange={(v) => setFormData({ ...formData, stage: v })}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-deal-stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                    {dealStages.map((stage) => (
                      <SelectItem key={stage.value} value={stage.value} className="text-white">
                        {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-white/70">Priority</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-deal-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                    {priorities.map((p) => (
                      <SelectItem key={p} value={p} className="text-white">
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-white/70">Deal Size ($)</Label>
                <Input
                  type="number"
                  value={formData.dealSize}
                  onChange={(e) => setFormData({ ...formData, dealSize: e.target.value })}
                  placeholder="e.g., 500000"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  data-testid="input-deal-size"
                />
              </div>

              <div>
                <Label className="text-white/70">Probability (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.probability}
                  onChange={(e) => setFormData({ ...formData, probability: e.target.value })}
                  placeholder="0-100"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  data-testid="input-deal-probability"
                />
              </div>
            </div>

            <div>
              <Label className="text-white/70">Source</Label>
              <Select value={formData.source} onValueChange={(v) => setFormData({ ...formData, source: v })}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-deal-source">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                  {sources.map((s) => (
                    <SelectItem key={s} value={s} className="text-white">
                      {s.replace("_", " ").charAt(0).toUpperCase() + s.replace("_", " ").slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-white/70">Tags</Label>
              <div className="flex flex-wrap gap-1 mb-2">
                {formData.tags.map((tag) => (
                  <span key={tag} className="px-2 py-1 rounded-full text-xs bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] flex items-center gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-white"
                      data-testid={`button-remove-tag-${tag}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Type and press Enter to add tags"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                data-testid="input-deal-tags"
              />
            </div>

            <div>
              <Label className="text-white/70">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                data-testid="input-deal-notes"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full h-12 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              data-testid="button-submit-deal"
            >
              {isPending ? (editingDeal ? "Updating..." : "Creating...") : (editingDeal ? "Update Deal" : "Create Deal")}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
