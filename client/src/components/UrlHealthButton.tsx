import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Link, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UrlHealthJob {
  id: string;
  entityScope: string;
  status: string;
  totalRecords: number;
  processedRecords: number;
  validUrls: number;
  brokenUrls: number;
  repairedUrls: number;
  pendingReview: number;
  startedAt: string | null;
  completedAt: string | null;
}

interface UrlHealthStats {
  total: number;
  valid: number;
  redirected: number;
  broken: number;
  pending: number;
}

interface UrlHealthButtonProps {
  entityScope: "investmentFirms" | "investors" | "businessmen";
  label?: string;
}

export function UrlHealthButton({ entityScope, label = "Validate URLs" }: UrlHealthButtonProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: activeJobData, refetch: refetchActiveJob } = useQuery<{ job: UrlHealthJob | null }>({
    queryKey: ["/api/admin/url-health/jobs/active"],
    refetchInterval: (data) => data?.state?.data?.job ? 2000 : false,
    enabled: open,
  });

  const { data: stats, refetch: refetchStats } = useQuery<UrlHealthStats>({
    queryKey: ["/api/admin/url-health/stats", entityScope],
    enabled: open,
  });

  const startJobMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/url-health/jobs/start", {
        entityScope,
        includeAutoFix: true,
        confidenceThreshold: 0.85
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "URL validation started", description: "Processing URLs in the background..." });
      refetchActiveJob();
    },
    onError: (error: any) => {
      toast({ title: "Failed to start validation", description: error.message, variant: "destructive" });
    }
  });

  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("POST", `/api/admin/url-health/jobs/${jobId}/cancel`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job cancelled" });
      refetchActiveJob();
      refetchStats();
    }
  });

  const activeJob = activeJobData?.job;
  const isRunning = activeJob?.status === "running" || activeJob?.status === "pending";
  const progress = activeJob && activeJob.totalRecords > 0 
    ? Math.round((activeJob.processedRecords / activeJob.totalRecords) * 100) 
    : 0;

  const getScopeLabel = () => {
    switch (entityScope) {
      case "investmentFirms": return "Investment Firms";
      case "investors": return "Investors";
      case "businessmen": return "Top Family Business";
      default: return "All Entities";
    }
  };

  return (
    <>
      <Button 
        variant="outline" 
        onClick={() => setOpen(true)}
        data-testid={`button-validate-urls-${entityScope}`}
      >
        <Link className="w-4 h-4 mr-2" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>URL Health Validation</DialogTitle>
            <DialogDescription>
              Validate and repair website URLs for {getScopeLabel()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {stats && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Valid: {stats.valid}</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-500" />
                  <span>Redirected: {stats.redirected}</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <span>Broken: {stats.broken}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-muted-foreground" />
                  <span>Pending: {stats.pending}</span>
                </div>
              </div>
            )}

            {isRunning && activeJob && (
              <div className="space-y-2 p-3 rounded-md bg-muted">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Validation in Progress</span>
                  <Badge variant="secondary">
                    {activeJob.processedRecords} / {activeJob.totalRecords}
                  </Badge>
                </div>
                <Progress value={progress} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Valid: {activeJob.validUrls}</span>
                  <span>Broken: {activeJob.brokenUrls}</span>
                </div>
              </div>
            )}

            {activeJob?.status === "completed" && (
              <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">
                    Validation Complete
                  </span>
                </div>
                <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                  Processed {activeJob.processedRecords} URLs: {activeJob.validUrls} valid, {activeJob.brokenUrls} broken
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {isRunning ? (
              <Button 
                variant="destructive" 
                onClick={() => activeJob && cancelJobMutation.mutate(activeJob.id)}
                disabled={cancelJobMutation.isPending}
                data-testid="button-cancel-url-validation"
              >
                {cancelJobMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cancel"}
              </Button>
            ) : (
              <Button 
                onClick={() => startJobMutation.mutate()}
                disabled={startJobMutation.isPending}
                data-testid="button-start-url-validation"
              >
                {startJobMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Link className="w-4 h-4 mr-2" />
                )}
                Start Validation
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
