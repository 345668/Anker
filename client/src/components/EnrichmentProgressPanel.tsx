import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, XCircle, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface EnrichmentJob {
  id: string;
  status: string;
  totalRecords: number;
  processedRecords: number;
  enrichedRecords: number;
  failedRecords: number;
  startedAt: string | null;
  completedAt: string | null;
  entityType?: string;
}

interface EnrichmentProgressPanelProps {
  entityType: "investors" | "firms" | "businessmen" | "all";
  onComplete?: () => void;
}

export function EnrichmentProgressPanel({ entityType, onComplete }: EnrichmentProgressPanelProps) {
  const [dismissed, setDismissed] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: activeJobData, refetch: refetchActiveJob } = useQuery<{ job: EnrichmentJob | null; investorJob?: EnrichmentJob | null; firmJob?: EnrichmentJob | null }>({
    queryKey: ["/api/admin/enrichment/active"],
    queryFn: async () => {
      try {
        const [firmRes, investorRes] = await Promise.all([
          fetch("/api/admin/enrichment/batch/active"),
          fetch("/api/admin/enrichment/investors/active"),
        ]);
        
        let firmJob = null;
        let investorJob = null;
        
        if (firmRes.ok) {
          const firmData = await firmRes.json();
          firmJob = firmData.job;
        }
        
        if (investorRes.ok) {
          const investorData = await investorRes.json();
          investorJob = investorData.job;
        }
        
        return { 
          job: firmJob || investorJob,
          firmJob,
          investorJob 
        };
      } catch (error) {
        return { job: null, firmJob: null, investorJob: null };
      }
    },
    refetchInterval: (data) => {
      const hasActiveJob = data?.state?.data?.firmJob?.status === "running" || 
                           data?.state?.data?.investorJob?.status === "running";
      return hasActiveJob ? 2000 : false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const isFirmJob = activeJobData?.firmJob?.id === jobId;
      const endpoint = isFirmJob 
        ? `/api/admin/enrichment/batch/${jobId}/cancel`
        : `/api/admin/enrichment/investors/${jobId}/cancel`;
      return apiRequest("POST", endpoint, {});
    },
    onSuccess: () => {
      toast({ title: "Enrichment cancelled" });
      refetchActiveJob();
      onComplete?.();
    },
    onError: (error: any) => {
      toast({ title: "Failed to cancel", description: error.message, variant: "destructive" });
    }
  });

  const firmJob = activeJobData?.firmJob;
  const investorJob = activeJobData?.investorJob;
  
  const activeJob = firmJob?.status === "running" ? firmJob : 
                    investorJob?.status === "running" ? investorJob : 
                    firmJob || investorJob;

  const isRunning = activeJob?.status === "running" || activeJob?.status === "pending";
  const isCompleted = activeJob?.status === "completed";
  const isFailed = activeJob?.status === "failed";

  useEffect(() => {
    if (isCompleted && !dismissed) {
      onComplete?.();
    }
  }, [isCompleted, dismissed, onComplete]);

  if (!activeJob || dismissed) {
    return null;
  }

  const progress = activeJob.totalRecords > 0 
    ? Math.round((activeJob.processedRecords / activeJob.totalRecords) * 100) 
    : 0;

  const getJobTypeLabel = () => {
    if (activeJobData?.firmJob?.id === activeJob.id) return "Investment Firms";
    if (activeJobData?.investorJob?.id === activeJob.id) return "Investors";
    return "Records";
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
      >
        <Card className="border-white/10 bg-white/5 mb-6">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
                {isRunning && <Loader2 className="w-4 h-4 animate-spin text-[rgb(142,132,247)]" />}
                {isCompleted && <CheckCircle className="w-4 h-4 text-green-500" />}
                {isFailed && <AlertTriangle className="w-4 h-4 text-red-500" />}
                <span>
                  {isRunning ? "Deep Research in Progress" : 
                   isCompleted ? "Deep Research Complete" : 
                   "Deep Research Failed"}
                </span>
                <Badge variant="secondary" className="bg-white/10 text-white/70">
                  {getJobTypeLabel()}
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                {isRunning && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    onClick={() => cancelMutation.mutate(activeJob.id)}
                    disabled={cancelMutation.isPending}
                    data-testid="button-cancel-enrichment"
                  >
                    {cancelMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <XCircle className="w-4 h-4 mr-1" />
                        Cancel
                      </>
                    )}
                  </Button>
                )}
                {(isCompleted || isFailed) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white/60 hover:text-white"
                    onClick={() => setDismissed(true)}
                    data-testid="button-dismiss-enrichment"
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="py-3 px-4 pt-0">
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <div className="flex items-center justify-between text-xs text-white/50">
                <span>
                  {activeJob.processedRecords} of {activeJob.totalRecords} processed
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-green-400">
                    {activeJob.enrichedRecords || 0} enriched
                  </span>
                  {(activeJob.failedRecords || 0) > 0 && (
                    <span className="text-red-400">
                      {activeJob.failedRecords} failed
                    </span>
                  )}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
