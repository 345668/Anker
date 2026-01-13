import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Building2, Users, Search, Linkedin, Twitter, ArrowRight, Sparkles, Loader2, X, CheckCircle2, XCircle, AlertCircle, ChevronLeft, ChevronRight, UserPlus } from "lucide-react";
import { UrlHealthButton } from "@/components/UrlHealthButton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useFullDataset, useClientPagination } from "@/hooks/use-full-dataset";
import { useDebounce } from "@/hooks/use-debounce";
import type { Investor, InvestmentFirm, BatchEnrichmentJob } from "@shared/schema";

const stages = [
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
const sectors = ["All Sectors", "SaaS", "Fintech", "Healthcare", "AI/ML", "Consumer", "Enterprise", "Climate", "Crypto"];

export default function Investors() {
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("All Stages");
  const [sectorFilter, setSectorFilter] = useState("All Sectors");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [addingContactId, setAddingContactId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 24;
  const { toast } = useToast();
  const { user } = useAuth();

  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: investorsResponse, isLoading: loadingInvestors, refetch: refetchInvestors } = useQuery<{ data: Investor[], total: number }>({
    queryKey: ["/api/investors", { search: debouncedSearch, page: currentPage, limit: pageSize }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      params.set("offset", String((currentPage - 1) * pageSize));
      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }
      const res = await fetch(`/api/investors?${params}`);
      if (!res.ok) throw new Error("Failed to fetch investors");
      return res.json();
    },
  });

  // Fetch aggregated stage counts from server (not affected by pagination)
  const { data: stageCounts } = useQuery<Record<string, number>>({
    queryKey: ["/api/investors/counts"],
    queryFn: async () => {
      const res = await fetch("/api/investors/counts");
      if (!res.ok) throw new Error("Failed to fetch counts");
      return res.json();
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  // Fetch enrichment stats from server (global counts for Deep Research button)
  const { data: enrichmentStats } = useQuery<{
    enriched: number;
    partiallyEnriched: number;
    failed: number;
    notEnriched: number;
    total: number;
  }>({
    queryKey: ["/api/investors/enrichment-stats"],
    queryFn: async () => {
      const res = await fetch("/api/investors/enrichment-stats");
      if (!res.ok) throw new Error("Failed to fetch enrichment stats");
      return res.json();
    },
    staleTime: 30000,
    enabled: !!user?.isAdmin,
  });

  const investors = investorsResponse?.data ?? [];
  const totalInvestors = investorsResponse?.total ?? 0;

  const { 
    data: firms, 
    isLoading: loadingFirms 
  } = useFullDataset<InvestmentFirm>("/api/firms");

  const { data: activeJob, refetch: refetchActiveJob } = useQuery<{ job: BatchEnrichmentJob | null }>({
    queryKey: ["/api/admin/enrichment/investors/active"],
    enabled: !!user?.isAdmin,
  });

  const { data: currentJob, refetch: refetchJob } = useQuery<BatchEnrichmentJob>({
    queryKey: ["/api/admin/enrichment/batch", activeJobId],
    enabled: !!activeJobId,
    refetchInterval: activeJobId ? 2000 : false,
  });

  useEffect(() => {
    if (activeJob?.job) {
      setActiveJobId(activeJob.job.id);
    } else {
      setActiveJobId(null);
    }
  }, [activeJob]);

  useEffect(() => {
    if (currentJob && (currentJob.status === "completed" || currentJob.status === "failed")) {
      setActiveJobId(null);
      refetchActiveJob();
      refetchInvestors();
      toast({
        title: currentJob.status === "completed" ? "Deep Research Complete" : "Research Stopped",
        description: `Processed ${currentJob.processedRecords} investors (${currentJob.successfulRecords} successful, ${currentJob.failedRecords} failed)`,
      });
    }
  }, [currentJob?.status]);

  const startEnrichmentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/enrichment/investors/start", {
        batchSize: 10,
        onlyIncomplete: true,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setActiveJobId(data.id);
      toast({
        title: "Deep Research Started",
        description: `Processing ${data.totalRecords} investors...`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cancelEnrichmentMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("POST", `/api/admin/enrichment/batch/${jobId}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      setActiveJobId(null);
      refetchActiveJob();
      refetchInvestors();
      toast({
        title: "Research Cancelled",
        description: "The deep research process has been stopped",
      });
    },
  });

  const addToContactsMutation = useMutation({
    mutationFn: async (investorId: string) => {
      setAddingContactId(investorId);
      const res = await apiRequest("POST", "/api/contacts/from-investor", { investorId });
      return res.json();
    },
    onSuccess: (data) => {
      setAddingContactId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Contact Added",
        description: `${data.firstName || 'Contact'} ${data.lastName || ''} has been added to your contacts`,
      });
    },
    onError: (error: any) => {
      setAddingContactId(null);
      if (error.message?.includes("already exists")) {
        toast({
          title: "Already in Contacts",
          description: "This investor is already in your contacts list",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to add contact",
          variant: "destructive",
        });
      }
    },
  });

  // Debug logging for admin check
  console.log("[Investors] User data:", user, "isAdmin check:", user?.isAdmin, "notEnriched:", enrichmentStats?.notEnriched);

  const filteredInvestors = useMemo(() => investors.filter((investor) => {
    const investorStages = Array.isArray(investor.stages) ? investor.stages : [];
    const investorSectors = Array.isArray(investor.sectors) ? investor.sectors : [];
    const fundingStage = investor.fundingStage;
    
    const matchesStage =
      stageFilter === "All Stages" ||
      fundingStage === stageFilter ||
      investorStages.includes(stageFilter);

    const matchesSector =
      sectorFilter === "All Sectors" ||
      investorSectors.includes(sectorFilter);

    return matchesStage && matchesSector;
  }), [investors, stageFilter, sectorFilter]);

  const totalPages = Math.max(1, Math.ceil(totalInvestors / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalInvestors);
  
  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);
  
  const nextPage = useCallback(() => {
    if (currentPage < totalPages) setCurrentPage(p => p + 1);
  }, [currentPage, totalPages]);
  
  const prevPage = useCallback(() => {
    if (currentPage > 1) setCurrentPage(p => p - 1);
  }, [currentPage]);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  const paginatedInvestors = filteredInvestors;

  const getFirmName = (firmId: string | null) => {
    if (!firmId) return null;
    const firm = firms.find((f) => f.id === firmId);
    return firm?.name;
  };

  if (loadingInvestors || loadingFirms) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout 
      title="Browse Investors"
      subtitle="Find investors that match your startup"
      heroHeight="35vh"
      videoUrl={videoBackgrounds.investors}
    >
      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <Input
                    placeholder="Search investors..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 h-12"
                    data-testid="input-search"
                  />
                </div>
                
                {user?.isAdmin && (
                  <UrlHealthButton entityScope="investors" />
                )}
                {user?.isAdmin && (enrichmentStats?.notEnriched ?? 0) > 0 && (
                  <Button
                    onClick={() => startEnrichmentMutation.mutate()}
                    disabled={startEnrichmentMutation.isPending || !!activeJobId}
                    className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0 gap-2"
                    data-testid="button-deep-research"
                  >
                    {startEnrichmentMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    Deep Research ({enrichmentStats?.notEnriched ?? 0})
                  </Button>
                )}
              </div>
              
              {user?.isAdmin && currentJob && (currentJob.status === "pending" || currentJob.status === "processing") && (
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[rgb(142,132,247)]" />
                      <p className="text-white font-medium">Deep Research in Progress</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => cancelEnrichmentMutation.mutate(currentJob.id)}
                      disabled={cancelEnrichmentMutation.isPending}
                      className="text-white/60 hover:text-white"
                      data-testid="button-cancel-research"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <Progress 
                    value={((currentJob.processedRecords || 0) / (currentJob.totalRecords || 1)) * 100} 
                    className="h-2 bg-white/10"
                  />
                  <p className="text-sm text-white/50 mt-2">
                    {currentJob.processedRecords} / {currentJob.totalRecords} investors processed
                    ({currentJob.successfulRecords} enriched, {currentJob.failedRecords} failed)
                  </p>
                </div>
              )}
              
              {user?.isAdmin && (
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[rgb(142,132,247)]" />
                    Enrichment Status Tracker
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <span className="text-sm text-white/60">Enriched:</span>
                      <span className="text-green-400 font-medium">{enrichmentStats?.enriched ?? 0}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-yellow-400" />
                      <span className="text-sm text-white/60">Partial:</span>
                      <span className="text-yellow-400 font-medium">{enrichmentStats?.partiallyEnriched ?? 0}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-red-400" />
                      <span className="text-sm text-white/60">Failed:</span>
                      <span className="text-red-400 font-medium">{enrichmentStats?.failed ?? 0}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-white/50" />
                      <span className="text-sm text-white/60">Not Enriched:</span>
                      <span className="text-white/70 font-medium">{enrichmentStats?.notEnriched ?? 0}</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex flex-wrap gap-2">
                {stages.map((stage) => (
                  <button
                    key={stage}
                    onClick={() => setStageFilter(stage)}
                    className={`px-4 py-2 rounded-full text-sm font-light transition-all border ${
                      stageFilter === stage 
                        ? 'bg-white text-black border-white' 
                        : 'bg-transparent text-white/60 border-white/20 hover:border-white/40'
                    }`}
                    data-testid={`button-filter-${stage.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {stage} {stageCounts?.[stage] ? `(${stageCounts[stage]})` : ''}
                  </button>
                ))}
              </div>
              
              {(stageFilter !== "All Stages" || sectorFilter !== "All Sectors" || searchQuery) && (
                <div className="flex items-center gap-2 mt-4">
                  <span className="text-white/50 text-sm">Active filters:</span>
                  {stageFilter !== "All Stages" && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] rounded-full text-sm">
                      {stageFilter}
                      <button
                        onClick={() => setStageFilter("All Stages")}
                        className="ml-1 hover:text-white transition-colors"
                        data-testid="button-clear-stage"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {sectorFilter !== "All Sectors" && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] rounded-full text-sm">
                      {sectorFilter}
                      <button
                        onClick={() => setSectorFilter("All Sectors")}
                        className="ml-1 hover:text-white transition-colors"
                        data-testid="button-clear-sector"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {searchQuery && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/10 text-white/70 rounded-full text-sm">
                      Search: "{searchQuery}"
                      <button
                        onClick={() => setSearchQuery("")}
                        className="ml-1 hover:text-white transition-colors"
                        data-testid="button-clear-search"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setStageFilter("All Stages");
                      setSectorFilter("All Sectors");
                      setSearchQuery("");
                      setCurrentPage(1);
                    }}
                    className="text-white/50 hover:text-white"
                    data-testid="button-clear-all-filters"
                  >
                    Clear all
                  </Button>
                </div>
              )}
            </div>
          </motion.div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-4">
              <span className="text-white font-medium" data-testid="text-total-count">
                {totalInvestors.toLocaleString()} Total Investors
              </span>
              {loadingInvestors && (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-[rgb(142,132,247)] animate-spin" />
                  <span className="text-sm text-white/50">Loading...</span>
                </div>
              )}
              {filteredInvestors.length !== investors.length && (
                <span className="text-white/50 text-sm">
                  ({filteredInvestors.length.toLocaleString()} matching filters)
                </span>
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={prevPage}
                  disabled={currentPage === 1}
                  className="border-white/20 text-white hover:bg-white/10"
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-white/70 text-sm min-w-[100px] text-center">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={nextPage}
                  disabled={currentPage === totalPages}
                  className="border-white/20 text-white hover:bg-white/10"
                  data-testid="button-next-page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedInvestors.map((investor, index) => (
              <motion.div
                key={investor.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(index * 0.02, 0.5) }}
              >
                <Link href={`/app/investors/${investor.id}`}>
                  <div 
                    className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer group"
                    data-testid={`card-investor-${investor.id}`}
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <Avatar className="h-14 w-14 rounded-xl border border-white/10">
                        <AvatarImage src={investor.avatar || undefined} />
                        <AvatarFallback className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] rounded-xl text-lg">
                          {investor.firstName?.charAt(0)}{investor.lastName?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-medium text-white truncate">
                          {investor.firstName} {investor.lastName}
                        </h3>
                        <p className="text-sm text-white/50 truncate">{investor.title}</p>
                        {investor.firmId && (
                          <p className="text-sm text-[rgb(142,132,247)] truncate flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {getFirmName(investor.firmId)}
                          </p>
                        )}
                      </div>
                      {investor.fundingStage && (
                        <span className="px-2 py-1 text-xs rounded-full bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] border border-[rgb(142,132,247)]/30 whitespace-nowrap">
                          {investor.fundingStage}
                        </span>
                      )}
                    </div>

                    {investor.bio && (
                      <p className="text-sm text-white/40 line-clamp-2 mb-4">{investor.bio}</p>
                    )}

                    <div className="flex flex-wrap gap-2 mb-4">
                      {(investor.sectors as string[] || []).slice(0, 3).map((sector) => (
                        <span
                          key={sector}
                          className="px-2 py-1 text-xs rounded-full bg-white/10 text-white/60 border border-white/10"
                        >
                          {sector}
                        </span>
                      ))}
                      {investor.investorType && (
                        <span className="px-2 py-1 text-xs rounded-full bg-white/5 text-white/40 border border-white/10">
                          {investor.investorType}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                      <div className="flex gap-3">
                        {(investor.linkedinUrl || investor.personLinkedinUrl) && (
                          <Linkedin className="w-4 h-4 text-white/30" />
                        )}
                        {investor.twitterUrl && (
                          <Twitter className="w-4 h-4 text-white/30" />
                        )}
                        {investor.enrichmentStatus === "enriched" && (
                          <CheckCircle2 className="w-4 h-4 text-green-400/50" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            addToContactsMutation.mutate(investor.id);
                          }}
                          disabled={addingContactId === investor.id}
                          className="text-white/40 hover:text-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/10"
                          data-testid={`button-add-contact-${investor.id}`}
                        >
                          {addingContactId === investor.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <UserPlus className="w-4 h-4" />
                          )}
                        </Button>
                        <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          {filteredInvestors.length === 0 && (
            <div className="text-center py-16">
              <Users className="w-16 h-16 text-white/20 mx-auto mb-4" />
              <h3 className="text-xl font-light text-white mb-2">No investors found</h3>
              <p className="text-white/40">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
