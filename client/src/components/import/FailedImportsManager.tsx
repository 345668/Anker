import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  RefreshCw,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { apiRequest } from "@/lib/queryClient";

interface FailedRecord {
  id: string;
  folkId: string;
  recordType: string;
  folkData: any;
  errorMessage: string;
  importBatchId: string;
  createdAt: string;
}

export default function FailedImportsManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedRecords, setExpandedRecords] = useState<Set<string>>(new Set());

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
    },
    onError: (error: Error) => {
      toast({ title: "Retry failed", description: error.message, variant: "destructive" });
    },
  });

  const toggleExpanded = (id: string) => {
    const newSet = new Set(expandedRecords);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedRecords(newSet);
  };

  const failedRecords = failedQuery.data || [];

  if (failedQuery.isLoading) {
    return (
      <Card className="bg-white/5 border-white/10">
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-white/60">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading failed imports...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <AlertCircle className="w-5 h-5 text-[rgb(251,194,213)]" />
          Failed Imports
          {failedRecords.length > 0 && (
            <Badge className="ml-2 bg-[rgb(251,194,213)]/20 text-[rgb(251,194,213)] border-0">
              {failedRecords.length}
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="text-white/60">
          Review and retry failed import records
        </CardDescription>
      </CardHeader>
      <CardContent>
        {failedRecords.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/60">No failed imports</p>
            <p className="text-sm text-white/40 mt-1">All records imported successfully</p>
          </div>
        ) : (
          <div className="space-y-3">
            {failedRecords.map((record) => (
              <Collapsible
                key={record.id}
                open={expandedRecords.has(record.id)}
                onOpenChange={() => toggleExpanded(record.id)}
              >
                <div className="border border-white/10 rounded-lg bg-white/5">
                  <CollapsibleTrigger className="w-full p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className={record.recordType === "company" 
                          ? "text-[rgb(142,132,247)] border-[rgb(142,132,247)]/30" 
                          : "text-[rgb(196,227,230)] border-[rgb(196,227,230)]/30"
                        }
                      >
                        {record.recordType}
                      </Badge>
                      <span className="text-white font-medium">
                        {record.folkData?.name || record.folkData?.fullName || "Unknown"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {expandedRecords.has(record.id) ? (
                        <ChevronUp className="w-4 h-4 text-white/40" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-white/40" />
                      )}
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-4 pb-4 space-y-3">
                      <div className="p-3 bg-[rgb(251,194,213)]/10 rounded-lg">
                        <p className="text-sm text-[rgb(251,194,213)]">{record.errorMessage}</p>
                      </div>

                      <div className="text-xs text-white/40">
                        Folk ID: {record.folkId} | Batch: {record.importBatchId}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => retryMutation.mutate(record.id)}
                          disabled={retryMutation.isPending}
                          className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
                          data-testid={`button-retry-${record.id}`}
                        >
                          {retryMutation.isPending ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3 mr-1" />
                          )}
                          Retry
                        </Button>
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
