import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Upload, RefreshCw, CheckCircle, AlertCircle, Database, Plus, Trash2, RotateCcw, Building2, Users, Clock, XCircle, Search, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "./AdminLayout";

interface FolkWorkspace {
  id: string;
  workspaceId: string;
  name: string;
  slug: string | null;
  isActive: boolean | null;
  lastSyncedAt: string | null;
  createdAt: string | null;
}

interface FolkImportRun {
  id: string;
  workspaceId: string | null;
  sourceType: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  totalRecords: number | null;
  processedRecords: number | null;
  createdRecords: number | null;
  updatedRecords: number | null;
  failedRecords: number | null;
  errorSummary: string | null;
}

interface FolkFailedRecord {
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

export default function DataImport() {
  const { toast } = useToast();
  const [folkStatus, setFolkStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [newWorkspaceId, setNewWorkspaceId] = useState("");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);

  const { data: workspaces, isLoading: loadingWorkspaces } = useQuery<FolkWorkspace[]>({
    queryKey: ["/api/admin/folk/workspaces"],
  });

  const { data: importRuns, isLoading: loadingRuns } = useQuery<FolkImportRun[]>({
    queryKey: ["/api/admin/folk/import-runs"],
  });

  const { data: failedRecords } = useQuery<FolkFailedRecord[]>({
    queryKey: ["/api/admin/folk/failed-records"],
  });

  const { data: syncLogs } = useQuery<any[]>({
    queryKey: ["/api/admin/sync-logs"],
  });

  const { data: apiExploreData, isLoading: loadingExplore, refetch: refetchExplore } = useQuery<any>({
    queryKey: ["/api/admin/folk/explore"],
    enabled: false, // Only fetch when user explicitly requests
  });

  const testFolkConnection = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/folk/test");
      return res.json();
    },
    onSuccess: (data) => {
      setFolkStatus(data);
      if (data.success) {
        toast({ title: "Connection successful", description: data.message });
      } else {
        toast({ title: "Connection failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      setFolkStatus({ success: false, message: error.message });
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createWorkspace = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/admin/folk/workspaces", {
        workspaceId: newWorkspaceId,
        name: newWorkspaceName,
      });
    },
    onSuccess: () => {
      toast({ title: "Workspace created" });
      setNewWorkspaceId("");
      setNewWorkspaceName("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/workspaces"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create workspace", description: error.message, variant: "destructive" });
    },
  });

  const deleteWorkspace = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/folk/workspaces/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Workspace deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/workspaces"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete workspace", description: error.message, variant: "destructive" });
    },
  });

  const importPeople = useMutation({
    mutationFn: async (workspaceId: string) => {
      const res = await apiRequest("POST", "/api/admin/folk/import/people", { workspaceId });
      return res.json();
    },
    onSuccess: (data: FolkImportRun) => {
      toast({ 
        title: "Import completed", 
        description: `Created: ${data.createdRecords || 0}, Updated: ${data.updatedRecords || 0}, Failed: ${data.failedRecords || 0}` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/import-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/failed-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const importCompanies = useMutation({
    mutationFn: async (workspaceId: string) => {
      const res = await apiRequest("POST", "/api/admin/folk/import/companies", { workspaceId });
      return res.json();
    },
    onSuccess: (data: FolkImportRun) => {
      toast({ 
        title: "Import completed", 
        description: `Created: ${data.createdRecords || 0}, Updated: ${data.updatedRecords || 0}, Failed: ${data.failedRecords || 0}` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/import-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/failed-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investment-firms"] });
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const retryFailedRecord = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/folk/failed-records/${id}/retry`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Record imported successfully" });
      } else {
        toast({ title: "Retry failed", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/failed-records"] });
    },
    onError: (error: Error) => {
      toast({ title: "Retry failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteFailedRecord = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/folk/failed-records/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Record dismissed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/failed-records"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to dismiss", description: error.message, variant: "destructive" });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-[rgb(196,227,230)]";
      case "in_progress": return "bg-[rgb(254,212,92)]";
      case "failed": return "bg-[rgb(251,194,213)]";
      case "pending": return "bg-white/40";
      default: return "bg-white/20";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge className="bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)] border-0">Completed</Badge>;
      case "in_progress": return <Badge className="bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)] border-0">In Progress</Badge>;
      case "failed": return <Badge className="bg-[rgb(251,194,213)]/20 text-[rgb(251,194,213)] border-0">Failed</Badge>;
      case "pending": return <Badge className="bg-white/10 text-white/60 border-0">Pending</Badge>;
      default: return <Badge className="bg-white/10 text-white/60 border-0">{status}</Badge>;
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Data Import</h1>
          <p className="text-white/60">Import investors and companies from Folk CRM or CSV files</p>
        </div>

        <Tabs defaultValue="folk" className="space-y-6">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="folk" className="data-[state=active]:bg-white/10" data-testid="tab-folk">
              Folk CRM
            </TabsTrigger>
            <TabsTrigger value="csv" className="data-[state=active]:bg-white/10" data-testid="tab-csv">
              CSV Import
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-white/10" data-testid="tab-history">
              Import History
            </TabsTrigger>
            <TabsTrigger value="failed" className="data-[state=active]:bg-white/10" data-testid="tab-failed">
              Failed Records {failedRecords && failedRecords.length > 0 && (
                <Badge className="ml-2 bg-[rgb(251,194,213)]/20 text-[rgb(251,194,213)] border-0">
                  {failedRecords.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="explore" className="data-[state=active]:bg-white/10" data-testid="tab-explore">
              <Code className="w-4 h-4 mr-1" />
              API Explorer
            </TabsTrigger>
          </TabsList>

          <TabsContent value="folk" className="space-y-6">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                      <Database className="w-5 h-5 text-[rgb(142,132,247)]" />
                    </div>
                    <div>
                      <CardTitle className="text-white">Connection Status</CardTitle>
                      <CardDescription className="text-white/50">Test your Folk CRM connection</CardDescription>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="border-white/20 text-white"
                    onClick={() => testFolkConnection.mutate()}
                    disabled={testFolkConnection.isPending}
                    data-testid="button-test-folk"
                  >
                    {testFolkConnection.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                    Test Connection
                  </Button>
                </div>
              </CardHeader>
              {folkStatus && (
                <CardContent>
                  <div className={`
                    p-3 rounded-lg flex items-center gap-2
                    ${folkStatus.success ? 'bg-[rgb(196,227,230)]/10 text-[rgb(196,227,230)]' : 'bg-[rgb(251,194,213)]/10 text-[rgb(251,194,213)]'}
                  `}>
                    {folkStatus.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    <span className="text-sm">{folkStatus.message}</span>
                  </div>
                </CardContent>
              )}
            </Card>

            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white">Workspaces</CardTitle>
                    <CardDescription className="text-white/50">Manage your Folk CRM workspaces</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3 items-end">
                  <div className="flex-1 space-y-2">
                    <Label className="text-white/60">Workspace ID</Label>
                    <Input
                      value={newWorkspaceId}
                      onChange={(e) => setNewWorkspaceId(e.target.value)}
                      placeholder="e.g., 1000vc"
                      className="bg-white/5 border-white/20 text-white"
                      data-testid="input-workspace-id"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label className="text-white/60">Display Name</Label>
                    <Input
                      value={newWorkspaceName}
                      onChange={(e) => setNewWorkspaceName(e.target.value)}
                      placeholder="e.g., 1000 VC Network"
                      className="bg-white/5 border-white/20 text-white"
                      data-testid="input-workspace-name"
                    />
                  </div>
                  <Button
                    onClick={() => createWorkspace.mutate()}
                    disabled={!newWorkspaceId || !newWorkspaceName || createWorkspace.isPending}
                    className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
                    data-testid="button-add-workspace"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                  </Button>
                </div>

                {loadingWorkspaces ? (
                  <div className="text-white/40 text-center py-4">Loading workspaces...</div>
                ) : workspaces && workspaces.length > 0 ? (
                  <div className="space-y-3 pt-4">
                    {workspaces.map((ws) => (
                      <div
                        key={ws.id}
                        className={`
                          p-4 rounded-lg border transition-colors cursor-pointer
                          ${selectedWorkspace === ws.workspaceId 
                            ? 'bg-[rgb(142,132,247)]/10 border-[rgb(142,132,247)]/50' 
                            : 'bg-white/5 border-white/10 hover:border-white/20'}
                        `}
                        onClick={() => setSelectedWorkspace(ws.workspaceId)}
                        data-testid={`workspace-${ws.workspaceId}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-medium">{ws.name}</span>
                              <Badge className="bg-white/10 text-white/60 border-0">{ws.workspaceId}</Badge>
                              {ws.isActive === false && (
                                <Badge className="bg-white/10 text-white/40 border-0">Inactive</Badge>
                              )}
                            </div>
                            {ws.lastSyncedAt && (
                              <div className="text-white/40 text-sm mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Last synced: {new Date(ws.lastSyncedAt).toLocaleString()}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-white/20 text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                importPeople.mutate(ws.workspaceId);
                              }}
                              disabled={importPeople.isPending}
                              data-testid={`button-import-people-${ws.workspaceId}`}
                            >
                              {importPeople.isPending ? (
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Users className="w-4 h-4 mr-2" />
                              )}
                              Import People
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-white/20 text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                importCompanies.mutate(ws.workspaceId);
                              }}
                              disabled={importCompanies.isPending}
                              data-testid={`button-import-companies-${ws.workspaceId}`}
                            >
                              {importCompanies.isPending ? (
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Building2 className="w-4 h-4 mr-2" />
                              )}
                              Import Companies
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-white/40 hover:text-[rgb(251,194,213)]"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteWorkspace.mutate(ws.id);
                              }}
                              data-testid={`button-delete-workspace-${ws.workspaceId}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-white/40 text-center py-8">
                    No workspaces configured. Add a workspace to start importing.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="csv">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[rgb(254,212,92)]/20 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-[rgb(254,212,92)]" />
                  </div>
                  <div>
                    <CardTitle className="text-white">CSV Import</CardTitle>
                    <CardDescription className="text-white/50">Upload CSV files to import data</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center">
                  <Upload className="w-10 h-10 text-white/40 mx-auto mb-4" />
                  <p className="text-white/60 mb-2">Drag and drop CSV files here</p>
                  <p className="text-white/40 text-sm">or click to browse</p>
                </div>
                <p className="text-white/40 text-sm mt-4 text-center">Coming soon</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Import History</CardTitle>
                <CardDescription className="text-white/50">Track all import operations</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingRuns ? (
                  <div className="text-white/40 text-center py-8">Loading...</div>
                ) : importRuns && importRuns.length > 0 ? (
                  <div className="space-y-3">
                    {importRuns.map((run) => (
                      <div 
                        key={run.id}
                        className="flex items-center justify-between p-4 bg-white/5 rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-2 h-2 rounded-full ${getStatusColor(run.status)}`} />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-white capitalize">{run.sourceType}</span>
                              {getStatusBadge(run.status)}
                            </div>
                            <div className="text-white/40 text-sm mt-1">
                              {run.createdRecords || 0} created, {run.updatedRecords || 0} updated
                              {(run.failedRecords || 0) > 0 && (
                                <span className="text-[rgb(251,194,213)]"> , {run.failedRecords} failed</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-white/60 text-sm">
                            {run.startedAt && new Date(run.startedAt).toLocaleString()}
                          </div>
                          {run.totalRecords && (
                            <div className="text-white/40 text-xs">
                              {run.processedRecords || 0} / {run.totalRecords} processed
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-white/40 text-center py-8">No import history yet</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="failed">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-[rgb(251,194,213)]" />
                  Failed Records
                </CardTitle>
                <CardDescription className="text-white/50">Records that failed to import - retry or dismiss</CardDescription>
              </CardHeader>
              <CardContent>
                {failedRecords && failedRecords.length > 0 ? (
                  <div className="space-y-3">
                    {failedRecords.map((record) => (
                      <div 
                        key={record.id}
                        className="p-4 bg-white/5 rounded-lg border border-[rgb(251,194,213)]/20"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className="bg-white/10 text-white/60 border-0 capitalize">
                                {record.recordType}
                              </Badge>
                              <span className="text-white/40 text-sm">Folk ID: {record.folkId}</span>
                              {record.retryCount && record.retryCount > 0 && (
                                <Badge className="bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)] border-0">
                                  Retried {record.retryCount}x
                                </Badge>
                              )}
                            </div>
                            <div className="text-[rgb(251,194,213)] text-sm mb-2">
                              {record.errorMessage || "Unknown error"}
                            </div>
                            {record.payload && Object.keys(record.payload).length > 0 && (
                              <div className="text-white/40 text-xs bg-white/5 p-2 rounded mt-2 overflow-auto max-h-24">
                                <pre>{JSON.stringify(record.payload, null, 2)}</pre>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-[rgb(196,227,230)]/30 text-[rgb(196,227,230)]"
                              onClick={() => retryFailedRecord.mutate(record.id)}
                              disabled={retryFailedRecord.isPending}
                              data-testid={`button-retry-${record.id}`}
                            >
                              <RotateCcw className="w-4 h-4 mr-1" />
                              Retry
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-white/40 hover:text-white"
                              onClick={() => deleteFailedRecord.mutate(record.id)}
                              data-testid={`button-dismiss-${record.id}`}
                            >
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-white/40 text-center py-8 flex flex-col items-center gap-2">
                    <CheckCircle className="w-8 h-8 text-[rgb(196,227,230)]" />
                    <span>No failed records</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="explore">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                      <Code className="w-5 h-5 text-[rgb(142,132,247)]" />
                    </div>
                    <div>
                      <CardTitle className="text-white">API Data Explorer</CardTitle>
                      <CardDescription className="text-white/50">
                        View raw data structure from Folk API to understand field mapping
                      </CardDescription>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="border-white/20 text-white"
                    onClick={() => refetchExplore()}
                    disabled={loadingExplore}
                    data-testid="button-explore-api"
                  >
                    {loadingExplore ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                    Fetch Sample Data
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!apiExploreData ? (
                  <div className="text-white/40 text-center py-8">
                    Click "Fetch Sample Data" to explore the Folk API structure
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        People Fields ({apiExploreData.people?.count || 0} samples)
                      </h3>
                      <div className="bg-white/5 rounded-lg p-4 space-y-3">
                        <div>
                          <span className="text-white/60 text-sm">Standard Fields:</span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {apiExploreData.people?.fields?.map((field: string) => (
                              <Badge key={field} className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] border-0">
                                {field}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {apiExploreData.people?.customFields?.length > 0 && (
                          <div>
                            <span className="text-white/60 text-sm">Custom Fields:</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {apiExploreData.people?.customFields?.map((field: string) => (
                                <Badge key={field} className="bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)] border-0">
                                  {field}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <div>
                          <span className="text-white/60 text-sm">Sample Data:</span>
                          <pre className="text-white/40 text-xs bg-black/20 p-3 rounded mt-1 overflow-auto max-h-64">
                            {JSON.stringify(apiExploreData.people?.sample?.[0] || {}, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        Companies Fields ({apiExploreData.companies?.count || 0} samples)
                      </h3>
                      <div className="bg-white/5 rounded-lg p-4 space-y-3">
                        <div>
                          <span className="text-white/60 text-sm">Standard Fields:</span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {apiExploreData.companies?.fields?.map((field: string) => (
                              <Badge key={field} className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] border-0">
                                {field}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {apiExploreData.companies?.customFields?.length > 0 && (
                          <div>
                            <span className="text-white/60 text-sm">Custom Fields:</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {apiExploreData.companies?.customFields?.map((field: string) => (
                                <Badge key={field} className="bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)] border-0">
                                  {field}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <div>
                          <span className="text-white/60 text-sm">Sample Data:</span>
                          <pre className="text-white/40 text-xs bg-black/20 p-3 rounded mt-1 overflow-auto max-h-64">
                            {JSON.stringify(apiExploreData.companies?.sample?.[0] || {}, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>

                    <Card className="bg-white/5 border-white/10">
                      <CardHeader>
                        <CardTitle className="text-white text-sm">Field Mapping Reference</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-white/60 text-sm space-y-2">
                          <p>The following Folk fields are automatically mapped to database columns:</p>
                          <div className="grid grid-cols-2 gap-4 mt-4">
                            <div>
                              <h4 className="text-white font-medium mb-2">People</h4>
                              <ul className="text-xs space-y-1">
                                <li>First Name → firstName</li>
                                <li>Last Name → lastName</li>
                                <li>Title → title</li>
                                <li>Person Linkedin Url → personLinkedinUrl</li>
                                <li>Investor Type → investorType</li>
                                <li>Investor State → investorState</li>
                                <li>Investors Country → investorCountry</li>
                                <li>Fund HQ → fundHQ</li>
                                <li>HQ Location → hqLocation</li>
                                <li>Funding Stage → fundingStage</li>
                                <li>Typical Investment → typicalInvestment</li>
                                <li>Num Lead Investments → numLeadInvestments</li>
                                <li>Total Number of Investments → totalInvestments</li>
                                <li>Recent Investments → recentInvestments</li>
                                <li>Status → status</li>
                              </ul>
                            </div>
                            <div>
                              <h4 className="text-white font-medium mb-2">Companies</h4>
                              <ul className="text-xs space-y-1">
                                <li>Description → description</li>
                                <li>Funding raised → fundingRaised</li>
                                <li>Last funding date → lastFundingDate</li>
                                <li>Foundation year → foundationYear</li>
                                <li>Employee range → employeeRange</li>
                                <li>Industry → industry</li>
                                <li>HQ Location → hqLocation</li>
                                <li>Status → status</li>
                                <li>Linkedin → linkedinUrl</li>
                                <li>Website → website</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
