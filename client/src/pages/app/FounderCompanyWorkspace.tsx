import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "wouter";
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
  Rocket, Building2, FolderOpen, BarChart3, Plus, Edit, Trash2,
  MoreVertical, Globe, MapPin, DollarSign, Users, FileText, Upload,
  Sparkles, Loader2, Eye, ExternalLink, Target, TrendingUp, Lightbulb,
  Lock, Unlock, Check, Clock, XCircle, Search, StickyNote, Brain,
  CheckCircle2, AlertCircle, ChevronRight, ArrowLeft
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { extractTextFromPDF } from "@/lib/pdf-parser";
import AppLayout from "@/components/AppLayout";
import type { Startup, StartupDocument, DealRoom, DealRoomDocument, DealRoomNote, DealRoomMilestone, Deal, DocumentType } from "@shared/schema";

const stages = ["Pre-seed", "Seed", "Series A", "Series B", "Series C+"];
const fundingStatuses = ["Actively Raising", "Open to Investors", "Not Currently Raising"];
const industries = [
  "AI/ML", "SaaS", "FinTech", "HealthTech", "EdTech", "E-commerce", 
  "CleanTech", "Cybersecurity", "Blockchain", "Consumer", "Enterprise", "Other"
];

const DOCUMENT_TYPE_CONFIG: Record<DocumentType, { label: string; icon: any; description: string }> = {
  pitch_deck: { label: "Pitch Deck", icon: FileText, description: "Your investor presentation" },
  cap_table: { label: "Cap Table", icon: FileText, description: "Ownership and equity structure" },
  financials: { label: "Financials", icon: FileText, description: "Financial statements and projections" },
  faq: { label: "FAQ", icon: FileText, description: "Frequently asked questions" },
  data_room: { label: "Data Room", icon: FolderOpen, description: "Due diligence documents" },
  term_sheet: { label: "Term Sheet", icon: FileText, description: "Investment terms" },
  additional: { label: "Additional", icon: FileText, description: "Other supporting documents" },
};

const milestoneStatuses = [
  { value: "pending", label: "Pending", icon: Clock, color: "text-white/50" },
  { value: "in_progress", label: "In Progress", icon: Clock, color: "text-[rgb(254,212,92)]" },
  { value: "completed", label: "Completed", icon: Check, color: "text-[rgb(196,227,230)]" },
  { value: "cancelled", label: "Cancelled", icon: XCircle, color: "text-[rgb(251,194,213)]" },
];

interface PitchDeckAnalysis {
  overallScore: number;
  categoryScores: {
    problem: number;
    solution: number;
    market: number;
    businessModel: number;
    traction: number;
    team: number;
    financials: number;
    competition: number;
    ask: number;
    presentation: number;
  };
  strengths: string[];
  weaknesses: string[];
  recommendations: Array<{
    category: string;
    priority: "high" | "medium" | "low";
    title: string;
    description: string;
  }>;
  summary: string;
}

export default function FounderCompanyWorkspace() {
  const { user, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("profiles");

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
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-light text-white">My Company</h1>
                <p className="text-white/50">Manage your startups, data rooms, and analytics</p>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl">
                <TabsTrigger 
                  value="profiles" 
                  className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60 rounded-lg px-6"
                  data-testid="tab-profiles"
                >
                  <Rocket className="w-4 h-4 mr-2" />
                  Profiles
                </TabsTrigger>
                <TabsTrigger 
                  value="data-rooms" 
                  className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60 rounded-lg px-6"
                  data-testid="tab-data-rooms"
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  Data Rooms
                </TabsTrigger>
                <TabsTrigger 
                  value="analytics" 
                  className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white text-white/60 rounded-lg px-6"
                  data-testid="tab-analytics"
                >
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Analytics
                </TabsTrigger>
              </TabsList>

              <TabsContent value="profiles" className="mt-6">
                <ProfilesTab />
              </TabsContent>

              <TabsContent value="data-rooms" className="mt-6">
                <DataRoomsTab />
              </TabsContent>

              <TabsContent value="analytics" className="mt-6">
                <AnalyticsTab />
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}

function ProfilesTab() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedStartup, setSelectedStartup] = useState<Startup | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    tagline: "",
    description: "",
    website: "",
    stage: "",
    fundingStatus: "",
    targetAmount: "",
    location: "",
    industries: [] as string[],
  });

  const { data: startups = [], isLoading } = useQuery<Startup[]>({
    queryKey: ["/api/startups/mine"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/startups", {
        ...data,
        targetAmount: data.targetAmount ? parseInt(data.targetAmount) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/startups/mine"] });
      setIsCreateOpen(false);
      resetForm();
      toast({ title: "Startup created", description: "Your startup profile has been created." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create startup", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/startups/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/startups/mine"] });
      toast({ title: "Startup deleted", description: "Your startup has been removed." });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      tagline: "",
      description: "",
      website: "",
      stage: "",
      fundingStatus: "",
      targetAmount: "",
      location: "",
      industries: [],
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-medium text-white">Your Startups</h2>
          <p className="text-white/50 text-sm">Manage your company profiles</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80" data-testid="button-create-startup">
              <Plus className="w-4 h-4 mr-2" />
              New Startup
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[rgb(25,25,25)] border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Startup</DialogTitle>
              <DialogDescription className="text-white/50">
                Add your company to start matching with investors
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="Acme Inc."
                  data-testid="input-startup-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Tagline</Label>
                <Input
                  value={formData.tagline}
                  onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="The future of X"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-white/5 border-white/10 text-white min-h-[100px]"
                  placeholder="Describe what your company does..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Stage</Label>
                  <Select value={formData.stage} onValueChange={(v) => setFormData({ ...formData, stage: v })}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                    <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
                      {stages.map((s) => (
                        <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Funding Status</Label>
                  <Select value={formData.fundingStatus} onValueChange={(v) => setFormData({ ...formData, fundingStatus: v })}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
                      {fundingStatuses.map((s) => (
                        <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Target Amount ($)</Label>
                  <Input
                    type="number"
                    value={formData.targetAmount}
                    onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="1000000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="San Francisco, CA"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="https://example.com"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)} className="border-white/10 text-white">
                Cancel
              </Button>
              <Button 
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.name || createMutation.isPending}
                className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
                data-testid="button-submit-startup"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Startup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {startups.length === 0 ? (
        <div className="text-center py-20">
          <Rocket className="w-12 h-12 text-white/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Startups Yet</h3>
          <p className="text-white/50 mb-6">Create your first startup profile to get started</p>
          <Button 
            onClick={() => setIsCreateOpen(true)}
            className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Startup
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {startups.map((startup, index) => (
            <motion.div
              key={startup.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
              data-testid={`startup-card-${startup.id}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 border border-white/20">
                    <AvatarFallback className="bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white">
                      {startup.name?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-medium text-white">{startup.name}</h3>
                    {startup.tagline && (
                      <p className="text-sm text-white/50 line-clamp-1">{startup.tagline}</p>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="w-4 h-4 text-white/50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-[rgb(30,30,30)] border-white/10">
                    <DropdownMenuItem asChild className="text-white/70 hover:text-white cursor-pointer">
                      <Link href={`/app/startups/${startup.id}`}>
                        <Eye className="w-4 h-4 mr-2" />
                        View Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuItem 
                      onClick={() => deleteMutation.mutate(startup.id)}
                      className="text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-3">
                {startup.stage && (
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <Target className="w-4 h-4" />
                    <span>{startup.stage}</span>
                  </div>
                )}
                {startup.location && (
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <MapPin className="w-4 h-4" />
                    <span>{startup.location}</span>
                  </div>
                )}
                {startup.targetAmount && (
                  <div className="flex items-center gap-2 text-sm text-white/60">
                    <DollarSign className="w-4 h-4" />
                    <span>${(startup.targetAmount / 1000000).toFixed(1)}M target</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/10">
                {startup.fundingStatus && (
                  <Badge 
                    variant="secondary" 
                    className={`text-xs ${
                      startup.fundingStatus === "Actively Raising" 
                        ? "bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)]" 
                        : "bg-white/10 text-white/60"
                    }`}
                  >
                    {startup.fundingStatus}
                  </Badge>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function DataRoomsTab() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string>("");
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDescription, setNewRoomDescription] = useState("");

  const { data: rooms = [], isLoading: roomsLoading } = useQuery<DealRoom[]>({
    queryKey: ["/api/deal-rooms"],
  });

  const { data: deals = [] } = useQuery<Deal[]>({
    queryKey: ["/api/deals"],
  });

  const createRoomMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/deal-rooms", {
        dealId: selectedDealId || null,
        name: newRoomName,
        description: newRoomDescription,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms"] });
      setCreateRoomOpen(false);
      setNewRoomName("");
      setNewRoomDescription("");
      setSelectedDealId("");
      toast({ title: "Data room created", description: "Your data room is ready." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create data room", variant: "destructive" });
    },
  });

  const deleteRoomMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/deal-rooms/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms"] });
      toast({ title: "Data room deleted" });
    },
  });

  const filteredRooms = useMemo(() => {
    if (!searchQuery.trim()) return rooms;
    const q = searchQuery.toLowerCase();
    return rooms.filter(r => 
      r.name?.toLowerCase().includes(q) || 
      r.description?.toLowerCase().includes(q)
    );
  }, [rooms, searchQuery]);

  if (roomsLoading) {
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
          <h2 className="text-xl font-medium text-white">Data Rooms</h2>
          <p className="text-white/50 text-sm">Secure document sharing for due diligence</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rooms..."
              className="pl-10 bg-white/5 border-white/10 text-white w-[200px]"
              data-testid="input-search-rooms"
            />
          </div>
          <Dialog open={createRoomOpen} onOpenChange={setCreateRoomOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80" data-testid="button-create-room">
                <Plus className="w-4 h-4 mr-2" />
                New Room
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[rgb(25,25,25)] border-white/10 text-white">
              <DialogHeader>
                <DialogTitle>Create Data Room</DialogTitle>
                <DialogDescription className="text-white/50">
                  Create a secure space to share documents with investors
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Room Name</Label>
                  <Input
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="Series A Data Room"
                    data-testid="input-room-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={newRoomDescription}
                    onChange={(e) => setNewRoomDescription(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="Documents for due diligence..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Link to Deal (optional)</Label>
                  <Select value={selectedDealId} onValueChange={setSelectedDealId}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select a deal" />
                    </SelectTrigger>
                    <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
                      <SelectItem value="none" className="text-white/50">No deal</SelectItem>
                      {deals.map((deal) => (
                        <SelectItem key={deal.id} value={deal.id} className="text-white">
                          {deal.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateRoomOpen(false)} className="border-white/10 text-white">
                  Cancel
                </Button>
                <Button 
                  onClick={() => createRoomMutation.mutate()}
                  disabled={!newRoomName.trim() || createRoomMutation.isPending}
                  className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
                  data-testid="button-submit-room"
                >
                  {createRoomMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Room
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {filteredRooms.length === 0 ? (
        <div className="text-center py-20">
          <FolderOpen className="w-12 h-12 text-white/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Data Rooms</h3>
          <p className="text-white/50 mb-6">Create a data room to share documents securely</p>
          <Button 
            onClick={() => setCreateRoomOpen(true)}
            className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Data Room
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredRooms.map((room, index) => (
            <motion.div
              key={room.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group cursor-pointer"
              data-testid={`room-card-${room.id}`}
            >
              <Link href={`/app/deal-rooms/${room.id}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[rgb(142,132,247)]/20 to-[rgb(251,194,213)]/20 flex items-center justify-center">
                    <FolderOpen className="w-6 h-6 text-[rgb(142,132,247)]" />
                  </div>
                  <div className="flex items-center gap-2">
                    {room.accessLevel === "private" ? (
                      <Lock className="w-4 h-4 text-white/40" />
                    ) : (
                      <Unlock className="w-4 h-4 text-white/40" />
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="w-4 h-4 text-white/50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-[rgb(30,30,30)] border-white/10">
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRoomMutation.mutate(room.id);
                          }}
                          className="text-red-400 hover:text-red-300 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <h3 className="font-medium text-white mb-2">{room.name}</h3>
                {room.description && (
                  <p className="text-sm text-white/50 line-clamp-2 mb-4">{room.description}</p>
                )}

                <div className="flex items-center justify-between text-xs text-white/40">
                  <span>Created {format(new Date(room.createdAt || Date.now()), "MMM d, yyyy")}</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnalyticsTab() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<PitchDeckAnalysis | null>(null);
  const [selectedStartupId, setSelectedStartupId] = useState<string>("");

  const { data: startups = [] } = useQuery<Startup[]>({
    queryKey: ["/api/startups/mine"],
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes("pdf")) {
      toast({ title: "Invalid file", description: "Please upload a PDF file", variant: "destructive" });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(10);

    try {
      const text = await extractTextFromPDF(file);
      setAnalysisProgress(30);

      if (!selectedStartupId) {
        toast({ title: "Select a startup", description: "Please select a startup to analyze the pitch deck for", variant: "destructive" });
        setIsAnalyzing(false);
        return;
      }

      const response = await apiRequest("POST", `/api/startups/${selectedStartupId}/analyze-pitch-deck`, {
        pitchDeckContent: text,
      });
      
      setAnalysisProgress(100);
      const result = await response.json();
      setAnalysisResult(result);
      toast({ title: "Analysis complete", description: "Your pitch deck has been analyzed." });
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err.message || "Could not analyze the pitch deck", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(0);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-[rgb(196,227,230)]";
    if (score >= 60) return "text-[rgb(254,212,92)]";
    return "text-[rgb(251,194,213)]";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-medium text-white">Pitch Deck Analytics</h2>
        <p className="text-white/50 text-sm">AI-powered analysis of your investor presentations</p>
      </div>

      <div className="p-8 rounded-2xl border border-white/10 bg-white/5">
        <div className="flex items-center gap-6 mb-6">
          <div className="space-y-2 flex-1">
            <Label className="text-white/70">Select Startup</Label>
            <Select value={selectedStartupId} onValueChange={setSelectedStartupId}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-startup-analytics">
                <SelectValue placeholder="Choose a startup" />
              </SelectTrigger>
              <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
                {startups.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-white">{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="pt-6">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button 
              onClick={() => fileInputRef.current?.click()}
              disabled={!selectedStartupId || isAnalyzing}
              className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
              data-testid="button-upload-deck"
            >
              {isAnalyzing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Upload Pitch Deck
            </Button>
          </div>
        </div>

        {isAnalyzing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/60">Analyzing...</span>
              <span className="text-white/60">{analysisProgress}%</span>
            </div>
            <Progress value={analysisProgress} className="h-2" />
          </div>
        )}
      </div>

      {analysisResult && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="p-8 rounded-2xl border border-white/10 bg-white/5">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-medium text-white">Analysis Results</h3>
              <div className="text-center">
                <p className={`text-4xl font-bold ${getScoreColor(analysisResult.overallScore)}`}>
                  {analysisResult.overallScore}
                </p>
                <p className="text-xs text-white/40">Overall Score</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 mb-8">
              {Object.entries(analysisResult.categoryScores).map(([category, score]) => (
                <div key={category} className="p-4 rounded-xl bg-white/5 text-center">
                  <p className={`text-2xl font-medium ${getScoreColor(score)}`}>{score}</p>
                  <p className="text-xs text-white/50 capitalize">{category}</p>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-white mb-2">Summary</h4>
                <p className="text-sm text-white/60">{analysisResult.summary}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="text-sm font-medium text-[rgb(196,227,230)] mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Strengths
                  </h4>
                  <ul className="space-y-1">
                    {analysisResult.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-white/60 flex items-start gap-2">
                        <Check className="w-3 h-3 mt-1 text-[rgb(196,227,230)]" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-[rgb(251,194,213)] mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Areas for Improvement
                  </h4>
                  <ul className="space-y-1">
                    {analysisResult.weaknesses.map((w, i) => (
                      <li key={i} className="text-sm text-white/60 flex items-start gap-2">
                        <XCircle className="w-3 h-3 mt-1 text-[rgb(251,194,213)]" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {analysisResult.recommendations.length > 0 && (
            <div className="p-8 rounded-2xl border border-white/10 bg-white/5">
              <h3 className="text-lg font-medium text-white mb-4">Recommendations</h3>
              <div className="space-y-3">
                {analysisResult.recommendations.map((rec, i) => (
                  <div key={i} className="p-4 rounded-xl bg-white/5 flex items-start gap-4">
                    <Badge 
                      variant="secondary"
                      className={`${
                        rec.priority === "high" ? "bg-[rgb(251,194,213)]/20 text-[rgb(251,194,213)]" :
                        rec.priority === "medium" ? "bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)]" :
                        "bg-white/10 text-white/60"
                      }`}
                    >
                      {rec.priority}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium text-white">{rec.title}</p>
                      <p className="text-sm text-white/50">{rec.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {!analysisResult && !isAnalyzing && (
        <div className="text-center py-16">
          <Brain className="w-12 h-12 text-white/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">AI-Powered Analysis</h3>
          <p className="text-white/50 max-w-md mx-auto">
            Upload your pitch deck to get comprehensive feedback on problem, solution, market, team, and more.
          </p>
        </div>
      )}
    </div>
  );
}
