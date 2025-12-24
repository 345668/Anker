import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  X,
  Copy,
  CheckCircle,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";

interface FailedRecord {
  id: string;
  runId: string;
  recordType: string;
  folkId: string;
  payload: Record<string, any>;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number | null;
  resolvedAt: string | null;
  createdAt: string | null;
}

interface Props {
  record: FailedRecord;
  onClose?: () => void;
}

export default function FailedImportDetails({ record, onClose }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const retryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/folk/failed-records/${record.id}/retry`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Retry started",
        description: "The record is being reprocessed",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/failed-records"] });
      setOpen(false);
      onClose?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Retry failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/admin/folk/failed-records/${record.id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Record dismissed",
        description: "The failed record has been dismissed",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/failed-records"] });
      setOpen(false);
      onClose?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Dismiss failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied",
      description: "Data copied to clipboard",
    });
  };

  const getErrorBadge = (errorCode: string | null) => {
    if (!errorCode) return <Badge className="bg-white/10 text-white/60 border-0">Unknown</Badge>;
    
    switch (errorCode.toLowerCase()) {
      case "duplicate":
        return <Badge className="bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)] border-0">Duplicate</Badge>;
      case "validation":
        return <Badge className="bg-[rgb(251,194,213)]/20 text-[rgb(251,194,213)] border-0">Validation</Badge>;
      case "network":
        return <Badge className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] border-0">Network</Badge>;
      default:
        return <Badge className="bg-[rgb(251,194,213)]/20 text-[rgb(251,194,213)] border-0">{errorCode}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-white/60" data-testid={`button-view-failed-${record.id}`}>
          View Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden bg-[#1a1a2e] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-[rgb(251,194,213)]" />
            Failed Import Details
          </DialogTitle>
          <DialogDescription className="text-white/60">
            Folk ID: {record.folkId} - {record.recordType}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="error" className="mt-4">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="error" className="data-[state=active]:bg-white/10">
              Error
            </TabsTrigger>
            <TabsTrigger value="payload" className="data-[state=active]:bg-white/10">
              Folk Data
            </TabsTrigger>
          </TabsList>

          <TabsContent value="error" className="mt-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-white/60 text-sm">Error Type:</span>
                {getErrorBadge(record.errorCode)}
              </div>
              <div className="p-4 bg-[rgb(251,194,213)]/10 border border-[rgb(251,194,213)]/20 rounded-lg">
                <p className="text-[rgb(251,194,213)] text-sm">
                  {record.errorMessage || "Unknown error occurred"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-white/40">Retry Count:</span>
                <span className="text-white ml-2">{record.retryCount || 0}</span>
              </div>
              <div>
                <span className="text-white/40">Created:</span>
                <span className="text-white ml-2">
                  {record.createdAt
                    ? new Date(record.createdAt).toLocaleString()
                    : "Unknown"}
                </span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="payload" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Raw Folk API Data</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(JSON.stringify(record.payload, null, 2))}
                className="text-white/60"
                data-testid="button-copy-payload"
              >
                {copied ? (
                  <CheckCircle className="w-4 h-4 mr-2 text-[rgb(196,227,230)]" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="max-h-[300px] overflow-auto">
              <pre className="p-4 bg-white/5 border border-white/10 rounded-lg text-xs text-white/80 overflow-x-auto">
                {JSON.stringify(record.payload, null, 2)}
              </pre>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between pt-4 border-t border-white/10 mt-4">
          <Button
            variant="ghost"
            onClick={() => dismissMutation.mutate()}
            disabled={dismissMutation.isPending}
            className="text-white/60"
            data-testid="button-dismiss-failed"
          >
            {dismissMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            Dismiss
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-white/20 text-white"
              data-testid="button-close-failed-details"
            >
              Close
            </Button>
            <Button
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
              className="bg-[rgb(142,132,247)]"
              data-testid="button-retry-failed"
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
      </DialogContent>
    </Dialog>
  );
}
