import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Building2, MapPin, Globe, Search, Linkedin, Users, ArrowRight, Sparkles, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { InvestmentFirm, BatchEnrichmentJob } from "@shared/schema";
import { FIRM_CLASSIFICATIONS } from "@shared/schema";

const classificationTabs = ["All", ...FIRM_CLASSIFICATIONS, "Unclassified"] as const;

export default function InvestmentFirms() {
  const [searchQuery, setSearchQuery] = useState("");
  const [classificationFilter, setClassificationFilter] = useState<string>("All");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: firms = [], isLoading } = useQuery<InvestmentFirm[]>({
    queryKey: ["/api/firms"],
  });

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
        title: currentJob.status === "completed" ? "Deep Research Complete" : "Research Stopped",
        description: currentJob.status === "completed" 
          ? `Classified ${currentJob.successfulRecords} of ${currentJob.totalRecords} firms`
          : `Processed ${currentJob.processedRecords} firms before stopping`,
      });
    }
  }, [currentJob?.status]);

  const startEnrichmentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/enrichment/batch/start", {
        batchSize: 10,
        onlyUnclassified: true,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setActiveJobId(data.id);
      toast({
        title: "Deep Research Started",
        description: `Analyzing ${data.totalRecords} unclassified firms...`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to start research",
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

  const classificationCounts = useMemo(() => {
    const counts: Record<string, number> = { All: firms.length, Unclassified: 0 };
    FIRM_CLASSIFICATIONS.forEach(c => counts[c] = 0);
    
    firms.forEach(firm => {
      const classification = firm.firmClassification?.trim();
      if (classification && FIRM_CLASSIFICATIONS.includes(classification as any)) {
        counts[classification]++;
      } else {
        counts["Unclassified"]++;
      }
    });
    return counts;
  }, [firms]);

  const filteredFirms = firms.filter((firm) => {
    const matchesSearch =
      !searchQuery ||
      firm.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      firm.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      firm.industry?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesClassification =
      classificationFilter === "All" ||
      (classificationFilter === "Unclassified" && !firm.firmClassification) ||
      firm.firmClassification === classificationFilter;

    return matchesSearch && matchesClassification;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout 
      title="Investment Firms"
      subtitle="Browse venture capital and investment firms"
      heroHeight="35vh"
      videoUrl={videoBackgrounds.firms}
    >
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
              
              {user?.isAdmin && classificationCounts["Unclassified"] > 0 && (
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
                  Deep Research ({classificationCounts["Unclassified"]})
                </Button>
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
                      <p className="text-white font-medium">Deep Research in Progress</p>
                      <p className="text-white/50 text-sm">
                        Classifying firms with AI...
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
                      {classificationCounts[classification] || 0}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>

          <div className="mb-4 text-white/50 text-sm">
            Showing {filteredFirms.length} of {firms.length} investment firms
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredFirms.map((firm, index) => (
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
                      <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
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
    </AppLayout>
  );
}
