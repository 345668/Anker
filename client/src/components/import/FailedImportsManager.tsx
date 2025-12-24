import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  RefreshCw,
  Trash2,
  Loader2,
  Eye,
  Building2,
  User,
  CheckCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface FailedRecord {
  id: string;
  runId?: string;
  folkId: string;
  recordType: string;
  payload?: any;
  folkData?: any;
  errorCode?: string;
  errorMessage: string;
  retryCount?: number;
  resolvedAt?: string;
  createdAt: string;
}

export default function FailedImportsManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const [selectedFailure, setSelectedFailure] = useState<FailedRecord | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  const failedQuery = useQuery<FailedRecord[]>({
    queryKey: ["/api/admin/folk/failed-records"],
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/folk/failed-records/${id}/retry`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Record retried successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/failed-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investment-firms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    },
    onError: (error: Error) => {
      toast({ title: "Retry failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/folk/failed-records/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Failed record removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/failed-records"] });
    },
    onError: (error: Error) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  const retryAllMutation = useMutation({
    mutationFn: async () => {
      setRetrying(true);
      const records = failedQuery.data || [];
      let successful = 0;
      let failed = 0;

      for (const record of records) {
        try {
          await apiRequest("POST", `/api/admin/folk/failed-records/${record.id}/retry`);
          successful++;
        } catch {
          failed++;
        }
      }

      return { successful, failed };
    },
    onSuccess: (data) => {
      toast({
        title: "Retry complete",
        description: `${data.successful} successful, ${data.failed} still failed`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/failed-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investment-firms"] });
    },
    onSettled: () => {
      setRetrying(false);
    },
  });

  const viewDetails = (failure: FailedRecord) => {
    setSelectedFailure(failure);
    setShowDetailsDialog(true);
  };

  const failedRecords = failedQuery.data || [];

  if (failedQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-[rgb(142,132,247)]" />
      </div>
    );
  }

  if (failedRecords.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="w-5 h-5 text-[rgb(196,227,230)]" />
          <h3 className="font-semibold text-white">No Failed Imports</h3>
        </div>
        <p className="text-white/60 text-sm">All records imported successfully</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold text-white">Failed Imports</h3>
            <Badge className="bg-amber-500/20 text-amber-400 border-0">
              {failedRecords.length}
            </Badge>
          </div>
          <p className="text-white/60 text-sm mt-1">
            Records that failed during Folk CRM import
          </p>
        </div>
        <Button
          onClick={() => retryAllMutation.mutate()}
          disabled={retrying || failedRecords.length === 0}
          className="bg-[rgb(142,132,247)]"
          data-testid="button-retry-all"
        >
          {retrying ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Retry All
        </Button>
      </div>

      <div className="border border-white/10 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-white/5 border-white/10">
              <TableHead className="text-white/60">Type</TableHead>
              <TableHead className="text-white/60">Name</TableHead>
              <TableHead className="text-white/60">Error</TableHead>
              <TableHead className="text-white/60">Retries</TableHead>
              <TableHead className="text-white/60">Date</TableHead>
              <TableHead className="text-right text-white/60">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {failedRecords.map((failure) => {
              const folkData = failure.payload || failure.folkData || {};
              const name =
                failure.recordType === "company"
                  ? folkData.name
                  : folkData.fullName ||
                    `${folkData.firstName || ""} ${folkData.lastName || ""}`.trim();

              return (
                <TableRow key={failure.id} className="border-white/10">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {failure.recordType === "company" ? (
                        <Building2 className="w-4 h-4 text-[rgb(142,132,247)]" />
                      ) : (
                        <User className="w-4 h-4 text-[rgb(196,227,230)]" />
                      )}
                      <Badge
                        variant="outline"
                        className="capitalize border-white/20 text-white/80"
                      >
                        {failure.recordType}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-white">{name || "Unknown"}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-[rgb(251,194,213)] line-clamp-1">
                      {failure.errorMessage}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-white/20 text-white/60">
                      {failure.retryCount || 0} retries
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-white/50">
                      {new Date(failure.createdAt).toLocaleDateString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => viewDetails(failure)}
                        className="text-white/60 hover:text-white"
                        data-testid={`button-view-${failure.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => retryMutation.mutate(failure.id)}
                        disabled={retryMutation.isPending}
                        className="text-white/60 hover:text-white"
                        data-testid={`button-retry-${failure.id}`}
                      >
                        <RefreshCw
                          className={cn("w-4 h-4", retryMutation.isPending && "animate-spin")}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(failure.id)}
                        className="text-[rgb(251,194,213)] hover:text-[rgb(251,194,213)]/80"
                        data-testid={`button-delete-${failure.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-[#1a1a2e] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Failed Import Details</DialogTitle>
          </DialogHeader>

          {selectedFailure && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-white/70 mb-2">Error Message</h4>
                <div className="p-3 bg-[rgb(251,194,213)]/10 border border-[rgb(251,194,213)]/20 rounded-lg">
                  <p className="text-sm text-[rgb(251,194,213)]">{selectedFailure.errorMessage}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-white/70 mb-2">Folk Data</h4>
                <pre className="p-3 bg-white/5 border border-white/10 rounded-lg text-xs overflow-x-auto text-white/80">
                  {JSON.stringify(
                    selectedFailure.payload || selectedFailure.folkData,
                    null,
                    2
                  )}
                </pre>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-white/70 mb-1">Folk ID</h4>
                  <p className="text-sm text-white/60">{selectedFailure.folkId}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white/70 mb-1">Retry Count</h4>
                  <p className="text-sm text-white/60">{selectedFailure.retryCount || 0}</p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <Button
                  variant="outline"
                  onClick={() => setShowDetailsDialog(false)}
                  className="border-white/20 text-white"
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    retryMutation.mutate(selectedFailure.id);
                    setShowDetailsDialog(false);
                  }}
                  disabled={retryMutation.isPending}
                  className="bg-[rgb(142,132,247)]"
                >
                  {retryMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Retry Import
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
