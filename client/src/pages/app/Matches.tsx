import { useMemo, useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Target,
  Loader2,
  Sparkles,
  Search,
  Building2,
  Star,
  Mail,
  CheckCircle2,
  XCircle,
  Filter,
  ArrowRight,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Upload,
  FileText,
  Zap,
  Users,
  TrendingUp,
  Brain,
  Download,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Match, InvestmentFirm, Investor, Startup, AcceleratedMatchJob, StartupDocument } from "@shared/schema";
import { Link } from "wouter";
import { useLocation } from "wouter";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { useToast } from "@/hooks/use-toast";
import DomainMatchCard from "@/components/DomainMatchCard";
import * as pdfjsLib from "pdfjs-dist";

const statusFilters = [
  { value: "all", label: "All Matches" },
  { value: "suggested", label: "Suggested" },
  { value: "saved", label: "Saved" },
  { value: "contacted", label: "Contacted" },
  { value: "passed", label: "Passed" },
];

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export default function MatchesPage() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedStartupId, setSelectedStartupId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("standard");
  const [deckText, setDeckText] = useState("");
  const [uploadingDeck, setUploadingDeck] = useState(false);
  const [selectedJob, setSelectedJob] = useState<AcceleratedMatchJob | null>(null);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [useEnhancedMatching, setUseEnhancedMatching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: matches = [], isLoading: matchesLoading } = useQuery<Match[]>({
    queryKey: ["/api/matches"],
  });

  const { data: firmsResponse, isLoading: firmsLoading } = useQuery<{ data: InvestmentFirm[], total: number }>({
    queryKey: ["/api/firms"],
  });
  const firms = firmsResponse?.data ?? [];

  const { data: investorsResponse, isLoading: investorsLoading } = useQuery<{ data: Investor[], total: number }>({
    queryKey: ["/api/investors"],
  });
  const investors = investorsResponse?.data ?? [];

  const { data: startups = [], isLoading: startupsLoading } = useQuery<Startup[]>({
    queryKey: ["/api/startups/mine"],
  });

  // Get selected startup (use first if none selected)
  const activeStartupId = selectedStartupId || startups[0]?.id;
  const activeStartup = startups.find(s => s.id === activeStartupId);

  // Fetch documents for the selected startup
  const { data: startupDocuments = [] } = useQuery<StartupDocument[]>({
    queryKey: ["/api/startups", activeStartupId, "documents"],
    enabled: !!activeStartupId,
  });

  const documentCount = startupDocuments.length;
  const hasPitchDeck = startupDocuments.some(d => d.type === "pitch_deck");

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
    mutationFn: ({ id, status, feedback }: { id: string; status: string; feedback?: { rating?: string; reason?: string } }) =>
      apiRequest("PATCH", `/api/matches/${id}`, { status, feedback }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
    },
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
    mutationFn: async ({ startupId, deckText }: { startupId?: string; deckText: string }) => {
      const response = await apiRequest("POST", "/api/accelerated-matches", { startupId, deckText });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accelerated-matches"] });
      setSelectedJob(data);
      toast({
        title: "Accelerated Matching Started",
        description: "Analyzing your pitch deck and finding investor matches...",
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

  const extractTextFromPDF = useCallback(async (file: File): Promise<string> => {
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
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast({
        title: "Invalid File",
        description: "Please upload a PDF file.",
        variant: "destructive",
      });
      return;
    }

    setUploadingDeck(true);
    try {
      const text = await extractTextFromPDF(file);
      setDeckText(text);
      toast({
        title: "Pitch Deck Uploaded",
        description: `Extracted ${text.length} characters from ${file.name}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to extract text from PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingDeck(false);
    }
  };

  const handleStartAcceleratedMatching = () => {
    if (!deckText) {
      toast({
        title: "No Pitch Deck",
        description: "Please upload a pitch deck first.",
        variant: "destructive",
      });
      return;
    }
    acceleratedMatchMutation.mutate({
      startupId: selectedStartupId || startups[0]?.id,
      deckText,
    });
  };

  const handleGenerateMatches = () => {
    const startupId = selectedStartupId || startups[0]?.id;
    if (!startupId) {
      toast({
        title: "No Startup Selected",
        description: "Please create a startup profile first.",
        variant: "destructive",
      });
      return;
    }
    if (useEnhancedMatching) {
      enhancedMatchMutation.mutate(startupId);
    } else {
      generateMatchesMutation.mutate(startupId);
    }
  };

  const isGeneratingMatches = generateMatchesMutation.isPending || enhancedMatchMutation.isPending;

  const handleSaveMatch = (match: Match) => {
    updateMatchMutation.mutate({
      id: match.id,
      status: "saved",
      feedback: { rating: "positive" },
    });
  };

  const handlePassMatch = (match: Match) => {
    updateMatchMutation.mutate({
      id: match.id,
      status: "passed",
      feedback: { rating: "negative" },
    });
  };

  const handleContactMatch = (match: Match) => {
    updateMatchMutation.mutate({
      id: match.id,
      status: "contacted",
    });
    const investor = investorsMap[match.investorId || ""];
    if (investor?.email) {
      setLocation(`/app/outreach?investorId=${investor.id}`);
    }
  };

  const downloadMatchesReport = async () => {
    if (!selectedStartupId || matches.length === 0) {
      toast({
        title: "No matches to export",
        description: "Please select a startup and generate matches first.",
        variant: "destructive",
      });
      return;
    }

    setDownloadingReport(true);
    try {
      const selectedStartup = startups.find(s => s.id === selectedStartupId);
      
      // Backend now fetches matches server-side for security
      const response = await apiRequest("POST", `/api/startups/${selectedStartupId}/reports/matches`, {});
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to generate report");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(selectedStartup?.name || "Matches").replace(/[^a-zA-Z0-9]/g, "_")}_Investor_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Report downloaded",
        description: "Your investor matches report has been generated.",
      });
    } catch (error: any) {
      console.error("Report download error:", error);
      toast({
        title: "Download failed",
        description: error?.message || "Could not generate the report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingReport(false);
    }
  };

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (searchQuery) {
        const firm = firmsMap[m.firmId || ""];
        const investor = investorsMap[m.investorId || ""];
        const query = searchQuery.toLowerCase();
        const investorName = investor 
          ? [investor.firstName, investor.lastName].filter(Boolean).join(" ").toLowerCase()
          : "";
        if (
          !firm?.name?.toLowerCase().includes(query) &&
          !investorName.includes(query)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [matches, statusFilter, searchQuery, firmsMap, investorsMap]);

  const stats = useMemo(() => ({
    total: matches.length,
    saved: matches.filter(m => m.status === "saved").length,
    contacted: matches.filter(m => m.status === "contacted").length,
    avgScore: matches.length > 0 
      ? Math.round(matches.reduce((acc, m) => acc + (m.matchScore || 0), 0) / matches.length) 
      : 0,
  }), [matches]);

  const pageLoading = matchesLoading || firmsLoading || investorsLoading || startupsLoading;

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout
      title="Investor Matches"
      subtitle="AI-powered recommendations based on your startup profile"
      heroHeight="40vh"
      videoUrl={videoBackgrounds.matches}
    >
      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
            <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl">
              <TabsTrigger 
                value="standard" 
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[rgb(142,132,247)] data-[state=active]:to-[rgb(142,132,247)] data-[state=active]:text-white text-white/60 rounded-lg px-6"
                data-testid="tab-standard-matching"
              >
                <Target className="w-4 h-4 mr-2" />
                Standard Matching
              </TabsTrigger>
              <TabsTrigger 
                value="accelerated" 
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[rgb(142,132,247)] data-[state=active]:to-[rgb(251,194,213)] data-[state=active]:text-white text-white/60 rounded-lg px-6"
                data-testid="tab-accelerated-matching"
              >
                <Zap className="w-4 h-4 mr-2" />
                Accelerated
              </TabsTrigger>
            </TabsList>

            <TabsContent value="standard" className="mt-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                {[
                  { icon: Target, label: "Total Matches", value: stats.total, color: "rgb(142,132,247)" },
                  { icon: Star, label: "Saved", value: stats.saved, color: "rgb(251,194,213)" },
                  { icon: Mail, label: "Contacted", value: stats.contacted, color: "rgb(196,227,230)" },
                  { icon: Sparkles, label: "Avg Score", value: `${stats.avgScore}%`, color: "rgb(254,212,92)" },
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

              {/* Selected Startup Profile Card */}
              {activeStartup && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="p-6 rounded-2xl border border-white/10 bg-white/5 mb-8"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-14 h-14 rounded-xl flex items-center justify-center bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)]"
                      >
                        <span className="text-white text-xl font-medium">{activeStartup.name.charAt(0)}</span>
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-white">{activeStartup.name}</h3>
                        <p className="text-sm text-white/50">{activeStartup.tagline || "No tagline"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge className={`border-0 ${documentCount > 0 ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/50"}`}>
                        <FileText className="w-3 h-3 mr-1" />
                        {documentCount} document{documentCount !== 1 ? "s" : ""}
                      </Badge>
                      {hasPitchDeck && (
                        <Badge className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] border-0">
                          Pitch Deck
                        </Badge>
                      )}
                      {activeStartup.stage && (
                        <Badge className="bg-white/10 text-white/60 border-0">{activeStartup.stage}</Badge>
                      )}
                      <Link href="/app/my-startups">
                        <Button variant="ghost" size="sm" className="text-white/60 hover:text-white" data-testid="link-manage-startup">
                          Manage Profile
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                  {!hasPitchDeck && (
                    <div className="mt-4 p-3 rounded-xl bg-[rgb(254,212,92)]/10 border border-[rgb(254,212,92)]/30">
                      <p className="text-sm text-[rgb(254,212,92)] flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        Upload a pitch deck to improve matching accuracy
                        <Link href="/app/my-startups">
                          <Button size="sm" variant="outline" className="ml-2 border-[rgb(254,212,92)]/50 text-[rgb(254,212,92)] hover:bg-[rgb(254,212,92)]/10" data-testid="button-upload-deck-prompt">
                            Upload Now
                          </Button>
                        </Link>
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col md:flex-row gap-4 mb-8"
          >
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <Input
                placeholder="Search firms or investors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                data-testid="input-search-matches"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] h-12 bg-white/5 border-white/10 text-white rounded-xl" data-testid="select-status-filter">
                <Filter className="w-4 h-4 mr-2 text-white/50" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                {statusFilters.map((filter) => (
                  <SelectItem key={filter.value} value={filter.value}>
                    {filter.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {startups.length > 1 && (
              <Select value={selectedStartupId} onValueChange={setSelectedStartupId}>
                <SelectTrigger className="w-[200px] h-12 bg-white/5 border-white/10 text-white rounded-xl" data-testid="select-startup">
                  <SelectValue placeholder="Select startup" />
                </SelectTrigger>
                <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                  {startups.map((startup) => (
                    <SelectItem key={startup.id} value={startup.id}>
                      {startup.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
              <Label htmlFor="enhanced-toggle" className="text-sm text-white/70 cursor-pointer">
                {useEnhancedMatching ? "Enhanced AI" : "Standard"}
              </Label>
              <Switch
                id="enhanced-toggle"
                checked={useEnhancedMatching}
                onCheckedChange={setUseEnhancedMatching}
                data-testid="switch-enhanced-matching"
                className="data-[state=checked]:bg-[rgb(142,132,247)]"
              />
              {useEnhancedMatching && (
                <Brain className="w-4 h-4 text-[rgb(142,132,247)]" />
              )}
            </div>
            <button
              onClick={handleGenerateMatches}
              disabled={isGeneratingMatches || startups.length === 0}
              className="h-12 px-6 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
              data-testid="button-generate-matches"
            >
              {isGeneratingMatches ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : useEnhancedMatching ? (
                <Brain className="w-5 h-5" />
              ) : (
                <Sparkles className="w-5 h-5" />
              )}
              {isGeneratingMatches ? "Generating..." : useEnhancedMatching ? "Enhanced Match" : "Generate Matches"}
            </button>
            {matches.length > 0 && (
              <Button
                onClick={downloadMatchesReport}
                disabled={downloadingReport || !selectedStartupId}
                variant="outline"
                className="h-12 border-white/20 text-white hover:bg-white/10 gap-2"
                data-testid="button-download-matches-report"
              >
                {downloadingReport ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {downloadingReport ? "Generating..." : "Download Report"}
              </Button>
            )}
          </motion.div>

          {filteredMatches.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="text-center py-24 rounded-2xl border border-white/10 bg-white/5"
            >
              <div 
                className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-6"
                style={{ backgroundColor: 'rgba(142, 132, 247, 0.2)' }}
              >
                <Target className="w-10 h-10 text-[rgb(142,132,247)]" />
              </div>
              <h3 className="text-2xl font-light text-white mb-2">
                No matches found
              </h3>
              <p className="text-white/50 font-light mb-8 max-w-md mx-auto">
                {startups.length === 0
                  ? "Create a startup profile to get AI-powered investor matches"
                  : "Generate matches to discover investors that align with your startup"}
              </p>
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
                  <Label htmlFor="enhanced-toggle-empty" className="text-sm text-white/70 cursor-pointer">
                    {useEnhancedMatching ? "Enhanced AI" : "Standard"}
                  </Label>
                  <Switch
                    id="enhanced-toggle-empty"
                    checked={useEnhancedMatching}
                    onCheckedChange={setUseEnhancedMatching}
                    data-testid="switch-enhanced-matching-empty"
                    className="data-[state=checked]:bg-[rgb(142,132,247)]"
                  />
                  {useEnhancedMatching && (
                    <Brain className="w-4 h-4 text-[rgb(142,132,247)]" />
                  )}
                </div>
                <button
                  onClick={handleGenerateMatches}
                  disabled={isGeneratingMatches || startups.length === 0}
                  className="h-12 px-8 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium inline-flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                  data-testid="button-generate-first-matches"
                >
                  {isGeneratingMatches ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : useEnhancedMatching ? (
                    <Brain className="w-5 h-5" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                  {isGeneratingMatches ? "Generating..." : useEnhancedMatching ? "Enhanced Match" : "Generate Matches"}
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMatches.map((match, index) => {
                const firm = firmsMap[match.firmId || ""];
                const investor = investorsMap[match.investorId || ""];
                const investorName = investor 
                  ? [investor.firstName, investor.lastName].filter(Boolean).join(" ")
                  : null;
                
                if (useEnhancedMatching) {
                  return (
                    <DomainMatchCard
                      key={match.id}
                      match={match}
                      firm={firm}
                      investor={investor}
                      startup={activeStartup}
                      onSave={handleSaveMatch}
                      onPass={handlePassMatch}
                      index={index}
                    />
                  );
                }
                
                return (
                  <motion.div
                    key={match.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                    className="group p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/[0.08] transition-colors"
                    data-testid={`card-match-${match.id}`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: 'rgba(142, 132, 247, 0.2)' }}
                        >
                          <Building2 className="w-6 h-6 text-[rgb(142,132,247)]" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white">
                            {firm?.name || "Unknown Firm"}
                          </h3>
                          {investorName && (
                            <p className="text-sm text-white/50">
                              {investorName}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge 
                        className={`text-xs border-0 ${
                          (match.matchScore || 0) >= 80 
                            ? "bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)]"
                            : (match.matchScore || 0) >= 60 
                              ? "bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)]"
                              : "bg-white/10 text-white/60"
                        }`}
                      >
                        {match.matchScore || 0}% match
                      </Badge>
                    </div>

                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-white/40 mb-2">
                        <span>Overall Match</span>
                        <span>{match.matchScore || 0}%</span>
                      </div>
                      <Progress 
                        value={match.matchScore || 0} 
                        className="h-1.5 bg-white/10"
                      />
                    </div>

                    {(match.metadata as any)?.breakdown && Object.keys((match.metadata as any).breakdown).length > 0 && (
                      <div className="grid grid-cols-5 gap-1 mb-4 text-[10px]" data-testid={`breakdown-${match.id}`}>
                        {[
                          { label: "Industry", key: "industry", color: "rgb(142,132,247)" },
                          { label: "Stage", key: "stage", color: "rgb(251,194,213)" },
                          { label: "Location", key: "location", color: "rgb(196,227,230)" },
                          { label: "Check", key: "checkSize", color: "rgb(254,212,92)" },
                          { label: "Type", key: "investorType", color: "rgb(142,132,247)" },
                        ].map(({ label, key, color }) => {
                          const score = (match.metadata as any)?.breakdown?.[key] || 0;
                          return (
                            <div key={key} className="text-center">
                              <div 
                                className="w-full h-1 rounded-full mb-1"
                                style={{ backgroundColor: `${color}30` }}
                              >
                                <div 
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${score}%`, backgroundColor: color }}
                                />
                              </div>
                              <span className="text-white/40">{label}</span>
                              <span className="block text-white/60">{score}%</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {match.matchReasons && match.matchReasons.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {match.matchReasons.slice(0, 3).map((reason, i) => (
                          <Badge 
                            key={i} 
                            variant="outline"
                            className="text-xs border-white/20 text-white/60"
                          >
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 pt-4 border-t border-white/10">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 h-10 rounded-xl text-[rgb(196,227,230)] hover:bg-[rgb(196,227,230)]/10"
                        onClick={() => handleSaveMatch(match)}
                        disabled={match.status === "saved"}
                        data-testid={`button-save-match-${match.id}`}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 h-10 rounded-xl text-white/50 hover:bg-white/5"
                        onClick={() => handlePassMatch(match)}
                        disabled={match.status === "passed"}
                        data-testid={`button-pass-match-${match.id}`}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Pass
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
            </TabsContent>

            <TabsContent value="accelerated" className="mt-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="p-8 rounded-2xl border border-white/10 bg-white/5"
                >
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] flex items-center justify-center">
                      <Zap className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-light text-white">Accelerated Matching</h3>
                      <p className="text-white/50 text-sm">Upload your pitch deck for AI-powered analysis</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div 
                      className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center cursor-pointer hover:border-[rgb(142,132,247)]/50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="upload-pitch-deck-area"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={handleFileUpload}
                        data-testid="input-pitch-deck-file"
                      />
                      {uploadingDeck ? (
                        <Loader2 className="w-12 h-12 mx-auto text-[rgb(142,132,247)] animate-spin mb-4" />
                      ) : (
                        <Upload className="w-12 h-12 mx-auto text-white/40 mb-4" />
                      )}
                      <p className="text-white font-light mb-2">
                        {deckText ? "Pitch deck uploaded" : "Drop your pitch deck here"}
                      </p>
                      <p className="text-white/40 text-sm">
                        {deckText ? `${deckText.length.toLocaleString()} characters extracted` : "PDF files only"}
                      </p>
                    </div>

                    {startups.length > 0 && (
                      <Select value={selectedStartupId} onValueChange={setSelectedStartupId}>
                        <SelectTrigger className="h-12 bg-white/5 border-white/10 text-white rounded-xl" data-testid="select-startup-accelerated">
                          <SelectValue placeholder="Link to startup (optional)" />
                        </SelectTrigger>
                        <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                          {startups.map((startup) => (
                            <SelectItem key={startup.id} value={startup.id}>
                              {startup.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    <button
                      onClick={handleStartAcceleratedMatching}
                      disabled={!deckText || acceleratedMatchMutation.isPending}
                      className="w-full h-14 rounded-xl bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium flex items-center justify-center gap-3 hover:opacity-90 transition-opacity disabled:opacity-50"
                      data-testid="button-start-accelerated-matching"
                    >
                      {acceleratedMatchMutation.isPending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Brain className="w-5 h-5" />
                      )}
                      {acceleratedMatchMutation.isPending ? "Starting Analysis..." : "Start AI Analysis"}
                    </button>
                  </div>

                  <div className="mt-8 pt-6 border-t border-white/10">
                    <h4 className="text-white/80 font-medium mb-4">How it works</h4>
                    <div className="space-y-3">
                      {[
                        { icon: FileText, label: "Analyzes your pitch deck content" },
                        { icon: Building2, label: "Matches with investment firms" },
                        { icon: Users, label: "Finds aligned investors" },
                      ].map((step, i) => (
                        <div key={i} className="flex items-center gap-3 text-white/60">
                          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                            <step.icon className="w-4 h-4" />
                          </div>
                          <span className="text-sm">{step.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>

                <div className="space-y-6">
                  <h3 className="text-lg font-light text-white">Recent Jobs</h3>
                  
                  {acceleratedJobsLoading ? (
                    <div className="p-8 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-[rgb(142,132,247)] animate-spin" />
                    </div>
                  ) : acceleratedJobs.length === 0 ? (
                    <div className="p-8 rounded-2xl border border-white/10 bg-white/5 text-center">
                      <Zap className="w-10 h-10 mx-auto text-white/20 mb-4" />
                      <p className="text-white/40">No accelerated match jobs yet</p>
                      <p className="text-white/30 text-sm mt-1">Upload a pitch deck to get started</p>
                    </div>
                  ) : (
                    acceleratedJobs.map((job) => (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-6 rounded-2xl border border-white/10 bg-white/5 cursor-pointer hover:border-[rgb(142,132,247)]/30 transition-colors"
                        onClick={() => setSelectedJob(job)}
                        data-testid={`accelerated-job-${job.id}`}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <Badge className={`border-0 ${
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
                          <div className="mb-4">
                            <div className="flex justify-between text-xs text-white/40 mb-2">
                              <span>{job.currentStep}</span>
                              <span>{job.progress}%</span>
                            </div>
                            <Progress value={job.progress || 0} className="h-1.5 bg-white/10" />
                          </div>
                        )}

                        {job.status === "complete" && job.matchResults && (
                          <p className="text-white/60 text-sm">
                            Found {(job.matchResults as any[]).length} investor matches
                          </p>
                        )}

                        {job.status === "failed" && job.errorMessage && (
                          <p className="text-red-400/80 text-sm">{job.errorMessage}</p>
                        )}
                      </motion.div>
                    ))
                  )}
                </div>
              </div>

              {currentSelectedJob && currentSelectedJob.status === "complete" && currentSelectedJob.matchResults && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8"
                >
                  {/* Split results into investor and firm matches */}
                  {(() => {
                    const allResults = currentSelectedJob.matchResults as any[];
                    const investorMatches = allResults.filter(r => !r.isFirmMatch);
                    const firmMatches = allResults.filter(r => r.isFirmMatch);
                    
                    return (
                      <>
                        <div className="flex items-center justify-between mb-6">
                          <h3 className="text-xl font-light text-white">
                            AI-Generated Matches ({investorMatches.length} investors, {firmMatches.length} firms)
                          </h3>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-white/50"
                            onClick={() => setSelectedJob(null)}
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Close
                          </Button>
                        </div>

                        {/* Investor Matches */}
                        {investorMatches.length > 0 && (
                          <>
                            <h4 className="text-lg font-light text-white/70 mb-4 flex items-center gap-2">
                              <Users className="w-5 h-5 text-[rgb(142,132,247)]" />
                              Investor Matches ({investorMatches.length})
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                              {investorMatches.map((result: any, idx: number) => (
                                <motion.div
                                  key={result.investorId || idx}
                                  initial={{ opacity: 0, y: 20 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                                  className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:border-[rgb(142,132,247)]/30 transition-all"
                                  data-testid={`accelerated-match-${result.investorId}`}
                                >
                                  <div className="flex items-start justify-between mb-4">
                                    <div>
                                      <h4 className="text-lg font-light text-white">
                                        {result.investorName || "Unknown Investor"}
                                      </h4>
                                      {result.firmName && (
                                        <p className="text-sm text-white/50">{result.firmName}</p>
                                      )}
                                    </div>
                                    <Badge className="bg-gradient-to-r from-[rgb(142,132,247)]/20 to-[rgb(251,194,213)]/20 text-white border-0">
                                      {result.matchScore}% match
                                    </Badge>
                                  </div>

                                  {result.matchReasons && result.matchReasons.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mb-4">
                                      {result.matchReasons.slice(0, 3).map((reason: string, i: number) => (
                                        <Badge 
                                          key={i}
                                          variant="outline"
                                          className="text-xs border-white/20 text-white/60"
                                        >
                                          {reason}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}

                                  {result.investorEmail && (
                                    <Button
                                      size="sm"
                                      className="w-full mt-4 rounded-xl bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
                                      onClick={() => setLocation(`/app/outreach?email=${result.investorEmail}`)}
                                      data-testid={`button-contact-accelerated-${result.investorId}`}
                                    >
                                      <Mail className="w-4 h-4 mr-2" />
                                      Contact
                                    </Button>
                                  )}
                                </motion.div>
                              ))}
                            </div>
                          </>
                        )}

                        {/* Firm Matches */}
                        {firmMatches.length > 0 && (
                          <>
                            <h4 className="text-lg font-light text-white/70 mb-4 flex items-center gap-2">
                              <Building2 className="w-5 h-5 text-[rgb(251,194,213)]" />
                              Investment Firm Matches ({firmMatches.length})
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {firmMatches.map((result: any, idx: number) => (
                                <motion.div
                                  key={result.firmProfile?.id || idx}
                                  initial={{ opacity: 0, y: 20 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                                  className="p-6 rounded-2xl border border-[rgb(251,194,213)]/20 bg-white/5 hover:border-[rgb(251,194,213)]/40 transition-all"
                                  data-testid={`accelerated-firm-match-${result.firmProfile?.id}`}
                                >
                                  <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-lg bg-[rgb(251,194,213)]/20 flex items-center justify-center">
                                        <Building2 className="w-5 h-5 text-[rgb(251,194,213)]" />
                                      </div>
                                      <div>
                                        <h4 className="text-lg font-light text-white">
                                          {result.firmName}
                                        </h4>
                                        {result.firmProfile?.type && (
                                          <p className="text-sm text-white/50">{result.firmProfile.type}</p>
                                        )}
                                      </div>
                                    </div>
                                    <Badge className="bg-[rgb(251,194,213)]/20 text-[rgb(251,194,213)] border-0">
                                      {result.matchScore}% match
                                    </Badge>
                                  </div>

                                  {result.matchReasons && result.matchReasons.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mb-4">
                                      {result.matchReasons.slice(0, 3).map((reason: string, i: number) => (
                                        <Badge 
                                          key={i}
                                          variant="outline"
                                          className="text-xs border-[rgb(251,194,213)]/30 text-[rgb(251,194,213)]/80"
                                        >
                                          {reason}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}

                                  {result.firmProfile?.website && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="w-full mt-4 rounded-xl border-[rgb(251,194,213)]/30 text-[rgb(251,194,213)] hover:bg-[rgb(251,194,213)]/10"
                                      onClick={() => window.open(result.firmProfile.website, '_blank')}
                                      data-testid={`button-visit-firm-${result.firmProfile?.id}`}
                                    >
                                      <ArrowRight className="w-4 h-4 mr-2" />
                                      Visit Website
                                    </Button>
                                  )}
                                </motion.div>
                              ))}
                            </div>
                          </>
                        )}

                        {investorMatches.length === 0 && firmMatches.length === 0 && (
                          <div className="text-center py-12 rounded-2xl border border-white/10 bg-white/5">
                            <Target className="w-12 h-12 mx-auto text-white/20 mb-4" />
                            <p className="text-white/40">No matches found. Try uploading a more detailed pitch deck.</p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </motion.div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
