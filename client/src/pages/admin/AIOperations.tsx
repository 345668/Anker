import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Search, RefreshCw, Brain, MessageSquare, XCircle, 
  CheckCircle, AlertTriangle, Clock, Loader2, Filter,
  ChevronDown, Zap
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogFooter, DialogDescription 
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "./AdminLayout";
import { formatDistanceToNow, format } from "date-fns";

interface Interview {
  id: string;
  founderId: string;
  founderName: string;
  companyName: string;
  stage: string | null;
  phase: string | null;
  status: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  founderEmail: string | null;
}

interface AiLog {
  id: string;
  operationType: string;
  status: string;
  userId: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  provider: string | null;
  model: string | null;
  tokensUsed: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancellationRequestedAt: string | null;
  userEmail: string | null;
}

interface AiStats {
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  totalTokensUsed: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  in_progress: "bg-blue-500/20 text-blue-400",
  completed: "bg-green-500/20 text-green-400",
  abandoned: "bg-red-500/20 text-red-400",
  running: "bg-blue-500/20 text-blue-400",
  failed: "bg-red-500/20 text-red-400",
  cancelled: "bg-orange-500/20 text-orange-400",
};

const OPERATION_LABELS: Record<string, string> = {
  interview_question: "Interview Question",
  interview_evaluation: "Interview Evaluation",
  interview_feedback: "Interview Feedback",
  deck_analysis: "Deck Analysis",
  company_extraction: "Company Extraction",
  investor_enrichment: "Investor Enrichment",
  firm_enrichment: "Firm Enrichment",
  match_generation: "Match Generation",
  intro_generation: "Intro Generation",
  chatbot_response: "Chatbot Response",
  other: "Other",
};

export default function AIOperations() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("interviews");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [itemToCancel, setItemToCancel] = useState<{ type: "interview" | "aiLog"; item: Interview | AiLog } | null>(null);

  const { data: interviewsData, isLoading: interviewsLoading, refetch: refetchInterviews } = useQuery<{
    interviews: Interview[];
    total: number;
  }>({
    queryKey: ["/api/admin/interviews", statusFilter],
    queryFn: async () => {
      const url = statusFilter 
        ? `/api/admin/interviews?status=${statusFilter}`
        : "/api/admin/interviews";
      const res = await fetch(url, { credentials: "include" });
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: aiLogsData, isLoading: aiLogsLoading, refetch: refetchAiLogs } = useQuery<{
    logs: AiLog[];
    total: number;
    running: number;
  }>({
    queryKey: ["/api/admin/ai-logs", statusFilter],
    queryFn: async () => {
      const url = statusFilter 
        ? `/api/admin/ai-logs?status=${statusFilter}`
        : "/api/admin/ai-logs";
      const res = await fetch(url, { credentials: "include" });
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: aiStats } = useQuery<AiStats>({
    queryKey: ["/api/admin/ai-stats"],
  });

  const cancelInterviewMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/admin/interviews/${id}/cancel`);
    },
    onSuccess: () => {
      toast({ title: "Interview cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/interviews"] });
      setCancelDialogOpen(false);
      setItemToCancel(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const cancelAiLogMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/admin/ai-logs/${id}/cancel`);
    },
    onSuccess: () => {
      toast({ title: "AI operation cancelled" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-logs"] });
      setCancelDialogOpen(false);
      setItemToCancel(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCancel = () => {
    if (!itemToCancel) return;
    
    if (itemToCancel.type === "interview") {
      cancelInterviewMutation.mutate(itemToCancel.item.id);
    } else {
      cancelAiLogMutation.mutate(itemToCancel.item.id);
    }
  };

  const openCancelDialog = (type: "interview" | "aiLog", item: Interview | AiLog) => {
    setItemToCancel({ type, item });
    setCancelDialogOpen(true);
  };

  const filteredInterviews = interviewsData?.interviews?.filter(interview => {
    const query = searchQuery.toLowerCase();
    return (
      interview.companyName?.toLowerCase().includes(query) ||
      interview.founderName?.toLowerCase().includes(query) ||
      interview.founderEmail?.toLowerCase().includes(query)
    );
  });

  const filteredAiLogs = aiLogsData?.logs?.filter(log => {
    const query = searchQuery.toLowerCase();
    return (
      log.operationType?.toLowerCase().includes(query) ||
      log.userEmail?.toLowerCase().includes(query) ||
      log.relatedEntityType?.toLowerCase().includes(query)
    );
  });

  const runningInterviews = interviewsData?.interviews?.filter(i => i.status === "in_progress").length || 0;

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">AI Operations</h1>
          <p className="text-white/60">Monitor and manage AI interviews and processing operations</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Active Interviews</p>
                  <p className="text-2xl font-bold text-white">{runningInterviews}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <Brain className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Running AI Jobs</p>
                  <p className="text-2xl font-bold text-white">{aiLogsData?.running || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <Zap className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Total Tokens Used</p>
                  <p className="text-2xl font-bold text-white">
                    {aiStats?.totalTokensUsed?.toLocaleString() || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/20">
                  <Clock className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Total Interviews</p>
                  <p className="text-2xl font-bold text-white">{interviewsData?.total || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <TabsList className="bg-white/5">
              <TabsTrigger 
                value="interviews" 
                className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white"
                data-testid="tab-interviews"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Interviews
                {runningInterviews > 0 && (
                  <Badge className="ml-2 bg-blue-500/20 text-blue-400">{runningInterviews}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger 
                value="ai-logs"
                className="data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white"
                data-testid="tab-ai-logs"
              >
                <Brain className="w-4 h-4 mr-2" />
                AI Processing Logs
                {(aiLogsData?.running || 0) > 0 && (
                  <Badge className="ml-2 bg-purple-500/20 text-purple-400">{aiLogsData?.running}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  data-testid="input-search-operations"
                />
              </div>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="bg-white/5 border-white/10 text-white">
                    <Filter className="w-4 h-4 mr-2" />
                    {statusFilter || "All Status"}
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[rgb(30,30,30)] border-white/10">
                  <DropdownMenuItem 
                    onClick={() => setStatusFilter(null)}
                    className="text-white hover:bg-white/10"
                  >
                    All Status
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10" />
                  {activeTab === "interviews" ? (
                    <>
                      <DropdownMenuItem onClick={() => setStatusFilter("pending")} className="text-white hover:bg-white/10">Pending</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setStatusFilter("in_progress")} className="text-white hover:bg-white/10">In Progress</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setStatusFilter("completed")} className="text-white hover:bg-white/10">Completed</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setStatusFilter("abandoned")} className="text-white hover:bg-white/10">Abandoned</DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={() => setStatusFilter("running")} className="text-white hover:bg-white/10">Running</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setStatusFilter("completed")} className="text-white hover:bg-white/10">Completed</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setStatusFilter("failed")} className="text-white hover:bg-white/10">Failed</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setStatusFilter("cancelled")} className="text-white hover:bg-white/10">Cancelled</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button 
                variant="outline" 
                size="icon"
                onClick={() => activeTab === "interviews" ? refetchInterviews() : refetchAiLogs()}
                className="bg-white/5 border-white/10 text-white"
                data-testid="button-refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <TabsContent value="interviews" className="mt-0">
            {interviewsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-[rgb(142,132,247)] animate-spin" />
              </div>
            ) : (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Company</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Founder</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Stage</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Phase</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Status</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Started</th>
                        <th className="text-right text-white/50 text-sm font-medium px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInterviews?.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-white/40">
                            No interviews found
                          </td>
                        </tr>
                      ) : (
                        filteredInterviews?.map((interview) => (
                          <tr 
                            key={interview.id} 
                            className="border-b border-white/5 hover:bg-white/5"
                            data-testid={`row-interview-${interview.id}`}
                          >
                            <td className="px-4 py-3">
                              <span className="text-white font-medium">{interview.companyName}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div>
                                <span className="text-white">{interview.founderName}</span>
                                {interview.founderEmail && (
                                  <p className="text-white/40 text-sm">{interview.founderEmail}</p>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="border-white/20 text-white/60">
                                {interview.stage || "—"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-white/60 capitalize">
                                {interview.phase?.replace(/_/g, " ") || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={STATUS_COLORS[interview.status || "pending"]}>
                                {interview.status === "in_progress" && (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                )}
                                {interview.status?.replace(/_/g, " ") || "pending"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-white/60 text-sm">
                                {interview.startedAt 
                                  ? formatDistanceToNow(new Date(interview.startedAt), { addSuffix: true })
                                  : interview.createdAt 
                                    ? formatDistanceToNow(new Date(interview.createdAt), { addSuffix: true })
                                    : "—"
                                }
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {(interview.status === "pending" || interview.status === "in_progress") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openCancelDialog("interview", interview)}
                                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                  data-testid={`button-cancel-interview-${interview.id}`}
                                >
                                  <XCircle className="w-4 h-4 mr-1" />
                                  Cancel
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="ai-logs" className="mt-0">
            {aiLogsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-[rgb(142,132,247)] animate-spin" />
              </div>
            ) : (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Operation</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">User</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Entity</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Status</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Tokens</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Started</th>
                        <th className="text-right text-white/50 text-sm font-medium px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAiLogs?.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-white/40">
                            No AI processing logs found
                          </td>
                        </tr>
                      ) : (
                        filteredAiLogs?.map((log) => (
                          <tr 
                            key={log.id} 
                            className="border-b border-white/5 hover:bg-white/5"
                            data-testid={`row-ai-log-${log.id}`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Brain className="w-4 h-4 text-purple-400" />
                                <span className="text-white font-medium">
                                  {OPERATION_LABELS[log.operationType] || log.operationType}
                                </span>
                              </div>
                              {log.model && (
                                <p className="text-white/40 text-xs ml-6">{log.model}</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-white/60 text-sm">
                                {log.userEmail || "System"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {log.relatedEntityType ? (
                                <Badge variant="outline" className="border-white/20 text-white/60">
                                  {log.relatedEntityType}
                                </Badge>
                              ) : (
                                <span className="text-white/40">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={STATUS_COLORS[log.status || "running"]}>
                                {log.status === "running" && (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                )}
                                {log.status}
                              </Badge>
                              {log.errorMessage && (
                                <p className="text-red-400 text-xs mt-1 max-w-xs truncate" title={log.errorMessage}>
                                  {log.errorMessage}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-white/60">
                                {log.tokensUsed?.toLocaleString() || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-white/60 text-sm">
                                {log.startedAt 
                                  ? formatDistanceToNow(new Date(log.startedAt), { addSuffix: true })
                                  : "—"
                                }
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {log.status === "running" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openCancelDialog("aiLog", log)}
                                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                  data-testid={`button-cancel-ai-log-${log.id}`}
                                >
                                  <XCircle className="w-4 h-4 mr-1" />
                                  Stop
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogContent className="bg-[rgb(30,30,30)] border-white/10">
            <DialogHeader>
              <DialogTitle className="text-white">
                {itemToCancel?.type === "interview" ? "Cancel Interview" : "Stop AI Operation"}
              </DialogTitle>
              <DialogDescription className="text-white/60">
                {itemToCancel?.type === "interview" 
                  ? `Are you sure you want to cancel the interview for "${(itemToCancel.item as Interview).companyName}"? This action cannot be undone.`
                  : `Are you sure you want to stop this ${OPERATION_LABELS[(itemToCancel?.item as AiLog)?.operationType] || "AI operation"}? The operation will be marked as cancelled.`
                }
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setCancelDialogOpen(false)}
                className="bg-white/5 border-white/10 text-white"
              >
                Keep Running
              </Button>
              <Button 
                variant="destructive"
                onClick={handleCancel}
                disabled={cancelInterviewMutation.isPending || cancelAiLogMutation.isPending}
                data-testid="button-confirm-cancel"
              >
                {(cancelInterviewMutation.isPending || cancelAiLogMutation.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {itemToCancel?.type === "interview" ? "Cancel Interview" : "Stop Operation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
