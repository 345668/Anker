import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Kanban,
  Sparkles,
  Database,
  TrendingUp,
  Target,
  Users,
  ArrowUpRight,
  Building2,
  BookUser,
  Rocket,
  Mail,
  Eye,
  MessageSquare,
  Calendar,
  Search,
  Filter,
  ChevronRight,
  MoreHorizontal,
  Trash2,
  Linkedin,
  Twitter,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  UserPlus,
  Send,
  ThumbsUp,
  ThumbsDown,
  ArrowRight,
  Network,
  X,
  FileText,
  Mic,
  Brain,
  FolderOpen,
  Shield,
  Clock,
  AlertCircle,
  Plus,
  FileCheck,
  Lock,
  Unlock,
  Activity,
  Zap,
  Upload
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import DomainMatchCard from "@/components/DomainMatchCard";
import { EnrichmentProgressPanel } from "@/components/EnrichmentProgressPanel";
import { UrlHealthButton } from "@/components/UrlHealthButton";
import type { 
  Contact, 
  Match, 
  InvestmentFirm, 
  Investor, 
  Startup,
  Outreach,
  Businessman,
  DealRoom,
  DealRoomDocument,
  DealRoomAccessGrant,
  DealRoomAuditEvent,
  DealRoomNdaAgreement,
  AcceleratedMatchJob
} from "@shared/schema";
import { FIRM_CLASSIFICATIONS } from "@shared/schema";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const investorStages = [
  "All Stages",
  "Pre-seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Series D",
  "Growth",
  "Bridge"
];

const firmClassifications = ["All", ...FIRM_CLASSIFICATIONS, "Unclassified"] as const;

const businessLocations = [
  "All Locations",
  "London",
  "New York",
  "Dubai",
  "Singapore",
  "Hong Kong",
  "Mumbai",
  "Delhi",
  "Bengaluru"
];

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface DashboardSummary {
  contacts: {
    total: number;
    byType: Record<string, number>;
    byPipelineStage: Record<string, number>;
    activeCount: number;
  };
  deals: {
    total: number;
    byStage: Record<string, number>;
    activeCount: number;
    totalValue: number;
  };
  matches: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  startups: {
    total: number;
  };
  database: {
    totalInvestors: number;
    totalFirms: number;
  };
}

const pipelineStages = [
  { id: "sourced", label: "Sourced", color: "rgb(142, 132, 247)" },
  { id: "first_review", label: "First Review", color: "rgb(196, 227, 230)" },
  { id: "deep_dive", label: "Deep Dive", color: "rgb(251, 194, 213)" },
  { id: "due_diligence", label: "Due Diligence", color: "rgb(254, 212, 92)" },
  { id: "term_sheet", label: "Term Sheet", color: "rgb(142, 132, 247)" },
  { id: "closed", label: "Closed", color: "rgb(196, 227, 230)" },
];

const entityTypes = [
  { value: "all", label: "All Types" },
  { value: "investors", label: "Individual Investors" },
  { value: "firms", label: "Investment Firms" },
  { value: "businessmen", label: "Business Leaders" },
];

function WorkspaceTabTrigger({ 
  value, 
  children, 
  icon: Icon 
}: { 
  value: string; 
  children: React.ReactNode; 
  icon: React.ElementType 
}) {
  return (
    <TabsTrigger
      value={value}
      className="relative h-12 px-6 rounded-full flex items-center gap-2 text-white/60 
        data-[state=active]:text-white data-[state=active]:bg-gradient-to-r 
        data-[state=active]:from-[rgb(142,132,247)] data-[state=active]:to-[rgb(251,194,213)]
        hover:text-white/80 transition-all duration-300"
      data-testid={`tab-${value}`}
    >
      <Icon className="h-4 w-4" />
      <span className="font-light">{children}</span>
    </TabsTrigger>
  );
}

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  color, 
  delay = 0 
}: { 
  icon: React.ElementType; 
  label: string; 
  value: string | number; 
  color: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="p-6 rounded-2xl border border-white/10 bg-white/5"
    >
      <div className="flex items-center gap-4">
        <div 
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}20` }}
        >
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

function OverviewTab({ summary, isLoading }: { summary?: DashboardSummary; isLoading: boolean }) {
  const { data: outreaches = [] } = useQuery<Outreach[]>({
    queryKey: ["/api/outreaches"],
  });

  const { data: matches = [] } = useQuery<Match[]>({
    queryKey: ["/api/matches"],
  });

  const contactPipeline = summary?.contacts?.byPipelineStage || {};
  const pipelineData = [
    { label: "Sourced", count: contactPipeline.sourced || 0, color: "rgb(142, 132, 247)" },
    { label: "First Review", count: contactPipeline.first_review || 0, color: "rgb(196, 227, 230)" },
    { label: "Deep Dive", count: contactPipeline.deep_dive || 0, color: "rgb(251, 194, 213)" },
    { label: "Due Diligence", count: contactPipeline.due_diligence || 0, color: "rgb(254, 212, 92)" },
    { label: "Term Sheet", count: contactPipeline.term_sheet || 0, color: "rgb(142, 132, 247)" },
    { label: "Closed", count: contactPipeline.closed || 0, color: "rgb(196, 227, 230)" },
  ];
  const maxPipeline = Math.max(...pipelineData.map(s => s.count), 1);

  const recentActivity = useMemo(() => {
    const activities: Array<{ type: string; title: string; description: string; time: string; icon: React.ElementType }> = [];
    
    const recentOutreaches = outreaches
      .filter(o => o.createdAt)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, 3);
    
    recentOutreaches.forEach(o => {
      const timeAgo = o.createdAt ? formatTimeAgo(new Date(o.createdAt)) : "Recently";
      activities.push({
        type: "outreach",
        title: o.stage === "replied" ? "Outreach response" : "Outreach sent",
        description: o.emailSubject || "Email outreach",
        time: timeAgo,
        icon: Mail,
      });
    });

    const recentMatches = matches
      .filter(m => m.createdAt)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, 2);
    
    recentMatches.forEach(m => {
      const timeAgo = m.createdAt ? formatTimeAgo(new Date(m.createdAt)) : "Recently";
      activities.push({
        type: "match",
        title: "New investor match",
        description: `Match score: ${m.matchScore}%`,
        time: timeAgo,
        icon: Target,
      });
    });

    return activities.slice(0, 4);
  }, [outreaches, matches]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[rgb(142,132,247)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          icon={Building2} 
          label="Investment Firms" 
          value={summary?.database?.totalFirms?.toLocaleString() || "0"} 
          color="rgb(196, 227, 230)" 
          delay={0}
        />
        <StatCard 
          icon={Users} 
          label="Investors" 
          value={summary?.database?.totalInvestors?.toLocaleString() || "0"} 
          color="rgb(142, 132, 247)" 
          delay={0.1}
        />
        <StatCard 
          icon={BookUser} 
          label="My Contacts" 
          value={summary?.contacts?.total?.toLocaleString() || "0"} 
          color="rgb(251, 194, 213)" 
          delay={0.2}
        />
        <StatCard 
          icon={Rocket} 
          label="My Startups" 
          value={summary?.startups?.total?.toLocaleString() || "0"} 
          color="rgb(254, 212, 92)" 
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
          <h3 className="text-lg font-light text-white mb-6">Investor Pipeline</h3>
          <div className="space-y-4">
            {pipelineData.map((stage, index) => (
              <div key={stage.label} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/70">{stage.label}</span>
                  <span className="text-sm font-medium text-white">{stage.count}</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(stage.count / maxPipeline) * 100}%` }}
                    transition={{ duration: 0.6, delay: 0.5 + index * 0.1 }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="p-6 rounded-2xl border border-white/10 bg-white/5"
        >
          <h3 className="text-lg font-light text-white mb-6">Recent Activity</h3>
          <div className="space-y-4">
            {recentActivity.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-8 h-8 text-white/20 mx-auto mb-2" />
                <p className="text-sm text-white/40">No recent activity</p>
                <p className="text-xs text-white/30">Start by generating matches or sending outreach</p>
              </div>
            ) : (
              recentActivity.map((activity, index) => (
                <div key={index} className="flex items-start gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <activity.icon className="w-5 h-5 text-[rgb(142,132,247)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{activity.title}</p>
                    <p className="text-sm text-white/50 truncate">{activity.description}</p>
                  </div>
                  <span className="text-xs text-white/40 whitespace-nowrap">{activity.time}</span>
                </div>
              ))
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
          <h3 className="text-lg font-light text-white">Match Summary</h3>
          <Badge variant="secondary" className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] border-0">
            {summary?.matches?.total || 0} Total
          </Badge>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="p-4 rounded-xl bg-white/5 text-center">
            <p className="text-2xl font-light text-white">{summary?.matches?.pending || 0}</p>
            <p className="text-sm text-white/50">Pending Review</p>
          </div>
          <div className="p-4 rounded-xl bg-white/5 text-center">
            <p className="text-2xl font-light text-[rgb(196,227,230)]">{summary?.matches?.approved || 0}</p>
            <p className="text-sm text-white/50">Approved</p>
          </div>
          <div className="p-4 rounded-xl bg-white/5 text-center">
            <p className="text-2xl font-light text-white/50">{summary?.matches?.rejected || 0}</p>
            <p className="text-sm text-white/50">Passed</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ContactCard({ 
  contact, 
  onMoveToStage,
  onDelete 
}: { 
  contact: Contact; 
  onMoveToStage: (contactId: string, stage: string) => void;
  onDelete: (contactId: string) => void;
}) {
  const initials = `${contact.firstName?.[0] || ''}${contact.lastName?.[0] || ''}`.toUpperCase();
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
      data-testid={`contact-card-${contact.id}`}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 border border-white/20">
          <AvatarImage src={contact.avatar || ''} />
          <AvatarFallback className="bg-white/10 text-white text-sm">
            {initials || '?'}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-white font-medium text-sm truncate">
              {contact.firstName} {contact.lastName}
            </h4>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  data-testid={`contact-menu-${contact.id}`}
                >
                  <MoreHorizontal className="h-4 w-4 text-white/50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[rgb(30,30,30)] border-white/10">
                {pipelineStages.map((stage) => (
                  <DropdownMenuItem 
                    key={stage.id}
                    onClick={() => onMoveToStage(contact.id, stage.id)}
                    className="text-white/70 hover:text-white focus:text-white cursor-pointer"
                  >
                    <ChevronRight className="h-4 w-4 mr-2" style={{ color: stage.color }} />
                    Move to {stage.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem 
                  onClick={() => onDelete(contact.id)}
                  className="text-red-400 hover:text-red-300 focus:text-red-300 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {contact.title && (
            <p className="text-white/50 text-xs truncate">{contact.title}</p>
          )}
          {contact.company && (
            <p className="text-white/40 text-xs truncate">{contact.company}</p>
          )}
          
          <div className="flex items-center gap-2 mt-2">
            {contact.email && (
              <a 
                href={`mailto:${contact.email}`}
                className="text-white/40 hover:text-[rgb(142,132,247)] transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
              </a>
            )}
            {contact.linkedinUrl && (
              <a 
                href={contact.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/40 hover:text-[rgb(142,132,247)] transition-colors"
              >
                <Linkedin className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function PipelineTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data: contacts = [], isLoading, refetch } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ contactId, stage }: { contactId: string; stage: string }) => {
      return apiRequest("PATCH", `/api/contacts/${contactId}`, { pipelineStage: stage });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact updated", description: "Pipeline stage changed successfully." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (contactId: string) => {
      return apiRequest("DELETE", `/api/contacts/${contactId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact removed", description: "Contact has been removed from your CRM." });
    },
  });

  const investorContacts = useMemo(() => {
    return contacts.filter(c => 
      c.type === "investor" && 
      (searchQuery === "" || 
        `${c.firstName} ${c.lastName} ${c.company}`.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [contacts, searchQuery]);

  const contactsByStage = useMemo(() => {
    const grouped: Record<string, Contact[]> = {};
    pipelineStages.forEach(stage => {
      grouped[stage.id] = investorContacts.filter(c => c.pipelineStage === stage.id);
    });
    return grouped;
  }, [investorContacts]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[rgb(142,132,247)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
            data-testid="input-search-pipeline"
          />
        </div>
        <Link href="/app/outreach">
          <Button 
            variant="outline" 
            className="border-white/20 text-white hover:bg-white/10"
            data-testid="button-outreach"
          >
            <Send className="h-4 w-4 mr-2" />
            Outreach
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {pipelineStages.map((stage) => (
          <div key={stage.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="text-sm font-medium text-white">{stage.label}</span>
              </div>
              <Badge variant="secondary" className="bg-white/10 text-white/70 text-xs">
                {contactsByStage[stage.id]?.length || 0}
              </Badge>
            </div>
            <div className="space-y-2 min-h-[200px] p-2 rounded-xl bg-white/5 border border-white/10">
              {contactsByStage[stage.id]?.map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  onMoveToStage={(id, s) => updateStageMutation.mutate({ contactId: id, stage: s })}
                  onDelete={(id) => deleteMutation.mutate(id)}
                />
              ))}
              {(contactsByStage[stage.id]?.length || 0) === 0 && (
                <p className="text-center text-white/30 text-xs py-8">No contacts</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type UploadedDocument = {
  type: string;
  name: string;
  text: string;
  size: number;
};

const MATCHING_DOC_TYPES = [
  { id: "pitch_deck", label: "Pitch Deck", icon: FileText, color: "rgb(142,132,247)" },
  { id: "financials", label: "Financials", icon: TrendingUp, color: "rgb(196,227,230)" },
  { id: "cap_table", label: "Cap Table", icon: Users, color: "rgb(251,194,213)" },
  { id: "term_sheet", label: "Term Sheet", icon: FileCheck, color: "rgb(142,132,247)" },
  { id: "additional", label: "Additional", icon: Plus, color: "rgb(196,227,230)" },
];

function MatchingTab() {
  const [, navigate] = useLocation();
  const [selectedStartupId, setSelectedStartupId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [useEnhancedMatching, setUseEnhancedMatching] = useState(false);
  const [showAccelerated, setShowAccelerated] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDocument[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState("pitch_deck");
  const [selectedJob, setSelectedJob] = useState<AcceleratedMatchJob | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: startups = [], isLoading: startupsLoading } = useQuery<Startup[]>({
    queryKey: ["/api/startups/mine"],
  });

  const { data: matches = [], isLoading: matchesLoading } = useQuery<Match[]>({
    queryKey: ["/api/matches"],
  });

  const { data: acceleratedJobs = [], isLoading: acceleratedJobsLoading } = useQuery<AcceleratedMatchJob[]>({
    queryKey: ["/api/accelerated-matches"],
    refetchInterval: (query) => {
      const jobs = query.state.data as AcceleratedMatchJob[] | undefined;
      const hasActiveJob = jobs?.some(j => j.status !== "complete" && j.status !== "failed");
      return hasActiveJob ? 2000 : false;
    },
  });

  const currentSelectedJob = useMemo(() => {
    if (!selectedJob) return null;
    return acceleratedJobs.find(j => j.id === selectedJob.id) || selectedJob;
  }, [acceleratedJobs, selectedJob]);

  const acceleratedMatchMutation = useMutation({
    mutationFn: async ({ startupId, deckText, documents }: { startupId?: string; deckText: string; documents?: UploadedDocument[] }) => {
      const response = await apiRequest("POST", "/api/accelerated-matches", { startupId, deckText, documents });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accelerated-matches"] });
      setSelectedJob(data);
      toast({
        title: "Accelerated Matching Started",
        description: "Analyzing your documents and finding investor matches...",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start accelerated matching. Please try again.",
        variant: "destructive",
      });
    },
  });

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      fullText += pageText + "\n\n";
    }
    return fullText;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast({ title: "Invalid File", description: "Please upload a PDF file.", variant: "destructive" });
      return;
    }
    setUploadingDoc(true);
    try {
      const text = await extractTextFromPDF(file);
      const newDoc: UploadedDocument = {
        type: selectedDocType,
        name: file.name,
        text,
        size: file.size,
      };
      setUploadedDocs(prev => [...prev.filter(d => d.type !== selectedDocType), newDoc]);
      const docLabel = MATCHING_DOC_TYPES.find(t => t.id === selectedDocType)?.label || selectedDocType;
      toast({ title: `${docLabel} Uploaded`, description: `Extracted ${text.length} characters from ${file.name}` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to extract text from PDF.", variant: "destructive" });
    } finally {
      setUploadingDoc(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeDocument = (type: string) => {
    setUploadedDocs(prev => prev.filter(d => d.type !== type));
  };

  const handleStartAcceleratedMatching = () => {
    if (uploadedDocs.length === 0) {
      toast({ title: "No Documents", description: "Please upload at least one document.", variant: "destructive" });
      return;
    }
    const pitchDeck = uploadedDocs.find(d => d.type === "pitch_deck");
    const deckText = pitchDeck?.text || uploadedDocs[0]?.text || "";
    acceleratedMatchMutation.mutate({
      startupId: selectedStartupId || startups[0]?.id,
      deckText,
      documents: uploadedDocs,
    });
  };

  const { data: firmsResponse } = useQuery<{ data: InvestmentFirm[], total: number }>({
    queryKey: ["/api/firms"],
  });
  const firms = firmsResponse?.data ?? [];

  const { data: investorsResponse } = useQuery<{ data: Investor[], total: number }>({
    queryKey: ["/api/investors"],
  });
  const investors = investorsResponse?.data ?? [];

  const activeStartupId = selectedStartupId || startups[0]?.id;
  const activeStartup = startups.find(s => s.id === activeStartupId);

  const firmsMap = useMemo(
    () => firms.reduce((acc, f) => ({ ...acc, [f.id]: f }), {} as Record<string, InvestmentFirm>),
    [firms]
  );

  const investorsMap = useMemo(
    () => investors.reduce((acc, i) => ({ ...acc, [i.id]: i }), {} as Record<string, Investor>),
    [investors]
  );

  const generateMatchesMutation = useMutation({
    mutationFn: async (startupId: string) => {
      const response = await apiRequest("POST", "/api/matches/generate", { startupId, limit: 50 });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      toast({
        title: "Matches Generated",
        description: `Found ${data.matchCount} investor matches for your startup.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate matches. Please try again.",
        variant: "destructive",
      });
    },
  });

  const enhancedMatchMutation = useMutation({
    mutationFn: async (startupId: string) => {
      const response = await apiRequest("POST", "/api/matches/enhanced", { 
        startupId, 
        limit: 50,
        minScore: 20,
        includeInactive: false
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      toast({
        title: "Enhanced Matches Generated",
        description: `Found ${data.matchCount} AI-optimized investor matches.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate enhanced matches. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMatchMutation = useMutation({
    mutationFn: async ({ matchId, status }: { matchId: string; status: string }) => {
      return apiRequest("PATCH", `/api/matches/${matchId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
    },
  });

  const filteredMatches = useMemo(() => {
    let result = matches.filter(m => m.startupId === activeStartupId);
    if (statusFilter !== "all") {
      result = result.filter(m => m.status === statusFilter);
    }
    return result.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  }, [matches, activeStartupId, statusFilter]);

  const isLoading = startupsLoading || matchesLoading;
  const isPending = generateMatchesMutation.isPending || enhancedMatchMutation.isPending;

  const handleGenerateMatches = () => {
    if (!activeStartupId) return;
    if (useEnhancedMatching) {
      enhancedMatchMutation.mutate(activeStartupId);
    } else {
      generateMatchesMutation.mutate(activeStartupId);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[rgb(142,132,247)] animate-spin" />
      </div>
    );
  }

  if (startups.length === 0) {
    return (
      <div className="text-center py-20">
        <Sparkles className="w-12 h-12 text-white/30 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">No Startups Yet</h3>
        <p className="text-white/50 mb-6">Create a startup profile to get AI-powered investor matches.</p>
        <Link href="/app/my-startups">
          <Button className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80">
            <Rocket className="h-4 w-4 mr-2" />
            Create Startup
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-light text-white mb-2">
            <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>AI-Powered</span> Investor Matching
          </h2>
          <p className="text-white/60">Find investors aligned with your startup using advanced algorithms</p>
        </div>
        <Button
          onClick={() => navigate("/app/matches")}
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10"
          data-testid="button-open-matches"
        >
          <ArrowUpRight className="w-4 h-4 mr-2" />
          Full View
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Select value={activeStartupId} onValueChange={setSelectedStartupId}>
          <SelectTrigger className="w-[200px] bg-white/5 border-white/10 text-white" data-testid="select-startup">
            <SelectValue placeholder="Select startup" />
          </SelectTrigger>
          <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
            {startups.map((startup) => (
              <SelectItem key={startup.id} value={startup.id} className="text-white">
                {startup.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] bg-white/5 border-white/10 text-white" data-testid="select-status">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
            <SelectItem value="all" className="text-white">All Matches</SelectItem>
            <SelectItem value="suggested" className="text-white">Suggested</SelectItem>
            <SelectItem value="saved" className="text-white">Saved</SelectItem>
            <SelectItem value="contacted" className="text-white">Contacted</SelectItem>
            <SelectItem value="passed" className="text-white">Passed</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
          <Brain className="w-4 h-4 text-[rgb(142,132,247)]" />
          <span className="text-sm text-white/70">Enhanced AI</span>
          <Switch
            checked={useEnhancedMatching}
            onCheckedChange={setUseEnhancedMatching}
            data-testid="switch-enhanced-matching"
          />
        </div>

        <Button
          onClick={handleGenerateMatches}
          disabled={!activeStartupId || isPending}
          className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
          data-testid="button-generate-matches"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {useEnhancedMatching ? "Generate AI Matches" : "Generate Matches"}
        </Button>

        <Button
          onClick={() => setShowAccelerated(!showAccelerated)}
          variant="outline"
          className={`border-white/20 text-white hover:bg-white/10 ${showAccelerated ? 'bg-[rgb(142,132,247)]/20' : ''}`}
          data-testid="button-toggle-accelerated"
        >
          <Zap className="h-4 w-4 mr-2" />
          Accelerated
        </Button>
      </div>

      {showAccelerated && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 rounded-2xl border border-white/10 bg-white/5"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-light text-white">Accelerated Matching</h3>
                <p className="text-white/50 text-sm">Upload documents for AI analysis</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {MATCHING_DOC_TYPES.map((docType) => {
                const isUploaded = uploadedDocs.some(d => d.type === docType.id);
                const DocIcon = docType.icon;
                return (
                  <button
                    key={docType.id}
                    onClick={() => {
                      setSelectedDocType(docType.id);
                      if (!isUploaded) fileInputRef.current?.click();
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                      selectedDocType === docType.id
                        ? 'border-[rgb(142,132,247)] bg-[rgb(142,132,247)]/20'
                        : isUploaded
                          ? 'border-[rgb(196,227,230)]/50 bg-[rgb(196,227,230)]/10'
                          : 'border-white/20 bg-white/5 hover:border-white/40'
                    }`}
                    data-testid={`doc-type-${docType.id}`}
                  >
                    <DocIcon className="w-4 h-4" style={{ color: docType.color }} />
                    <span className="text-white/80 text-xs">{docType.label}</span>
                    {isUploaded && (
                      <CheckCircle2 className="w-3 h-3 text-[rgb(196,227,230)]" />
                    )}
                  </button>
                );
              })}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileUpload}
              data-testid="input-doc-file"
            />

            {uploadedDocs.length > 0 && (
              <div className="space-y-2">
                {uploadedDocs.map((doc) => {
                  const docType = MATCHING_DOC_TYPES.find(t => t.id === doc.type);
                  const DocIcon = docType?.icon || FileText;
                  return (
                    <div key={doc.type} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10">
                      <div className="flex items-center gap-2">
                        <DocIcon className="w-4 h-4" style={{ color: docType?.color }} />
                        <div>
                          <p className="text-white/80 text-xs">{doc.name}</p>
                          <p className="text-white/40 text-xs">{(doc.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-white/40 hover:text-red-400"
                        onClick={() => removeDocument(doc.type)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {uploadedDocs.length === 0 && (
              <div 
                className="border-2 border-dashed border-white/20 rounded-xl p-4 text-center cursor-pointer hover:border-[rgb(142,132,247)]/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                data-testid="upload-doc-area"
              >
                {uploadingDoc ? (
                  <Loader2 className="w-6 h-6 mx-auto text-[rgb(142,132,247)] animate-spin mb-2" />
                ) : (
                  <Upload className="w-6 h-6 mx-auto text-white/40 mb-2" />
                )}
                <p className="text-white/60 text-xs">Select a document type above, then click to upload</p>
              </div>
            )}

            <Button
              onClick={handleStartAcceleratedMatching}
              disabled={uploadedDocs.length === 0 || acceleratedMatchMutation.isPending}
              className="w-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
              data-testid="button-start-accelerated-matching"
            >
              {acceleratedMatchMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Brain className="w-4 h-4 mr-2" />
              )}
              {acceleratedMatchMutation.isPending ? "Starting..." : `Analyze ${uploadedDocs.length} Document${uploadedDocs.length !== 1 ? 's' : ''}`}
            </Button>
          </div>

          <div className="space-y-4">
            <h4 className="text-white/80 font-medium">Recent Jobs</h4>
            {acceleratedJobsLoading ? (
              <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-[rgb(142,132,247)] animate-spin" />
              </div>
            ) : acceleratedJobs.length === 0 ? (
              <div className="p-4 rounded-xl border border-white/10 bg-white/5 text-center">
                <Zap className="w-8 h-8 mx-auto text-white/20 mb-2" />
                <p className="text-white/40 text-sm">No jobs yet</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {acceleratedJobs.slice(0, 5).map((job) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-3 rounded-xl border border-white/10 bg-white/5 cursor-pointer hover:border-[rgb(142,132,247)]/30 transition-colors"
                    onClick={() => setSelectedJob(job)}
                    data-testid={`accelerated-job-${job.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <Badge className={`border-0 text-xs ${
                        job.status === "complete" 
                          ? "bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)]"
                          : job.status === "failed"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)]"
                      }`}>
                        {job.status === "complete" ? "Complete" : 
                         job.status === "failed" ? "Failed" : 
                         job.currentStep || "Processing..."}
                      </Badge>
                      <span className="text-xs text-white/40">
                        {new Date(job.createdAt!).toLocaleDateString()}
                      </span>
                    </div>
                    {job.status !== "complete" && job.status !== "failed" && (
                      <Progress value={job.progress || 0} className="h-1 mt-2 bg-white/10" />
                    )}
                    {job.status === "complete" && job.matchResults && (
                      <p className="text-white/60 text-xs mt-2">
                        Found {(job.matchResults as any[]).length} matches
                      </p>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {currentSelectedJob && currentSelectedJob.status === "complete" && currentSelectedJob.matchResults && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-2xl border border-white/10 bg-white/5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-light text-white">
              AI-Generated Matches ({(currentSelectedJob.matchResults as any[]).length})
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="text-white/50"
              onClick={() => setSelectedJob(null)}
            >
              <XCircle className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(currentSelectedJob.matchResults as any[]).slice(0, 6).map((result: any, idx: number) => (
              <motion.div
                key={result.investorId || result.firmProfile?.id || idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="p-4 rounded-xl border border-white/10 bg-white/5"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="text-sm font-light text-white">
                      {result.investorName || result.firmName || "Unknown"}
                    </h4>
                    {result.firmName && !result.isFirmMatch && (
                      <p className="text-xs text-white/50">{result.firmName}</p>
                    )}
                  </div>
                  <Badge className="bg-gradient-to-r from-[rgb(142,132,247)]/20 to-[rgb(251,194,213)]/20 text-white border-0 text-xs">
                    {result.matchScore}%
                  </Badge>
                </div>
                {result.matchReasons && result.matchReasons.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {result.matchReasons.slice(0, 2).map((reason: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs border-white/20 text-white/60">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
          {(currentSelectedJob.matchResults as any[]).length > 6 && (
            <div className="text-center mt-4">
              <Button
                onClick={() => navigate("/app/matches")}
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10"
              >
                View All Matches
                <ArrowUpRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}
        </motion.div>
      )}

      {filteredMatches.length === 0 ? (
        <div className="text-center py-16">
          <Target className="w-12 h-12 text-white/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Matches Yet</h3>
          <p className="text-white/50 mb-4">Click "Generate Matches" to find investors for your startup.</p>
          <p className="text-white/40 text-sm">Enable "Enhanced AI" for deeper semantic matching across 24 industry domains.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredMatches.slice(0, 9).map((match, index) => (
            <DomainMatchCard
              key={match.id}
              match={match}
              firm={match.firmId ? firmsMap[match.firmId] : undefined}
              investor={match.investorId ? investorsMap[match.investorId] : undefined}
              startup={activeStartup}
              onSave={() => updateMatchMutation.mutate({ matchId: match.id, status: "saved" })}
              onPass={() => updateMatchMutation.mutate({ matchId: match.id, status: "passed" })}
              index={index}
            />
          ))}
        </div>
      )}

      {filteredMatches.length > 9 && (
        <div className="text-center pt-4">
          <Button
            onClick={() => navigate("/app/matches")}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
          >
            View All {filteredMatches.length} Matches
            <ArrowUpRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}

function DatabaseTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [stageFilter, setStageFilter] = useState("All Stages");
  const [classificationFilter, setClassificationFilter] = useState("All");
  const [locationFilter, setLocationFilter] = useState("All Locations");
  const [currentPage, setCurrentPage] = useState(1);
  const [isEnriching, setIsEnriching] = useState(false);
  const pageSize = 20;
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: investorsResponse, isLoading: loadingInvestors, refetch: refetchInvestors } = useQuery<{ data: Investor[], total: number }>({
    queryKey: ["/api/investors", { search: searchQuery, page: currentPage, limit: pageSize }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      params.set("offset", String((currentPage - 1) * pageSize));
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim());
      }
      const res = await fetch(`/api/investors?${params}`);
      if (!res.ok) throw new Error("Failed to fetch investors");
      return res.json();
    },
    enabled: entityType === "all" || entityType === "investors",
  });

  const { data: firmsResponse, isLoading: loadingFirms, refetch: refetchFirms } = useQuery<{ data: InvestmentFirm[], total: number }>({
    queryKey: ["/api/firms", { search: searchQuery, classification: classificationFilter, page: currentPage, limit: pageSize }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      params.set("offset", String((currentPage - 1) * pageSize));
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim());
      }
      if (classificationFilter && classificationFilter !== "All") {
        params.set("classification", classificationFilter);
      }
      const res = await fetch(`/api/firms?${params}`);
      if (!res.ok) throw new Error("Failed to fetch firms");
      return res.json();
    },
    enabled: entityType === "all" || entityType === "firms",
  });

  const { data: businessmenResponse, isLoading: loadingBusinessmen, refetch: refetchBusinessmen } = useQuery<{ data: Businessman[], total: number }>({
    queryKey: ["/api/businessmen", { search: searchQuery, page: currentPage, limit: pageSize }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      params.set("offset", String((currentPage - 1) * pageSize));
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim());
      }
      const res = await fetch(`/api/businessmen?${params}`);
      if (!res.ok) throw new Error("Failed to fetch businessmen");
      return res.json();
    },
    enabled: entityType === "all" || entityType === "businessmen",
  });

  const startInvestorEnrichment = useMutation({
    mutationFn: async () => {
      try {
        setIsEnriching(true);
        const res = await apiRequest("POST", "/api/admin/enrichment/investors/start", {
          batchSize: 10,
          onlyIncomplete: true,
        });
        const data = await res.json();
        return data;
      } catch (error) {
        setIsEnriching(false);
        throw error;
      }
    },
    onSuccess: (data: any) => {
      toast({ title: "Deep Research Started", description: `Processing ${data.totalRecords || "batch of"} investors...` });
      setTimeout(() => {
        setIsEnriching(false);
        refetchInvestors();
      }, 5000);
    },
    onError: (error: any) => {
      setIsEnriching(false);
      toast({ title: "Error", description: error?.message || "Failed to start enrichment", variant: "destructive" });
    },
  });

  const startFirmEnrichment = useMutation({
    mutationFn: async () => {
      try {
        setIsEnriching(true);
        const res = await apiRequest("POST", "/api/admin/enrichment/batch/start", {
          batchSize: 10,
          onlyMissingData: true,
          enrichmentType: "full_enrichment",
        });
        const data = await res.json();
        return data;
      } catch (error) {
        setIsEnriching(false);
        throw error;
      }
    },
    onSuccess: (data: any) => {
      toast({ title: "Deep Research Started", description: `Processing ${data.totalRecords || "batch of"} firms...` });
      setTimeout(() => {
        setIsEnriching(false);
        refetchFirms();
      }, 5000);
    },
    onError: (error: any) => {
      setIsEnriching(false);
      toast({ title: "Error", description: error?.message || "Failed to start enrichment", variant: "destructive" });
    },
  });

  const startBusinessmenEnrichment = useMutation({
    mutationFn: async () => {
      try {
        setIsEnriching(true);
        const res = await apiRequest("POST", "/api/admin/businessmen/deep-research", { batchSize: 10 });
        const data = await res.json();
        return data;
      } catch (error) {
        setIsEnriching(false);
        throw error;
      }
    },
    onSuccess: (data: any) => {
      setIsEnriching(false);
      toast({ title: "Deep Research Complete", description: `Enriched ${data.enriched || 0} of ${data.total || "batch"} businessmen` });
      refetchBusinessmen();
    },
    onError: (error: any) => {
      setIsEnriching(false);
      toast({ title: "Error", description: error?.message || "Failed to start enrichment", variant: "destructive" });
    },
  });

  const addContactMutation = useMutation({
    mutationFn: async (data: { type: string; investor?: Investor; firm?: InvestmentFirm; businessman?: Businessman }) => {
      const contactData = data.investor 
        ? {
            type: "investor",
            firstName: data.investor.firstName || "Unknown",
            lastName: data.investor.lastName || "",
            email: data.investor.email,
            title: data.investor.title,
            linkedinUrl: data.investor.linkedinUrl,
            sourceType: "investor",
            sourceInvestorId: data.investor.id,
            pipelineStage: "sourced",
          }
        : data.firm ? {
            type: "other",
            firstName: data.firm?.name || "Unknown Firm",
            email: data.firm?.emails?.[0]?.value,
            company: data.firm?.name,
            linkedinUrl: data.firm?.linkedinUrl,
            sourceType: "firm",
            sourceFirmId: data.firm?.id,
            pipelineStage: "sourced",
          }
        : {
            type: "other",
            firstName: data.businessman?.firstName || "Unknown",
            lastName: data.businessman?.lastName || "",
            company: data.businessman?.company,
            linkedinUrl: data.businessman?.linkedinUrl,
            sourceType: "businessman",
            pipelineStage: "sourced",
          };
      return apiRequest("POST", "/api/contacts", contactData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact Added", description: "Added to your CRM pipeline." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add contact.", variant: "destructive" });
    },
  });

  const investors = investorsResponse?.data ?? [];
  const firms = firmsResponse?.data ?? [];
  const businessmen = businessmenResponse?.data ?? [];
  const isLoading = loadingInvestors || loadingFirms || loadingBusinessmen;

  const filteredInvestors = useMemo(() => {
    if (stageFilter === "All Stages") return investors;
    const normalizedFilter = stageFilter.toLowerCase();
    return investors.filter(inv => 
      inv.stages?.some((s: string) => s.toLowerCase() === normalizedFilter)
    );
  }, [investors, stageFilter]);

  const filteredBusinessmen = useMemo(() => {
    if (locationFilter === "All Locations") return businessmen;
    const normalizedFilter = locationFilter.toLowerCase();
    return businessmen.filter(b => 
      b.location?.toLowerCase().includes(normalizedFilter)
    );
  }, [businessmen, locationFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            placeholder="Search investors, firms, businessmen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
            data-testid="input-search-database"
          />
        </div>
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="w-[180px] bg-white/5 border-white/10 text-white" data-testid="select-entity-type">
            <SelectValue placeholder="Entity type" />
          </SelectTrigger>
          <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
            {entityTypes.map((type) => (
              <SelectItem key={type.value} value={type.value} className="text-white">
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(entityType === "all" || entityType === "investors") && (
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[160px] bg-white/5 border-white/10 text-white" data-testid="select-stage-filter">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
              {investorStages.map((stage) => (
                <SelectItem key={stage} value={stage} className="text-white">
                  {stage}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(entityType === "all" || entityType === "firms") && (
          <Select value={classificationFilter} onValueChange={setClassificationFilter}>
            <SelectTrigger className="w-[180px] bg-white/5 border-white/10 text-white" data-testid="select-classification-filter">
              <SelectValue placeholder="Classification" />
            </SelectTrigger>
            <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
              {firmClassifications.map((classification) => (
                <SelectItem key={classification} value={classification} className="text-white">
                  {classification}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(entityType === "all" || entityType === "businessmen") && (
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-[160px] bg-white/5 border-white/10 text-white" data-testid="select-location-filter">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
              {businessLocations.map((location) => (
                <SelectItem key={location} value={location} className="text-white">
                  {location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {user?.isAdmin && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10" data-testid="button-deep-research-menu">
                  {isEnriching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Deep Research
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[rgb(30,30,30)] border-white/10">
                <DropdownMenuItem
                  className="text-white hover:bg-white/10 cursor-pointer"
                  onClick={() => startInvestorEnrichment.mutate()}
                  disabled={isEnriching}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Enrich Investors
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-white hover:bg-white/10 cursor-pointer"
                  onClick={() => startFirmEnrichment.mutate()}
                  disabled={isEnriching}
                >
                  <Building2 className="h-4 w-4 mr-2" />
                  Enrich Firms
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-white hover:bg-white/10 cursor-pointer"
                  onClick={() => startBusinessmenEnrichment.mutate()}
                  disabled={isEnriching}
                >
                  <Network className="h-4 w-4 mr-2" />
                  Enrich Businessmen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10" data-testid="button-url-health-menu">
                  URL Health
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-[rgb(30,30,30)] border-white/10 p-2 space-y-1">
                <UrlHealthButton entityScope="investmentFirms" label="Check Firm URLs" />
                <UrlHealthButton entityScope="investors" label="Check Investor URLs" />
                <UrlHealthButton entityScope="businessmen" label="Check Businessmen URLs" />
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {user?.isAdmin && (
        <EnrichmentProgressPanel 
          entityType={entityType === "all" ? "all" : entityType as any}
          onComplete={() => {
            refetchInvestors();
            refetchFirms();
            refetchBusinessmen();
          }}
        />
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-[rgb(142,132,247)] animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {(entityType === "all" || entityType === "firms") && firms.length > 0 && (
            <div>
              <h3 className="text-lg font-light text-white mb-4 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[rgb(142,132,247)]" />
                Investment Firms
                <Badge variant="secondary" className="bg-white/10 text-white/70">
                  {firmsResponse?.total || firms.length}
                </Badge>
              </h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {firms.slice(0, 12).map((firm) => (
                  <motion.div
                    key={firm.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
                    data-testid={`firm-card-${firm.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <Link href={`/app/firms/${firm.id}`}>
                            <h4 className="text-white font-medium text-sm truncate hover:text-[rgb(142,132,247)] transition-colors">
                              {firm.name}
                            </h4>
                          </Link>
                          <p className="text-white/50 text-xs truncate">{firm.type || "Investment Firm"}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => addContactMutation.mutate({ type: "firm", firm })}
                        data-testid={`add-firm-${firm.id}`}
                      >
                        <UserPlus className="h-4 w-4 text-[rgb(142,132,247)]" />
                      </Button>
                    </div>
                    {firm.sectors && firm.sectors.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {firm.sectors.slice(0, 3).map((sector: string) => (
                          <Badge key={sector} variant="secondary" className="bg-white/10 text-white/60 text-xs">
                            {sector}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {(entityType === "all" || entityType === "investors") && filteredInvestors.length > 0 && (
            <div>
              <h3 className="text-lg font-light text-white mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-[rgb(196,227,230)]" />
                Individual Investors
                <Badge variant="secondary" className="bg-white/10 text-white/70">
                  {filteredInvestors.length}
                </Badge>
                {stageFilter !== "All Stages" && (
                  <Badge variant="outline" className="border-[rgb(142,132,247)] text-[rgb(142,132,247)]">
                    {stageFilter}
                  </Badge>
                )}
              </h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {filteredInvestors.slice(0, 12).map((investor) => {
                  const displayName = investor.firstName && investor.lastName 
                    ? `${investor.firstName} ${investor.lastName}`
                    : investor.firstName || "Unknown Investor";
                  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
                  
                  return (
                    <motion.div
                      key={investor.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
                      data-testid={`investor-card-${investor.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border border-white/20">
                            <AvatarImage src={investor.avatar || ""} />
                            <AvatarFallback className="bg-white/10 text-white text-sm">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <Link href={`/app/investors/${investor.id}`}>
                              <h4 className="text-white font-medium text-sm truncate hover:text-[rgb(142,132,247)] transition-colors">
                                {displayName}
                              </h4>
                            </Link>
                            <p className="text-white/50 text-xs truncate">{investor.title || ""}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => addContactMutation.mutate({ type: "investor", investor })}
                            data-testid={`add-investor-${investor.id}`}
                          >
                            <UserPlus className="h-4 w-4 text-[rgb(142,132,247)]" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        {investor.linkedinUrl && (
                          <a 
                            href={investor.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/40 hover:text-[rgb(142,132,247)] transition-colors"
                          >
                            <Linkedin className="h-4 w-4" />
                          </a>
                        )}
                        {investor.twitterUrl && (
                          <a 
                            href={investor.twitterUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/40 hover:text-[rgb(142,132,247)] transition-colors"
                          >
                            <Twitter className="h-4 w-4" />
                          </a>
                        )}
                        {investor.stages && investor.stages.length > 0 && (
                          <div className="flex gap-1 ml-auto">
                            {investor.stages.slice(0, 2).map((stage: string) => (
                              <Badge key={stage} variant="secondary" className="bg-white/10 text-white/50 text-xs">
                                {stage}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {(entityType === "all" || entityType === "businessmen") && filteredBusinessmen.length > 0 && (
            <div>
              <h3 className="text-lg font-light text-white mb-4 flex items-center gap-2">
                <Network className="h-5 w-5 text-[rgb(251,194,213)]" />
                Business Leaders
                <Badge variant="secondary" className="bg-white/10 text-white/70">
                  {filteredBusinessmen.length}
                </Badge>
                {locationFilter !== "All Locations" && (
                  <Badge variant="outline" className="border-[rgb(251,194,213)] text-[rgb(251,194,213)]">
                    {locationFilter}
                  </Badge>
                )}
              </h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {filteredBusinessmen.slice(0, 12).map((businessman) => {
                  const displayName = businessman.firstName && businessman.lastName 
                    ? `${businessman.firstName} ${businessman.lastName}`
                    : businessman.firstName || "Unknown";
                  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
                  
                  return (
                    <motion.div
                      key={businessman.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
                      data-testid={`businessman-card-${businessman.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border border-white/20">
                            <AvatarFallback className="bg-white/10 text-white text-sm">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <Link href={`/app/businessmen/${businessman.id}`}>
                              <h4 className="text-white font-medium text-sm truncate hover:text-[rgb(142,132,247)] transition-colors">
                                {displayName}
                              </h4>
                            </Link>
                            <p className="text-white/50 text-xs truncate">{businessman.company || ""}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => addContactMutation.mutate({ type: "businessman", businessman })}
                            data-testid={`add-businessman-${businessman.id}`}
                          >
                            <UserPlus className="h-4 w-4 text-[rgb(142,132,247)]" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        {businessman.linkedinUrl && (
                          <a 
                            href={businessman.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/40 hover:text-[rgb(142,132,247)] transition-colors"
                          >
                            <Linkedin className="h-4 w-4" />
                          </a>
                        )}
                        {businessman.location && (
                          <Badge variant="secondary" className="bg-white/10 text-white/50 text-xs ml-auto">
                            {businessman.location}
                          </Badge>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {firms.length === 0 && filteredInvestors.length === 0 && filteredBusinessmen.length === 0 && (
            <div className="text-center py-16">
              <Database className="w-12 h-12 text-white/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Results</h3>
              <p className="text-white/50">Try adjusting your search or filters.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PitchDeckTab() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
        toast({ title: "Invalid file", description: "Please upload a PDF file", variant: "destructive" });
        return;
      }
      setFile(selectedFile);
      setAnalysis(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    try {
      const { extractTextFromPDF } = await import("@/lib/pdf-parser");
      const text = await extractTextFromPDF(file);
      
      const response = await apiRequest("POST", "/api/pitch-deck/full-analysis", { 
        pitchDeckContent: text
      });
      
      if (!response.ok) throw new Error("Analysis failed");
      const result = await response.json();
      setAnalysis(result);
      toast({ title: "Analysis complete", description: "Your pitch deck has been analyzed" });
    } catch (error) {
      toast({ title: "Analysis failed", description: "Please try again", variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-light text-white mb-2">
            <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>Pitch Deck</span> Analysis
          </h2>
          <p className="text-white/60">Upload your pitch deck for AI-powered investment analysis</p>
        </div>
        <Button
          onClick={() => navigate("/app/pitch-deck-analysis")}
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10"
          data-testid="button-open-pitch-deck"
        >
          <ArrowUpRight className="w-4 h-4 mr-2" />
          Full View
        </Button>
      </div>

      {!analysis ? (
        <div className="grid lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-2xl border border-white/10 bg-white/5"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:border-[rgb(142,132,247)]/50 transition-colors"
            >
              {file ? (
                <div className="space-y-2">
                  <FileText className="w-12 h-12 text-[rgb(142,132,247)] mx-auto" />
                  <p className="text-white font-medium">{file.name}</p>
                  <p className="text-white/50 text-sm">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <FileText className="w-12 h-12 text-white/30 mx-auto" />
                  <p className="text-white/60">Click to upload your pitch deck</p>
                  <p className="text-white/40 text-sm">PDF format only</p>
                </div>
              )}
            </div>
            
            {file && (
              <div className="mt-4 flex gap-3">
                <Button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="flex-1 bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                  data-testid="button-analyze-deck"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Analyze Deck
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setFile(null)}
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </motion.div>

          <div className="space-y-4">
            {[
              { icon: FileText, title: "Multi-Perspective Review", desc: "VC, consultant, and business owner perspectives", color: "rgb(142,132,247)" },
              { icon: Target, title: "Quantified Scoring", desc: "Detailed scores across market, team, financials", color: "rgb(196,227,230)" },
              { icon: TrendingUp, title: "Investment Readiness", desc: "Red flags, best practices, recommendations", color: "rgb(251,194,213)" },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-white/5"
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${item.color}20` }}>
                  <item.icon className="w-5 h-5" style={{ color: item.color }} />
                </div>
                <div>
                  <h4 className="text-white font-medium text-sm">{item.title}</h4>
                  <p className="text-white/50 text-xs">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex items-center justify-between p-6 rounded-2xl border border-white/10 bg-white/5">
            <div className="flex items-center gap-4">
              <div className={`text-4xl font-bold ${getScoreColor(analysis.overallScore || 0)}`}>
                {analysis.overallGrade || "N/A"}
              </div>
              <div>
                <p className="text-white font-medium">{analysis.extractedInfo?.companyName || file?.name}</p>
                <p className="text-white/50 text-sm">Overall Score: {analysis.overallScore || 0}/100</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => { setFile(null); setAnalysis(null); }}
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10"
              >
                New Analysis
              </Button>
              <Button
                onClick={() => navigate("/app/pitch-deck-analysis")}
                className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
              >
                View Full Report
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {analysis.evaluations?.slice(0, 4).map((evaluation: any, i: number) => (
              <div key={i} className="p-4 rounded-xl border border-white/10 bg-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium text-sm">{evaluation.evaluatorName}</span>
                  <span className={`font-bold ${getScoreColor(evaluation.overallScore)}`}>{evaluation.grade}</span>
                </div>
                <Progress value={evaluation.overallScore} className="h-2" />
                <p className="text-white/50 text-xs mt-2 line-clamp-2">{evaluation.summary}</p>
              </div>
            ))}
          </div>

          {analysis.executiveSummary && (
            <div className="p-4 rounded-xl border border-white/10 bg-white/5">
              <h4 className="text-white font-medium mb-2">Executive Summary</h4>
              <p className="text-white/60 text-sm">{analysis.executiveSummary}</p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function InterviewTab() {
  const [, navigate] = useLocation();
  
  const { data: interviews = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/interviews"],
  });

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const completedInterviews = interviews.filter((i: any) => i.status === "completed");
  const inProgressInterviews = interviews.filter((i: any) => i.status === "in_progress");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-light text-white mb-2">
            <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>Interview</span> Assistant
          </h2>
          <p className="text-white/60">AI-powered investor readiness evaluation</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => navigate("/app/interview")}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
          >
            <ArrowUpRight className="w-4 h-4 mr-2" />
            Full View
          </Button>
          <Button
            onClick={() => navigate("/app/interview")}
            className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
            data-testid="button-start-interview"
          >
            <Mic className="w-4 h-4 mr-2" />
            New Interview
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {inProgressInterviews.length > 0 && (
            <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10">
              <h3 className="text-yellow-400 font-medium mb-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                In Progress
              </h3>
              <div className="space-y-2">
                {inProgressInterviews.map((interview: any) => (
                  <div 
                    key={interview.id}
                    onClick={() => navigate("/app/interview")}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
                  >
                    <div>
                      <p className="text-white font-medium text-sm">{interview.companyName || "Unnamed"}</p>
                      <p className="text-white/50 text-xs">{interview.stage || "Interview"}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-yellow-400">
                      Continue
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {completedInterviews.length > 0 ? (
            <div className="p-4 rounded-xl border border-white/10 bg-white/5">
              <h3 className="text-white font-medium mb-3">Recent Interviews</h3>
              <div className="space-y-2">
                {completedInterviews.slice(0, 5).map((interview: any) => (
                  <div 
                    key={interview.id}
                    onClick={() => navigate("/app/interview")}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">{interview.companyName || "Unnamed"}</p>
                        <p className="text-white/50 text-xs">
                          {interview.createdAt ? new Date(interview.createdAt).toLocaleDateString() : ""}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-white/10">
                      {interview.stage || "Completed"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : !isLoading && (
            <div className="p-8 rounded-xl border border-white/10 bg-white/5 text-center">
              <MessageSquare className="w-12 h-12 text-white/30 mx-auto mb-4" />
              <h3 className="text-white font-medium mb-2">No interviews yet</h3>
              <p className="text-white/50 text-sm mb-4">Start your first mock interview to practice your pitch</p>
              <Button
                onClick={() => navigate("/app/interview")}
                className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
              >
                <Mic className="w-4 h-4 mr-2" />
                Start Interview
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {[
            { icon: Users, title: "Profile Setup", desc: "Enter company details", color: "rgb(142,132,247)" },
            { icon: MessageSquare, title: "AI Interview", desc: "Structured conversation", color: "rgb(196,227,230)" },
            { icon: Target, title: "Get Scored", desc: "Quantified readiness", color: "rgb(251,194,213)" },
            { icon: CheckCircle2, title: "Feedback", desc: "Actionable recommendations", color: "rgb(254,212,92)" },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-white/5"
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${item.color}20` }}>
                <item.icon className="w-5 h-5" style={{ color: item.color }} />
              </div>
              <div>
                <h4 className="text-white font-medium text-sm">{item.title}</h4>
                <p className="text-white/50 text-xs">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

const disclosureLevels = [
  { value: "teaser", label: "Teaser", description: "Executive summary only", color: "rgb(196,227,230)" },
  { value: "cim", label: "CIM", description: "Confidential Information Memo", color: "rgb(142,132,247)" },
  { value: "detailed", label: "Detailed", description: "Full financials & legal", color: "rgb(251,194,213)" },
  { value: "confirmatory", label: "Confirmatory", description: "Final diligence docs", color: "rgb(254,212,92)" },
];

const documentCategories = [
  { value: "overview", label: "Overview & Pitch", icon: FileText },
  { value: "financials", label: "Financials", icon: TrendingUp },
  { value: "legal", label: "Legal", icon: Shield },
  { value: "cap_table", label: "Cap Table", icon: Users },
  { value: "market_strategy", label: "Market & Strategy", icon: Target },
  { value: "technical_ip", label: "Technical / IP", icon: Database },
];

function DataRoomTab() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomDescription, setNewRoomDescription] = useState("");

  const { data: rooms = [], isLoading: roomsLoading } = useQuery<DealRoom[]>({
    queryKey: ["/api/deal-rooms"],
  });

  const { data: accessGrants = [] } = useQuery<DealRoomAccessGrant[]>({
    queryKey: ["/api/deal-rooms", selectedRoom, "access-grants"],
    enabled: !!selectedRoom,
  });

  const { data: documents = [] } = useQuery<DealRoomDocument[]>({
    queryKey: ["/api/deal-rooms", selectedRoom, "documents"],
    enabled: !!selectedRoom,
  });

  const { data: auditEvents = [] } = useQuery<DealRoomAuditEvent[]>({
    queryKey: ["/api/deal-rooms", selectedRoom, "audit-events"],
    enabled: !!selectedRoom,
  });

  const { data: ndaAgreements = [] } = useQuery<DealRoomNdaAgreement[]>({
    queryKey: ["/api/deal-rooms", selectedRoom, "nda-agreements"],
    enabled: !!selectedRoom,
  });

  const createRoomMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/deal-rooms", {
        name: newRoomName,
        description: newRoomDescription,
        dealId: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deal-rooms"] });
      setShowCreateDialog(false);
      setNewRoomName("");
      setNewRoomDescription("");
      toast({ title: "Data room created", description: "Your institutional data room is ready." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create data room", variant: "destructive" });
    },
  });

  const room = rooms.find(r => r.id === selectedRoom);
  const pendingAccess = accessGrants.filter(g => g.status === "pending");
  const approvedAccess = accessGrants.filter(g => g.status === "approved");
  const signedNdas = ndaAgreements.filter(n => n.status === "active");

  const documentsByCategory = useMemo(() => {
    return documentCategories.map(cat => ({
      ...cat,
      documents: documents.filter(d => d.category === cat.value),
    }));
  }, [documents]);

  const documentsByDisclosure = useMemo(() => {
    return disclosureLevels.map(level => ({
      ...level,
      count: documents.filter(d => d.disclosureLevel === level.value).length,
    }));
  }, [documents]);

  if (roomsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="text-center py-20">
        <FolderOpen className="w-16 h-16 text-white/20 mx-auto mb-6" />
        <h2 className="text-2xl font-light text-white mb-3">Institutional Data Room</h2>
        <p className="text-white/50 max-w-md mx-auto mb-8">
          Create a secure, progressive-disclosure data room for investor due diligence.
          Control access, track engagement, and manage NDA compliance.
        </p>
        <Button 
          onClick={() => setShowCreateDialog(true)}
          className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Data Room
        </Button>

        {showCreateDialog && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreateDialog(false)}>
            <div className="bg-[rgb(25,25,25)] border border-white/10 rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-medium text-white mb-4">Create Data Room</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-white/70 text-sm mb-2 block">Room Name</label>
                  <Input
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="Series A Data Room"
                    data-testid="input-room-name"
                  />
                </div>
                <div>
                  <label className="text-white/70 text-sm mb-2 block">Description</label>
                  <Input
                    value={newRoomDescription}
                    onChange={(e) => setNewRoomDescription(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                    placeholder="Due diligence materials for Series A"
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="flex-1 border-white/10 text-white">
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => createRoomMutation.mutate()}
                    disabled={!newRoomName.trim() || createRoomMutation.isPending}
                    className="flex-1 bg-[rgb(142,132,247)]"
                    data-testid="button-create-room"
                  >
                    {createRoomMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Create
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!selectedRoom) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-medium text-white">Your Data Rooms</h2>
            <p className="text-white/50 text-sm">Secure document sharing with progressive disclosure</p>
          </div>
          <Button 
            onClick={() => setShowCreateDialog(true)}
            className="bg-[rgb(142,132,247)]"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Room
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room, index) => (
            <motion.div
              key={room.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              onClick={() => setSelectedRoom(room.id)}
              className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              data-testid={`room-card-${room.id}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[rgb(142,132,247)]/20 to-[rgb(251,194,213)]/20 flex items-center justify-center">
                  <FolderOpen className="w-6 h-6 text-[rgb(142,132,247)]" />
                </div>
                <Badge variant="secondary" className={`text-xs ${room.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/60'}`}>
                  {room.status}
                </Badge>
              </div>
              <h3 className="text-white font-medium mb-1">{room.name}</h3>
              <p className="text-white/50 text-sm mb-4 line-clamp-2">{room.description || "No description"}</p>
              <div className="flex items-center gap-4 text-xs text-white/40">
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  Documents
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  Investors
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setSelectedRoom(null)}
            className="text-white/60 hover:text-white"
          >
            <ArrowRight className="w-4 h-4 mr-1 rotate-180" />
            Back
          </Button>
          <div>
            <h2 className="text-xl font-medium text-white">{room?.name}</h2>
            <p className="text-white/50 text-sm">{room?.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate(`/app/deal-rooms/${selectedRoom}`)}
            className="border-white/10 text-white"
          >
            Full View
            <ArrowUpRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
            <h3 className="text-white font-medium mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-[rgb(142,132,247)]" />
              Progressive Disclosure
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {documentsByDisclosure.map((level) => (
                <div 
                  key={level.value}
                  className="p-4 rounded-xl border border-white/10 bg-white/5"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge 
                      variant="secondary" 
                      className="text-xs"
                      style={{ backgroundColor: `${level.color}20`, color: level.color }}
                    >
                      {level.label}
                    </Badge>
                    <span className="text-white font-medium">{level.count}</span>
                  </div>
                  <p className="text-white/50 text-xs">{level.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
            <h3 className="text-white font-medium mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-[rgb(196,227,230)]" />
              Documents by Category
            </h3>
            <div className="space-y-3">
              {documentsByCategory.map((cat) => (
                <div 
                  key={cat.value}
                  className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                      <cat.icon className="w-4 h-4 text-white/60" />
                    </div>
                    <span className="text-white text-sm">{cat.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-white/10 text-white/60">
                      {cat.documents.length} docs
                    </Badge>
                    <Button size="sm" variant="ghost" className="text-white/40 hover:text-white">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
            <h3 className="text-white font-medium mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-[rgb(251,194,213)]" />
              Access Requests
            </h3>
            {pendingAccess.length > 0 ? (
              <div className="space-y-2">
                {pendingAccess.slice(0, 3).map((grant) => (
                  <div key={grant.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                        <Clock className="w-4 h-4 text-yellow-400" />
                      </div>
                      <div>
                        <p className="text-white text-sm">Investor Request</p>
                        <p className="text-white/50 text-xs">{grant.disclosureLevel}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="text-emerald-400 hover:bg-emerald-500/20">
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/20">
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-white/40 text-sm text-center py-4">No pending requests</p>
            )}
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-sm">
              <span className="text-white/50">{approvedAccess.length} approved investors</span>
              <span className="text-white/50">{signedNdas.length} NDAs signed</span>
            </div>
          </div>

          <div className="p-6 rounded-2xl border border-white/10 bg-white/5">
            <h3 className="text-white font-medium mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-[rgb(254,212,92)]" />
              Recent Activity
            </h3>
            {auditEvents.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {auditEvents.slice(0, 5).map((event) => (
                  <div key={event.id} className="flex items-start gap-2 p-2 rounded-lg">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${
                      event.action === 'view' ? 'bg-blue-400' :
                      event.action === 'download' ? 'bg-emerald-400' :
                      event.action === 'nda_signed' ? 'bg-purple-400' :
                      'bg-white/40'
                    }`} />
                    <div>
                      <p className="text-white text-xs">{event.action.replace('_', ' ')}</p>
                      <p className="text-white/40 text-xs">
                        {event.createdAt ? new Date(event.createdAt).toLocaleString() : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-white/40 text-sm text-center py-4">No activity yet</p>
            )}
          </div>

          <div className="p-4 rounded-xl border border-[rgb(142,132,247)]/30 bg-[rgb(142,132,247)]/10">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-4 h-4 text-[rgb(142,132,247)]" />
              <span className="text-white text-sm font-medium">Security Features</span>
            </div>
            <ul className="text-white/60 text-xs space-y-1">
              <li className="flex items-center gap-2">
                <FileCheck className="w-3 h-3" /> Dynamic watermarking
              </li>
              <li className="flex items-center gap-2">
                <Shield className="w-3 h-3" /> NDA enforcement
              </li>
              <li className="flex items-center gap-2">
                <Activity className="w-3 h-3" /> Full audit trail
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FounderWorkspace() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: summary, isLoading: summaryLoading } = useQuery<DashboardSummary>({
    queryKey: ["/api/dashboard/summary"],
    enabled: !!user,
  });

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        setLocation("/app");
      } else if (user && !user.onboardingCompleted) {
        setLocation("/app/onboarding");
      }
    }
  }, [authLoading, isAuthenticated, user, setLocation]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <AppLayout 
      title="Fundraising Workspace"
      subtitle="Your unified command center for investor outreach"
      heroHeight="25vh"
      videoUrl={videoBackgrounds.dashboard}
    >
      <div className="py-8 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex justify-center mb-8">
              <TabsList className="bg-white/5 border border-white/10 p-1 rounded-full">
                <WorkspaceTabTrigger value="overview" icon={LayoutDashboard}>
                  Overview
                </WorkspaceTabTrigger>
                <WorkspaceTabTrigger value="pipeline" icon={Kanban}>
                  Pipeline
                </WorkspaceTabTrigger>
                <WorkspaceTabTrigger value="matching" icon={Sparkles}>
                  Matching
                </WorkspaceTabTrigger>
                <WorkspaceTabTrigger value="database" icon={Database}>
                  Database
                </WorkspaceTabTrigger>
                <WorkspaceTabTrigger value="pitch-deck" icon={FileText}>
                  Pitch Deck
                </WorkspaceTabTrigger>
                <WorkspaceTabTrigger value="interview" icon={Mic}>
                  Interview
                </WorkspaceTabTrigger>
                <WorkspaceTabTrigger value="data-room" icon={FolderOpen}>
                  Data Room
                </WorkspaceTabTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-0">
              <OverviewTab summary={summary} isLoading={summaryLoading} />
            </TabsContent>

            <TabsContent value="pipeline" className="mt-0">
              <PipelineTab />
            </TabsContent>

            <TabsContent value="matching" className="mt-0">
              <MatchingTab />
            </TabsContent>

            <TabsContent value="database" className="mt-0">
              <DatabaseTab />
            </TabsContent>

            <TabsContent value="pitch-deck" className="mt-0">
              <PitchDeckTab />
            </TabsContent>

            <TabsContent value="interview" className="mt-0">
              <InterviewTab />
            </TabsContent>

            <TabsContent value="data-room" className="mt-0">
              <DataRoomTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
