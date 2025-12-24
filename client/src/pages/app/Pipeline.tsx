import { useState, KeyboardEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  ArrowLeft, Plus, Search, MoreVertical, Trash2, Edit, X, 
  DollarSign, Calendar, Building2, User, Tag, Grip, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
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

  const handleStageChange = (dealId: string, newStage: string) => {
    updateMutation.mutate({ id: dealId, data: { stage: newStage } });
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(18,18,18)]">
      <header className="h-16 bg-black/50 border-b border-white/10 flex items-center px-6 sticky top-0 z-30 backdrop-blur-md">
        <Link href="/app/dashboard" data-testid="link-back-dashboard">
          <Button variant="ghost" size="icon" className="text-white/60">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="ml-4 flex-1">
          <h1 className="text-xl font-light text-white">Deal Pipeline</h1>
          <p className="text-sm text-white/50">
            Track and manage your investment deals
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "kanban" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("kanban")}
            data-testid="button-view-kanban"
          >
            Board
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
            data-testid="button-view-list"
          >
            List
          </Button>
        </div>
        <Button onClick={openCreateDialog} className="ml-4" data-testid="button-add-deal">
          <Plus className="w-4 h-4 mr-2" />
          Add Deal
        </Button>
      </header>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDeal ? "Edit Deal" : "Add New Deal"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder="e.g., Series A - Acme Corp"
                data-testid="input-deal-title"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                data-testid="input-deal-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Stage</Label>
                <Select value={formData.stage} onValueChange={(v) => setFormData({ ...formData, stage: v })}>
                  <SelectTrigger data-testid="select-deal-stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dealStages.map((stage) => (
                      <SelectItem key={stage.value} value={stage.value}>
                        {stage.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Priority</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                  <SelectTrigger data-testid="select-deal-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorities.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Deal Size ($)</Label>
                <Input
                  type="number"
                  value={formData.dealSize}
                  onChange={(e) => setFormData({ ...formData, dealSize: e.target.value })}
                  placeholder="e.g., 500000"
                  data-testid="input-deal-size"
                />
              </div>

              <div>
                <Label>Probability (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.probability}
                  onChange={(e) => setFormData({ ...formData, probability: e.target.value })}
                  placeholder="0-100"
                  data-testid="input-deal-probability"
                />
              </div>
            </div>

            <div>
              <Label>Source</Label>
              <Select value={formData.source} onValueChange={(v) => setFormData({ ...formData, source: v })}>
                <SelectTrigger data-testid="select-deal-source">
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace("_", " ").charAt(0).toUpperCase() + s.replace("_", " ").slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1 mb-2">
                {formData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-1 hover:text-destructive"
                      data-testid={`button-remove-tag-${tag}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Type and press Enter to add tags"
                data-testid="input-deal-tags"
              />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                data-testid="input-deal-notes"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isPending} data-testid="button-submit-deal">
              {isPending ? (editingDeal ? "Updating..." : "Creating...") : (editingDeal ? "Update Deal" : "Create Deal")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="max-w-full px-6 py-8">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              placeholder="Search deals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-deals"
            />
          </div>
          {viewMode === "list" && (
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-stage-filter">
                <SelectValue placeholder="All Stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {dealStages.map((stage) => (
                  <SelectItem key={stage.value} value={stage.value}>
                    {stage.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {viewMode === "kanban" ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {dealStages.map((stage) => {
              const stageDeals = getDealsForStage(stage.value);
              return (
                <div
                  key={stage.value}
                  className="flex-shrink-0 w-72 bg-white/5 border border-white/10 rounded-lg"
                >
                  <div className="p-3 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                      <h3 className="font-medium text-white">
                        {stage.label}
                      </h3>
                      <Badge variant="secondary" className="ml-auto">
                        {stageDeals.length}
                      </Badge>
                    </div>
                  </div>
                  <div className="p-2 space-y-2 min-h-[200px]">
                    {stageDeals.map((deal) => (
                      <Card
                        key={deal.id}
                        className="cursor-pointer hover-elevate"
                        data-testid={`card-deal-${deal.id}`}
                        onClick={() => openEditDialog(deal)}
                      >
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-medium text-sm text-white line-clamp-2">
                              {deal.title}
                            </h4>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditDialog(deal);
                                  }}
                                  data-testid={`button-edit-deal-${deal.id}`}
                                >
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600"
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
                            <div className="flex items-center gap-1 text-xs text-white/50">
                              <DollarSign className="w-3 h-3" />
                              {formatDealSize(deal.dealSize)}
                            </div>
                          )}
                          
                          <div className="flex flex-wrap gap-1">
                            <Badge
                              variant="outline"
                              className={`text-xs capitalize ${
                                deal.priority === "high"
                                  ? "border-[rgb(251,194,213)]/50 text-[rgb(251,194,213)]"
                                  : deal.priority === "low"
                                  ? "border-white/20 text-white/50"
                                  : "border-white/20 text-white/70"
                              }`}
                            >
                              {deal.priority}
                            </Badge>
                            {Array.isArray(deal.tags) && deal.tags.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {stageDeals.length === 0 && (
                      <div className="text-center py-8 text-sm text-white/40">
                        No deals
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDeals.length === 0 ? (
              <Card className="p-12 text-center bg-white/5 border-white/10">
                <DollarSign className="w-16 h-16 text-white/20 mx-auto mb-4" />
                <h3 className="text-lg font-light text-white mb-2">
                  No deals found
                </h3>
                <p className="text-white/50 mb-4">
                  {deals.length === 0
                    ? "Start tracking your investment pipeline by adding deals."
                    : "Try adjusting your search or filters."}
                </p>
                {deals.length === 0 && (
                  <Button onClick={openCreateDialog} data-testid="button-add-first-deal">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Deal
                  </Button>
                )}
              </Card>
            ) : (
              filteredDeals.map((deal) => {
                const stageInfo = dealStages.find((s) => s.value === deal.stage);
                return (
                  <Card
                    key={deal.id}
                    className="hover-elevate cursor-pointer"
                    data-testid={`card-deal-${deal.id}`}
                    onClick={() => openEditDialog(deal)}
                  >
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className={`w-2 h-full min-h-[40px] rounded-full ${stageInfo?.color}`} />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-white truncate">
                          {deal.title}
                        </h4>
                        {deal.description && (
                          <p className="text-sm text-white/50 truncate">
                            {deal.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <Badge variant="secondary">{stageInfo?.label}</Badge>
                        {deal.dealSize && (
                          <span className="text-white/70">
                            {formatDealSize(deal.dealSize)}
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className={`capitalize ${
                            deal.priority === "high"
                              ? "border-[rgb(251,194,213)]/50 text-[rgb(251,194,213)]"
                              : deal.priority === "low"
                              ? "border-white/20 text-white/50"
                              : ""
                          }`}
                        >
                          {deal.priority}
                        </Badge>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(deal);
                            }}
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(deal.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
