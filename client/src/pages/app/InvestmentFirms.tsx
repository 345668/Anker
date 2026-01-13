import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Building2, MapPin, Globe, Search, Linkedin, Users, ArrowRight, Sparkles, X, Loader2, CheckCircle, XCircle, Clock, AlertCircle, ChevronLeft, ChevronRight, Link as LinkIcon, UserPlus } from "lucide-react";
import { UrlHealthButton } from "@/components/UrlHealthButton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import AdminLayout from "@/pages/admin/AdminLayout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useDebounce } from "@/hooks/use-debounce";
import type { InvestmentFirm, BatchEnrichmentJob } from "@shared/schema";
import { FIRM_CLASSIFICATIONS } from "@shared/schema";

const classificationTabs = ["All", ...FIRM_CLASSIFICATIONS, "Unclassified"] as const;

export default function InvestmentFirms() {
  const [location] = useLocation();
  const isAdminRoute = location.startsWith("/admin");
  const [searchQuery, setSearchQuery] = useState("");
  const [classificationFilter, setClassificationFilter] = useState<string>("All");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [addingContactId, setAddingContactId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 24;
  const { user } = useAuth();
  const { toast } = useToast();

  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: firmsResponse, isLoading, refetch: refetchFirms } = useQuery<{ data: InvestmentFirm[], total: number }>({
    queryKey: ["/api/firms", { search: debouncedSearch, classification: classificationFilter, page: currentPage }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      params.set("offset", String((currentPage - 1) * pageSize));
      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }
      if (classificationFilter && classificationFilter !== "All") {
        params.set("classification", classificationFilter);
      }
      const res = await fetch(`/api/firms?${params}`);
      if (!res.ok) throw new Error("Failed to fetch firms");
      return res.json();
    },
  });

  // Fetch aggregated classification counts from server (not affected by pagination)
  const { data: classificationCounts } = useQuery<Record<string, number>>({
    queryKey: ["/api/firms/counts"],
    queryFn: async () => {
      const res = await fetch("/api/firms/counts");
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
    missingData: number;
    total: number;
  }>({
    queryKey: ["/api/firms/enrichment-stats"],
    queryFn: async () => {
      const res = await fetch("/api/firms/enrichment-stats");
      if (!res.ok) throw new Error("Failed to fetch enrichment stats");
      return res.json();
    },
    staleTime: 30000,
    enabled: !!user?.isAdmin,
  });

  const firms = firmsResponse?.data ?? [];
  const totalFirms = firmsResponse?.total ?? 0;

  const { data: activeJob, refetch: refetchActiveJob } = useQuery<{ job: BatchEnrichmentJob | null }>({
    queryKey: ["/api/admin/enrichment/batch/active"],
    enabled: !!user?.isAdmin,
    refetchInterval: activeJobId ? 2000 : false,
  });

  const { data: currentJob, refetch: refetchJob } = useQuery<BatchEnrichmentJob>({
    queryKey: ["/api/admin/enrichment/batch", activeJobId],
    enabled: !!activeJobId,
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (activeJob?.job) {
      setActiveJobId(activeJob.job.id);
    }
  }, [activeJob]);

  useEffect(() => {
    if (currentJob?.status === "completed" || currentJob?.status === "failed" || currentJob?.status === "cancelled") {
      setActiveJobId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/firms"] });
      toast({
        title: currentJob.status === "completed" ? "Data Enrichment Complete" : "Enrichment Stopped",
        description: currentJob.status === "completed" 
          ? `Enriched ${currentJob.successfulRecords} of ${currentJob.totalRecords} firms with new data`
          : `Processed ${currentJob.processedRecords} firms before stopping`,
      });
    }
  }, [currentJob?.status]);

  const startEnrichmentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/enrichment/batch/start", {
        batchSize: 10,
        onlyMissingData: true,
        onlyUnclassified: false,
        enrichmentType: "full_enrichment",
      });
      return res.json();
    },
    onSuccess: (data) => {
      setActiveJobId(data.id);
      toast({
        title: "Deep Research & Enrichment Started",
        description: `Enriching ${data.totalRecords} firms with missing data...`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to start enrichment",
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
      toast({ title: "Research cancelled" });
    },
  });

  const addToContactsMutation = useMutation({
    mutationFn: async (firmId: string) => {
      setAddingContactId(firmId);
      const res = await apiRequest("POST", "/api/contacts/from-firm", { firmId });
      return res.json();
    },
    onSuccess: (data) => {
      setAddingContactId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Contact Added",
        description: `${data.firstName || 'Firm'} has been added to your contacts`,
      });
    },
    onError: (error: any) => {
      setAddingContactId(null);
      if (error.message?.includes("already exists")) {
        toast({
          title: "Already in Contacts",
          description: "This firm is already in your contacts list",
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

  const filteredFirms = firms;
  const paginatedFirms = firms;

  const totalPages = Math.max(1, Math.ceil(totalFirms / pageSize));
  
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
  }, [debouncedSearch, classificationFilter]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const content = (
      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 space-y-4"
          >
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <Input
                  placeholder="Search firms..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 h-12"
                  data-testid="input-search-firms"
                />
              </div>
              
              {user?.isAdmin && (enrichmentStats?.missingData ?? 0) > 0 && (
                <Button
                  onClick={() => startEnrichmentMutation.mutate()}
                  disabled={startEnrichmentMutation.isPending || !!activeJobId}
                  className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(112,102,217)] hover:opacity-90"
                  data-testid="button-deep-research"
                >
                  {startEnrichmentMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Deep Research ({enrichmentStats?.missingData ?? 0})
                </Button>
              )}
              {user?.isAdmin && (
                <UrlHealthButton entityScope="investmentFirms" />
              )}
            </div>

            {user?.isAdmin && currentJob && (currentJob.status === "pending" || currentJob.status === "processing") && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-[rgb(30,30,30)] border border-white/10"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-[rgb(142,132,247)] animate-pulse" />
                    </div>
                    <div>
                      <p className="text-white font-medium">Data Enrichment in Progress</p>
                      <p className="text-white/50 text-sm">
                        Enriching firms with AI research...
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => cancelEnrichmentMutation.mutate(currentJob.id)}
                    disabled={cancelEnrichmentMutation.isPending}
                    className="text-white/60 hover:text-white"
                    data-testid="button-cancel-research"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                </div>
                <Progress 
                  value={((currentJob.processedRecords || 0) / (currentJob.totalRecords || 1)) * 100} 
                  className="h-2 bg-white/10"
                />
                <div className="flex justify-between mt-2 text-xs text-white/50">
                  <span>{currentJob.processedRecords || 0} of {currentJob.totalRecords || 0} firms</span>
                  <span className="flex items-center gap-2">
                    <span className="text-green-400">{currentJob.successfulRecords || 0} classified</span>
                    {(currentJob.failedRecords || 0) > 0 && (
                      <span className="text-red-400">{currentJob.failedRecords} errors</span>
                    )}
                  </span>
                </div>
              </motion.div>
            )}

            {user?.isAdmin && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-[rgb(30,30,30)] border border-white/10"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h3 className="text-white font-medium flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[rgb(142,132,247)]" />
                    Enrichment Status Tracker
                  </h3>
                </div>
                <div className="flex flex-wrap gap-4 mt-3">
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 rounded-lg border border-green-500/20">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-green-400 font-medium">{enrichmentStats?.enriched ?? 0}</span>
                    <span className="text-white/50 text-sm">Enriched</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                    <AlertCircle className="w-4 h-4 text-yellow-400" />
                    <span className="text-yellow-400 font-medium">{enrichmentStats?.partiallyEnriched ?? 0}</span>
                    <span className="text-white/50 text-sm">Partial</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20">
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span className="text-red-400 font-medium">{enrichmentStats?.failed ?? 0}</span>
                    <span className="text-white/50 text-sm">Failed</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10">
                    <Clock className="w-4 h-4 text-white/50" />
                    <span className="text-white/70 font-medium">{enrichmentStats?.notEnriched ?? 0}</span>
                    <span className="text-white/50 text-sm">Not Enriched</span>
                  </div>
                </div>
              </motion.div>
            )}
            
            <div className="overflow-x-auto pb-2 -mx-6 px-6">
              <div className="flex gap-1 min-w-max bg-[rgb(30,30,30)] p-1 rounded-lg border border-white/10">
                {classificationTabs.map((classification) => (
                  <button
                    key={classification}
                    onClick={() => setClassificationFilter(classification)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                      classificationFilter === classification 
                        ? 'bg-[rgb(50,50,50)] text-white shadow-sm' 
                        : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                    }`}
                    data-testid={`button-filter-${classification.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {classification}
                    <span className={`ml-2 text-xs ${
                      classificationFilter === classification ? 'text-white/60' : 'text-white/40'
                    }`}>
                      {classificationCounts?.[classification] || 0}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            
            {(classificationFilter !== "All" || searchQuery) && (
              <div className="flex items-center gap-2 mt-4">
                <span className="text-white/50 text-sm">Active filters:</span>
                {classificationFilter !== "All" && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] rounded-full text-sm">
                    {classificationFilter}
                    <button
                      onClick={() => setClassificationFilter("All")}
                      className="ml-1 hover:text-white transition-colors"
                      data-testid="button-clear-classification"
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
                    setClassificationFilter("All");
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
          </motion.div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-4">
              <span className="text-white font-medium" data-testid="text-total-count">
                {totalFirms.toLocaleString()} Total Firms
              </span>
              {isLoading && (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-[rgb(142,132,247)] animate-spin" />
                  <span className="text-sm text-white/50">Loading...</span>
                </div>
              )}
              {filteredFirms.length !== firms.length && (
                <span className="text-white/50 text-sm">
                  ({filteredFirms.length.toLocaleString()} matching filters)
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
            {paginatedFirms.map((firm, index) => (
              <motion.div
                key={firm.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(index * 0.02, 0.5) }}
              >
                <Link href={`/app/firms/${firm.id}`}>
                  <div 
                    className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer group h-full"
                    data-testid={`card-firm-${firm.id}`}
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-14 h-14 rounded-xl bg-[rgb(142,132,247)]/20 flex items-center justify-center border border-white/10">
                        <Building2 className="w-7 h-7 text-[rgb(142,132,247)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-medium text-white truncate">
                          {firm.name}
                        </h3>
                        {firm.industry && (
                          <p className="text-sm text-white/50 truncate">{firm.industry}</p>
                        )}
                        {firm.hqLocation && (
                          <p className="text-sm text-[rgb(142,132,247)] truncate flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {firm.hqLocation}
                          </p>
                        )}
                      </div>
                    </div>

                    {firm.description && (
                      <p className="text-sm text-white/40 line-clamp-2 mb-4">{firm.description}</p>
                    )}

                    <div className="flex flex-wrap gap-2 mb-4">
                      {firm.employeeRange && (
                        <span className="px-2 py-1 text-xs rounded-full bg-white/10 text-white/60 border border-white/10 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {firm.employeeRange}
                        </span>
                      )}
                      {firm.fundingRaised && (
                        <span className="px-2 py-1 text-xs rounded-full bg-white/10 text-white/60 border border-white/10">
                          {firm.fundingRaised}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                      <div className="flex gap-3">
                        {firm.website && (
                          <Globe className="w-4 h-4 text-white/30" />
                        )}
                        {firm.linkedinUrl && (
                          <Linkedin className="w-4 h-4 text-white/30" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            addToContactsMutation.mutate(firm.id);
                          }}
                          disabled={addingContactId === firm.id}
                          className="text-white/40 hover:text-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/10"
                          data-testid={`button-add-contact-${firm.id}`}
                        >
                          {addingContactId === firm.id ? (
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

          {filteredFirms.length === 0 && (
            <div className="text-center py-16">
              <Building2 className="w-16 h-16 text-white/20 mx-auto mb-4" />
              <h3 className="text-xl font-light text-white mb-2">No firms found</h3>
              <p className="text-white/40">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </div>
  );

  if (isAdminRoute) {
    return <AdminLayout>{content}</AdminLayout>;
  }

  return (
    <AppLayout 
      title="Investment Firms"
      subtitle="Browse venture capital and investment firms"
      heroHeight="35vh"
      videoUrl={videoBackgrounds.firms}
    >
      {content}
    </AppLayout>
  );
}
