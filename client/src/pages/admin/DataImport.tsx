import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Upload, RefreshCw, CheckCircle, AlertCircle, Database, Plus, Trash2, RotateCcw, Building2, Users, Clock, XCircle, Search, Code, Layers, Copy, Sparkles, GitMerge, X, Settings, UserPlus, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "./AdminLayout";
import InvestorCSVImporter from "@/components/import/InvestorCSVImporter";
import UnifiedSmartImporter from "@/components/import/UnifiedSmartImporter";
import MissingRecordsScanner from "@/components/import/MissingRecordsScanner";
import FolkSettingsPanel from "@/components/import/FolkSettingsPanel";
import InvestorRecordEditor from "@/components/import/InvestorRecordEditor";
import FailedImportDetails from "@/components/import/FailedImportDetails";

interface FolkGroup {
  id: string;
  name: string;
}

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
  progressPercent: number | null;
  etaSeconds: number | null;
  importStage: string | null;
  errorSummary: string | null;
}

interface FieldMappingInfo {
  folkField: string;
  dbColumn: string | null;
  isMapped: boolean;
  sampleValues: any[];
}

interface FieldMappingData {
  people: {
    fields: FieldMappingInfo[];
    mappedCount: number;
    unmappedCount: number;
    fieldMap: Record<string, string>;
  };
  companies: {
    fields: FieldMappingInfo[];
    mappedCount: number;
    unmappedCount: number;
    fieldMap: Record<string, string>;
  };
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

interface PotentialDuplicate {
  id: string;
  entityType: string;
  entity1Id: string;
  entity2Id: string;
  matchType: string;
  similarityScore: number;
  matchDetails: Record<string, any>;
  status: string;
  entity1?: any;
  entity2?: any;
  createdAt: string | null;
}

interface EnrichmentJob {
  id: string;
  entityType: string;
  entityId: string;
  status: string;
  enrichmentType: string;
  suggestedUpdates: Record<string, any>;
  outputData: Record<string, any>;
  errorMessage: string | null;
  tokensUsed: number | null;
  createdAt: string | null;
  completedAt: string | null;
}

export default function DataImport() {
  const { toast } = useToast();
  const [folkStatus, setFolkStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [newWorkspaceId, setNewWorkspaceId] = useState("");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [selectedExploreGroup, setSelectedExploreGroup] = useState<string>("all");
  const [selectedScanType, setSelectedScanType] = useState<string>("investor");
  const [selectedEnrichInvestor, setSelectedEnrichInvestor] = useState<string>("");

  const { data: workspaces, isLoading: loadingWorkspaces } = useQuery<FolkWorkspace[]>({
    queryKey: ["/api/admin/folk/workspaces"],
  });

  // Import runs query with dynamic polling when imports are active
  const { data: importRuns, isLoading: loadingRuns } = useQuery<FolkImportRun[]>({
    queryKey: ["/api/admin/folk/import-runs"],
    refetchInterval: (query) => {
      const runs = query.state.data as FolkImportRun[] | undefined;
      const hasActive = runs?.some(run => run.status === "in_progress") ?? false;
      return hasActive ? 2000 : false;
    },
  });

  // Compute if there's an active import for UI state
  const hasActiveImport = importRuns?.some(run => run.status === "in_progress") ?? false;

  const { data: failedRecords } = useQuery<FolkFailedRecord[]>({
    queryKey: ["/api/admin/folk/failed-records"],
  });

  const { data: syncLogs } = useQuery<any[]>({
    queryKey: ["/api/admin/sync-logs"],
  });

  const { data: folkGroups, isLoading: loadingGroups } = useQuery<FolkGroup[]>({
    queryKey: ["/api/admin/folk/groups"],
  });

  // Duplicates query
  const { data: duplicates, isLoading: loadingDuplicates } = useQuery<PotentialDuplicate[]>({
    queryKey: ["/api/admin/duplicates"],
  });

  // Enrichment jobs query
  const { data: enrichmentJobs, isLoading: loadingEnrichment } = useQuery<EnrichmentJob[]>({
    queryKey: ["/api/admin/enrichment/jobs"],
  });

  // Investors query for enrichment
  const { data: investors } = useQuery<any[]>({
    queryKey: ["/api/investors"],
  });

  const { data: apiExploreData, isLoading: loadingExplore, refetch: refetchExplore } = useQuery<any>({
    queryKey: ["/api/admin/folk/explore", selectedExploreGroup],
    queryFn: async () => {
      const params = selectedExploreGroup !== "all" ? `?groupId=${selectedExploreGroup}` : "";
      const res = await fetch(`/api/admin/folk/explore${params}`);
      if (!res.ok) throw new Error("Failed to fetch explore data");
      return res.json();
    },
    enabled: false, // Only fetch when user explicitly requests
  });

  // Field mapping data with sample values
  const { data: fieldMappingData, isLoading: loadingFieldMapping, refetch: refetchFieldMapping } = useQuery<FieldMappingData>({
    queryKey: ["/api/admin/folk/field-mapping", selectedExploreGroup],
    queryFn: async () => {
      const params = selectedExploreGroup !== "all" ? `?groupId=${selectedExploreGroup}` : "";
      const res = await fetch(`/api/admin/folk/field-mapping${params}`);
      if (!res.ok) throw new Error("Failed to fetch field mapping");
      return res.json();
    },
    enabled: false,
  });

  // Format ETA for display
  const formatEta = (seconds: number | null): string => {
    if (!seconds || seconds <= 0) return "";
    if (seconds < 60) return `${seconds}s remaining`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s remaining`;
  };

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

  // Import from specific Folk group
  const importPeopleFromGroup = useMutation({
    mutationFn: async (groupId: string) => {
      const res = await apiRequest("POST", "/api/admin/folk/import/people-from-group", { groupId });
      return res.json() as Promise<FolkImportRun>;
    },
    onSuccess: () => {
      toast({ 
        title: "Import started", 
        description: `Importing people from group...` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/import-runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/failed-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const importCompaniesFromGroup = useMutation({
    mutationFn: async (groupId: string) => {
      const res = await apiRequest("POST", "/api/admin/folk/import/companies-from-group", { groupId });
      return res.json() as Promise<FolkImportRun>;
    },
    onSuccess: () => {
      toast({ 
        title: "Import started", 
        description: `Importing companies from group...` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/import-runs"] });
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

  // Duplicate detection mutations
  const scanDuplicates = useMutation({
    mutationFn: async (entityType: string) => {
      const res = await apiRequest("POST", "/api/admin/duplicates/scan", { entityType });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Scan complete", 
        description: `Found ${data.found} duplicates, ${data.created} new` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/duplicates"] });
    },
    onError: (error: Error) => {
      toast({ title: "Scan failed", description: error.message, variant: "destructive" });
    },
  });

  const mergeDuplicate = useMutation({
    mutationFn: async ({ id, primaryId, duplicateId }: { id: string; primaryId: string; duplicateId: string }) => {
      const res = await apiRequest("POST", `/api/admin/duplicates/${id}/merge`, { primaryId, duplicateId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Records merged successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/duplicates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
    },
    onError: (error: Error) => {
      toast({ title: "Merge failed", description: error.message, variant: "destructive" });
    },
  });

  const dismissDuplicate = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/admin/duplicates/${id}/dismiss`);
    },
    onSuccess: () => {
      toast({ title: "Duplicate dismissed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/duplicates"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to dismiss", description: error.message, variant: "destructive" });
    },
  });

  // AI Enrichment mutations
  const enrichEntity = useMutation({
    mutationFn: async ({ entityType, entityId }: { entityType: string; entityId: string }) => {
      const res = await apiRequest("POST", "/api/admin/enrichment/jobs", { 
        entityType, 
        entityId, 
        enrichmentType: "full_profile" 
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Enrichment job started" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrichment/jobs"] });
    },
    onError: (error: Error) => {
      toast({ title: "Enrichment failed", description: error.message, variant: "destructive" });
    },
  });

  const applyEnrichment = useMutation({
    mutationFn: async (jobId: string) => {
      return apiRequest("POST", `/api/admin/enrichment/jobs/${jobId}/apply`);
    },
    onSuccess: () => {
      toast({ title: "Enrichment applied successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrichment/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to apply", description: error.message, variant: "destructive" });
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
          <TabsList className="bg-white/5 border border-white/10 flex-wrap">
            <TabsTrigger value="folk" className="data-[state=active]:bg-white/10" data-testid="tab-folk">
              Folk CRM
            </TabsTrigger>
            <TabsTrigger value="csv" className="data-[state=active]:bg-white/10" data-testid="tab-csv">
              <Upload className="w-4 h-4 mr-1" />
              Import
            </TabsTrigger>
            <TabsTrigger value="duplicates" className="data-[state=active]:bg-white/10" data-testid="tab-duplicates">
              <Copy className="w-4 h-4 mr-1" />
              Duplicates {duplicates && duplicates.filter(d => d.status === "pending").length > 0 && (
                <Badge className="ml-2 bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)] border-0">
                  {duplicates.filter(d => d.status === "pending").length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="enrichment" className="data-[state=active]:bg-white/10" data-testid="tab-enrichment">
              <Sparkles className="w-4 h-4 mr-1" />
              AI Enrichment
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
            <TabsTrigger value="missing" className="data-[state=active]:bg-white/10" data-testid="tab-missing">
              <Search className="w-4 h-4 mr-1" />
              Missing Records
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-white/10" data-testid="tab-settings">
              <Settings className="w-4 h-4 mr-1" />
              Folk Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="folk" className="space-y-6">
            {/* Connection Status */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                      <Database className="w-5 h-5 text-[rgb(142,132,247)]" />
                    </div>
                    <div>
                      <CardTitle className="text-white">Folk CRM Connection</CardTitle>
                      <CardDescription className="text-white/50">
                        {folkStatus?.success ? "Connected to your Folk workspace" : "Test your connection to Folk CRM"}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {folkStatus?.success ? (
                      <Badge className="bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)] border-0">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Connected
                      </Badge>
                    ) : (
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
                    )}
                  </div>
                </div>
              </CardHeader>
              {folkStatus && !folkStatus.success && (
                <CardContent className="pt-0">
                  <div className="p-3 rounded-lg flex items-center gap-2 bg-[rgb(251,194,213)]/10 text-[rgb(251,194,213)]">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">{folkStatus.message}</span>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Available Data Tables/Groups */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[rgb(196,227,230)]/20 flex items-center justify-center">
                    <Layers className="w-5 h-5 text-[rgb(196,227,230)]" />
                  </div>
                  <div>
                    <CardTitle className="text-white">Available Contact Lists</CardTitle>
                    <CardDescription className="text-white/50">
                      Import investors and contacts from your Folk workspace groups
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingGroups ? (
                  <div className="text-white/40 text-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading available groups...
                  </div>
                ) : folkGroups && folkGroups.length > 0 ? (
                  <div className="space-y-3">
                    {folkGroups.map((group) => (
                      <div
                        key={group.id}
                        className="p-4 rounded-lg border bg-white/5 border-white/10 hover:border-white/20 transition-colors"
                        data-testid={`group-${group.id}`}
                      >
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                              <Users className="w-5 h-5 text-[rgb(142,132,247)]" />
                            </div>
                            <div>
                              <span className="text-white font-medium">{group.name}</span>
                              <div className="text-white/40 text-xs mt-0.5">
                                Contact list
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="default"
                            className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/90"
                            onClick={() => importPeopleFromGroup.mutate(group.id)}
                            disabled={importPeopleFromGroup.isPending || hasActiveImport}
                            data-testid={`button-import-people-${group.id}`}
                          >
                            {importPeopleFromGroup.isPending ? (
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Users className="w-4 h-4 mr-2" />
                            )}
                            Import Contacts
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-white/40 text-center py-8">
                    <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>No groups found in your Folk workspace.</p>
                    <p className="text-sm mt-1">Make sure your Folk API key is configured correctly.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Real-time Import Progress Tracker - Only show when there are active imports */}
            {hasActiveImport && importRuns && (
              <Card className="bg-[rgb(254,212,92)]/5 border-[rgb(254,212,92)]/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <CardTitle className="text-white flex items-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-[rgb(254,212,92)]" />
                      Import in Progress
                    </CardTitle>
                    <Badge className="bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)] border-0">
                      Live Updates
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {importRuns.filter(run => run.status === "in_progress").map((run) => (
                    <div 
                      key={run.id} 
                      className={`p-4 rounded-lg border ${
                        run.status === "in_progress" 
                          ? "bg-[rgb(254,212,92)]/5 border-[rgb(254,212,92)]/30" 
                          : run.status === "failed"
                          ? "bg-[rgb(251,194,213)]/5 border-[rgb(251,194,213)]/30"
                          : run.status === "completed"
                          ? "bg-[rgb(196,227,230)]/5 border-[rgb(196,227,230)]/30"
                          : "bg-white/5 border-white/10"
                      }`}
                    >
                      {/* Header row */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {run.sourceType === "people" ? (
                            <Users className="w-5 h-5 text-[rgb(142,132,247)]" />
                          ) : (
                            <Building2 className="w-5 h-5 text-[rgb(196,227,230)]" />
                          )}
                          <div>
                            <span className="text-white font-medium capitalize">{run.sourceType} Import</span>
                            <div className="text-white/40 text-xs">
                              {run.startedAt && new Date(run.startedAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {run.importStage && (
                            <Badge 
                              className={`border-0 ${
                                run.importStage === "fetching" 
                                  ? "bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)]"
                                  : run.importStage === "processing"
                                  ? "bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)]"
                                  : run.importStage === "completed"
                                  ? "bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)]"
                                  : "bg-[rgb(251,194,213)]/20 text-[rgb(251,194,213)]"
                              }`}
                            >
                              {run.importStage === "fetching" && "Fetching data..."}
                              {run.importStage === "processing" && "Processing..."}
                              {run.importStage === "completed" && "Completed"}
                              {run.importStage === "failed" && "Failed"}
                            </Badge>
                          )}
                          {getStatusBadge(run.status)}
                        </div>
                      </div>

                      {/* Progress bar for in-progress imports */}
                      {run.status === "in_progress" && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-white/60 text-sm">
                              {run.processedRecords || 0} of {run.totalRecords || "?"} records
                            </span>
                            <span className="text-white font-medium">
                              {run.progressPercent || 0}%
                            </span>
                          </div>
                          <div className="w-full bg-white/10 rounded-full h-3">
                            <div 
                              className="bg-gradient-to-r from-[rgb(254,212,92)] to-[rgb(254,212,92)]/80 h-3 rounded-full transition-all duration-500 relative overflow-hidden"
                              style={{ width: `${run.progressPercent || 0}%` }}
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
                            </div>
                          </div>
                          {run.etaSeconds && run.etaSeconds > 0 && (
                            <div className="text-white/40 text-xs mt-1 text-right">
                              {formatEta(run.etaSeconds)}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Stats grid */}
                      <div className="grid grid-cols-4 gap-3">
                        <div className="bg-white/5 rounded-lg p-2 text-center">
                          <div className="text-white/40 text-xs mb-1">Total</div>
                          <div className="text-white font-medium">{run.totalRecords || 0}</div>
                        </div>
                        <div className="bg-[rgb(196,227,230)]/10 rounded-lg p-2 text-center">
                          <div className="text-[rgb(196,227,230)]/60 text-xs mb-1">Created</div>
                          <div className="text-[rgb(196,227,230)] font-medium">{run.createdRecords || 0}</div>
                        </div>
                        <div className="bg-[rgb(142,132,247)]/10 rounded-lg p-2 text-center">
                          <div className="text-[rgb(142,132,247)]/60 text-xs mb-1">Updated</div>
                          <div className="text-[rgb(142,132,247)] font-medium">{run.updatedRecords || 0}</div>
                        </div>
                        <div className="bg-[rgb(251,194,213)]/10 rounded-lg p-2 text-center">
                          <div className="text-[rgb(251,194,213)]/60 text-xs mb-1">Failed</div>
                          <div className="text-[rgb(251,194,213)] font-medium">{run.failedRecords || 0}</div>
                        </div>
                      </div>

                      {/* Error message if failed */}
                      {run.status === "failed" && run.errorSummary && (
                        <div className="mt-3 p-2 bg-[rgb(251,194,213)]/10 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-[rgb(251,194,213)] mt-0.5 flex-shrink-0" />
                            <span className="text-[rgb(251,194,213)] text-sm">{run.errorSummary}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="csv">
            <div className="space-y-6">
              <UnifiedSmartImporter />
              <InvestorRecordEditor />
            </div>
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
                        className="p-4 bg-white/5 rounded-lg"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`w-2 h-2 rounded-full ${getStatusColor(run.status)}`} />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-white capitalize">{run.sourceType}</span>
                                {getStatusBadge(run.status)}
                                {run.importStage && run.status === "in_progress" && (
                                  <Badge variant="outline" className="text-xs">
                                    {run.importStage}
                                  </Badge>
                                )}
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
                            {run.etaSeconds && run.status === "in_progress" && (
                              <div className="text-white/40 text-xs">
                                {formatEta(run.etaSeconds)}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Progress bar for in-progress imports */}
                        {run.status === "in_progress" && run.progressPercent !== null && (
                          <div className="mt-3">
                            <div className="w-full bg-white/10 rounded-full h-2">
                              <div 
                                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                                style={{ width: `${run.progressPercent}%` }}
                              />
                            </div>
                            <div className="text-white/40 text-xs mt-1 text-right">
                              {run.progressPercent}%
                            </div>
                          </div>
                        )}
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
                            <FailedImportDetails record={record} />
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

          {/* Duplicates Tab */}
          <TabsContent value="duplicates" className="space-y-6">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[rgb(254,212,92)]/20 flex items-center justify-center">
                      <Copy className="w-5 h-5 text-[rgb(254,212,92)]" />
                    </div>
                    <div>
                      <CardTitle className="text-white">Duplicate Detection</CardTitle>
                      <CardDescription className="text-white/50">
                        Find and merge duplicate investor and contact records
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={selectedScanType} onValueChange={setSelectedScanType}>
                      <SelectTrigger className="w-[140px] border-white/20 text-white bg-white/5" data-testid="select-scan-type">
                        <SelectValue placeholder="Entity Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="investor">Investors</SelectItem>
                        <SelectItem value="contact">Contacts</SelectItem>
                        <SelectItem value="investment_firm">Firms</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      className="border-white/20 text-white"
                      onClick={() => scanDuplicates.mutate(selectedScanType)}
                      disabled={scanDuplicates.isPending}
                      data-testid="button-scan-duplicates"
                    >
                      {scanDuplicates.isPending ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4 mr-2" />
                      )}
                      Scan for Duplicates
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingDuplicates ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin text-white/40" />
                  </div>
                ) : duplicates && duplicates.filter(d => d.status === "pending").length > 0 ? (
                  <div className="space-y-4">
                    {duplicates.filter(d => d.status === "pending").map((dup) => (
                      <div key={dup.id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)] border-0">
                                {Math.round(dup.similarityScore * 100)}% Match
                              </Badge>
                              <Badge className="bg-white/10 text-white/60 border-0">
                                {dup.matchType}
                              </Badge>
                              <span className="text-white/40 text-sm">{dup.entityType}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="p-3 bg-white/5 rounded-md">
                                <p className="text-white font-medium text-sm mb-1">Record 1</p>
                                <p className="text-white/60 text-sm">
                                  {dup.entity1?.name || dup.entity1Id}
                                </p>
                                {dup.entity1?.email && (
                                  <p className="text-white/40 text-xs">{dup.entity1.email}</p>
                                )}
                              </div>
                              <div className="p-3 bg-white/5 rounded-md">
                                <p className="text-white font-medium text-sm mb-1">Record 2</p>
                                <p className="text-white/60 text-sm">
                                  {dup.entity2?.name || dup.entity2Id}
                                </p>
                                {dup.entity2?.email && (
                                  <p className="text-white/40 text-xs">{dup.entity2.email}</p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-[rgb(196,227,230)]/30 text-[rgb(196,227,230)]"
                              onClick={() => mergeDuplicate.mutate({
                                id: dup.id,
                                primaryId: dup.entity1Id,
                                duplicateId: dup.entity2Id
                              })}
                              disabled={mergeDuplicate.isPending}
                              data-testid={`button-merge-${dup.id}`}
                            >
                              <GitMerge className="w-4 h-4 mr-1" />
                              Merge
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-white/40"
                              onClick={() => dismissDuplicate.mutate(dup.id)}
                              disabled={dismissDuplicate.isPending}
                              data-testid={`button-dismiss-dup-${dup.id}`}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Not a Duplicate
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-white/40 text-center py-8 flex flex-col items-center gap-2">
                    <CheckCircle className="w-8 h-8 text-[rgb(196,227,230)]" />
                    <span>No pending duplicates</span>
                    <p className="text-sm">Click "Scan for Duplicates" to search for potential matches</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Enrichment Tab */}
          <TabsContent value="enrichment" className="space-y-6">
            {/* Start Enrichment Card */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-[rgb(142,132,247)]" />
                    </div>
                    <div>
                      <CardTitle className="text-white">Start AI Enrichment</CardTitle>
                      <CardDescription className="text-white/50">
                        Select an investor to enhance their profile with AI-powered data
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 flex-wrap">
                  <Select value={selectedEnrichInvestor} onValueChange={setSelectedEnrichInvestor}>
                    <SelectTrigger className="w-[280px] border-white/20 text-white bg-white/5" data-testid="select-enrich-investor">
                      <Users className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Select an investor" />
                    </SelectTrigger>
                    <SelectContent>
                      {investors?.map((investor) => (
                        <SelectItem key={investor.id} value={investor.id}>
                          {investor.name || investor.email || `Investor ${investor.id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="default"
                    onClick={() => {
                      if (selectedEnrichInvestor) {
                        enrichEntity.mutate({
                          entityType: "investor",
                          entityId: selectedEnrichInvestor
                        });
                        setSelectedEnrichInvestor("");
                      }
                    }}
                    disabled={!selectedEnrichInvestor || enrichEntity.isPending}
                    data-testid="button-start-enrichment"
                  >
                    {enrichEntity.isPending ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    Enrich Profile
                  </Button>
                </div>
                {!investors?.length && (
                  <p className="text-white/40 text-sm mt-3">No investors found. Import some investors first.</p>
                )}
              </CardContent>
            </Card>

            {/* Enrichment Jobs Card */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-[rgb(142,132,247)]" />
                    </div>
                    <div>
                      <CardTitle className="text-white">Enrichment Jobs</CardTitle>
                      <CardDescription className="text-white/50">
                        View and manage AI enrichment jobs
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingEnrichment ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin text-white/40" />
                  </div>
                ) : enrichmentJobs && enrichmentJobs.length > 0 ? (
                  <div className="space-y-4">
                    {enrichmentJobs.map((job) => (
                      <div key={job.id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              {job.status === "completed" && (
                                <Badge className="bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)] border-0">
                                  Completed
                                </Badge>
                              )}
                              {job.status === "pending" && (
                                <Badge className="bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)] border-0">
                                  Pending
                                </Badge>
                              )}
                              {job.status === "processing" && (
                                <Badge className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] border-0">
                                  Processing
                                </Badge>
                              )}
                              {job.status === "failed" && (
                                <Badge className="bg-[rgb(251,194,213)]/20 text-[rgb(251,194,213)] border-0">
                                  Failed
                                </Badge>
                              )}
                              <span className="text-white/40 text-sm">{job.entityType}</span>
                              <span className="text-white/40 text-sm">{job.enrichmentType}</span>
                            </div>
                            <p className="text-white text-sm">Entity ID: {job.entityId}</p>
                            {job.suggestedUpdates && Object.keys(job.suggestedUpdates).length > 0 && (
                              <div className="mt-2 p-2 bg-white/5 rounded text-sm">
                                <p className="text-white/60 mb-1">Suggested Updates:</p>
                                <pre className="text-white/40 text-xs overflow-x-auto">
                                  {JSON.stringify(job.suggestedUpdates, null, 2)}
                                </pre>
                              </div>
                            )}
                            {job.errorMessage && (
                              <p className="text-[rgb(251,194,213)] text-sm">{job.errorMessage}</p>
                            )}
                            {job.tokensUsed && (
                              <p className="text-white/30 text-xs">Tokens used: {job.tokensUsed}</p>
                            )}
                          </div>
                          <div className="flex flex-col gap-2">
                            {job.status === "completed" && job.suggestedUpdates && Object.keys(job.suggestedUpdates).length > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-[rgb(196,227,230)]/30 text-[rgb(196,227,230)]"
                                onClick={() => applyEnrichment.mutate(job.id)}
                                disabled={applyEnrichment.isPending}
                                data-testid={`button-apply-${job.id}`}
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Apply
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-white/40 text-center py-8 flex flex-col items-center gap-2">
                    <Sparkles className="w-8 h-8 text-[rgb(142,132,247)]" />
                    <span>No enrichment jobs yet</span>
                    <p className="text-sm">Enrichment jobs will appear here when you enrich investor profiles</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="explore">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
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
                  <div className="flex items-center gap-3">
                    <Select value={selectedExploreGroup} onValueChange={setSelectedExploreGroup}>
                      <SelectTrigger className="w-[200px] border-white/20 text-white bg-white/5" data-testid="select-explore-group">
                        <Layers className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Select group" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Groups</SelectItem>
                        {folkGroups?.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                </div>
              </CardHeader>
              <CardContent>
                {!apiExploreData ? (
                  <div className="text-white/40 text-center py-8">
                    Click "Fetch Sample Data" to explore the Folk API structure
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Groups Section */}
                    {apiExploreData.groups && apiExploreData.groups.length > 0 && (
                      <div>
                        <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                          <Layers className="w-4 h-4" />
                          Groups/Lists ({apiExploreData.groups.length} total)
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {apiExploreData.groups.map((group: FolkGroup) => (
                            <Badge 
                              key={group.id} 
                              className="bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)] border-0 cursor-pointer"
                              onClick={() => {
                                setSelectedExploreGroup(group.id);
                                setTimeout(() => refetchExplore(), 100);
                              }}
                              data-testid={`badge-group-${group.id}`}
                            >
                              {group.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        People Fields ({apiExploreData.people?.count || 0} samples)
                        {apiExploreData.people?.groupsInSample?.length > 0 && (
                          <span className="text-white/40 text-sm font-normal">
                            - in groups: {apiExploreData.people.groupsInSample.join(", ")}
                          </span>
                        )}
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
                        {apiExploreData.companies?.groupsInSample?.length > 0 && (
                          <span className="text-white/40 text-sm font-normal">
                            - in groups: {apiExploreData.companies.groupsInSample.join(", ")}
                          </span>
                        )}
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
                        <div className="flex items-center justify-between flex-wrap gap-4">
                          <CardTitle className="text-white text-sm">Field Mapping Reference</CardTitle>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-white/20 text-white"
                            onClick={() => refetchFieldMapping()}
                            disabled={loadingFieldMapping}
                            data-testid="button-fetch-field-mapping"
                          >
                            {loadingFieldMapping ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Search className="w-3 h-3 mr-1" />}
                            Analyze Fields
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {!fieldMappingData ? (
                          <div className="text-white/60 text-sm space-y-2">
                            <p>Click "Analyze Fields" to see which Folk fields are mapped to database columns with sample values.</p>
                          </div>
                        ) : (
                          <div className="text-white/60 text-sm space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <h4 className="text-white font-medium mb-2 flex items-center gap-2">
                                  <Users className="w-4 h-4" />
                                  People Fields
                                  <Badge className="bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)] border-0">
                                    {fieldMappingData.people.mappedCount} mapped
                                  </Badge>
                                  {fieldMappingData.people.unmappedCount > 0 && (
                                    <Badge className="bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)] border-0">
                                      {fieldMappingData.people.unmappedCount} unmapped
                                    </Badge>
                                  )}
                                </h4>
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                  {fieldMappingData.people.fields.map((field) => (
                                    <div 
                                      key={field.folkField}
                                      className={`p-2 rounded text-xs ${field.isMapped ? 'bg-[rgb(196,227,230)]/10' : 'bg-[rgb(254,212,92)]/10'}`}
                                    >
                                      <div className="flex items-center gap-2">
                                        {field.isMapped ? (
                                          <CheckCircle className="w-3 h-3 text-[rgb(196,227,230)]" />
                                        ) : (
                                          <AlertCircle className="w-3 h-3 text-[rgb(254,212,92)]" />
                                        )}
                                        <span className="text-white">{field.folkField}</span>
                                        {field.dbColumn && (
                                          <span className="text-white/40">→ {field.dbColumn}</span>
                                        )}
                                      </div>
                                      {field.sampleValues.length > 0 && (
                                        <div className="mt-1 text-white/40 truncate">
                                          Sample: {field.sampleValues.slice(0, 2).join(", ")}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <h4 className="text-white font-medium mb-2 flex items-center gap-2">
                                  <Building2 className="w-4 h-4" />
                                  Company Fields
                                  <Badge className="bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)] border-0">
                                    {fieldMappingData.companies.mappedCount} mapped
                                  </Badge>
                                  {fieldMappingData.companies.unmappedCount > 0 && (
                                    <Badge className="bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)] border-0">
                                      {fieldMappingData.companies.unmappedCount} unmapped
                                    </Badge>
                                  )}
                                </h4>
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                  {fieldMappingData.companies.fields.map((field) => (
                                    <div 
                                      key={field.folkField}
                                      className={`p-2 rounded text-xs ${field.isMapped ? 'bg-[rgb(196,227,230)]/10' : 'bg-[rgb(254,212,92)]/10'}`}
                                    >
                                      <div className="flex items-center gap-2">
                                        {field.isMapped ? (
                                          <CheckCircle className="w-3 h-3 text-[rgb(196,227,230)]" />
                                        ) : (
                                          <AlertCircle className="w-3 h-3 text-[rgb(254,212,92)]" />
                                        )}
                                        <span className="text-white">{field.folkField}</span>
                                        {field.dbColumn && (
                                          <span className="text-white/40">→ {field.dbColumn}</span>
                                        )}
                                      </div>
                                      {field.sampleValues.length > 0 && (
                                        <div className="mt-1 text-white/40 truncate">
                                          Sample: {field.sampleValues.slice(0, 2).join(", ")}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="missing">
            <MissingRecordsScanner />
          </TabsContent>

          <TabsContent value="settings">
            <FolkSettingsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
