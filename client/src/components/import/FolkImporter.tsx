import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Loader2,
  CheckCircle,
  AlertCircle,
  Building2,
  Users,
  ArrowRight,
  Sparkles,
  ArrowUpDown,
  Settings2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { fullSync } from "@/lib/folkSyncEngine";
import { cn } from "@/lib/utils";
import FieldMappingPanel from "./FieldMappingPanel";

interface Props {
  onImportComplete?: (results: { firms: number; contacts: number; failed?: number }) => void;
}

export default function FolkImporter({ onImportComplete }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStage, setSyncStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState({ firms: 0, contacts: 0, failed: 0 });
  const [syncResults, setSyncResults] = useState<any>(null);
  const [step, setStep] = useState<"idle" | "mapping" | "importing" | "complete" | "syncing">("idle");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [mappingsApproved, setMappingsApproved] = useState(false);

  const groupsQuery = useQuery<any[]>({
    queryKey: ["/api/admin/folk/groups"],
  });

  const connectionQuery = useQuery({
    queryKey: ["/api/admin/folk/test"],
  });

  useEffect(() => {
    if (groupsQuery.data && groupsQuery.data.length > 0 && !selectedGroup) {
      setSelectedGroup(groupsQuery.data[0].id);
    }
  }, [groupsQuery.data, selectedGroup]);

  const handleImportFromFolk = async () => {
    if (!selectedGroup) {
      toast({ title: "Please select a Folk group", variant: "destructive" });
      return;
    }

    setImporting(true);
    setStep("importing");
    setProgress(0);
    setResults({ firms: 0, contacts: 0, failed: 0 });
    toast({ title: "Connecting to Folk CRM..." });

    try {
      const res = await apiRequest("POST", "/api/admin/folk/import", { groupId: selectedGroup });
      const data = await res.json();

      setProgress(100);
      setResults({
        firms: data.firms || 0,
        contacts: data.contacts || 0,
        failed: data.failed || 0,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investment-firms"] });

      setStep("complete");
      toast({
        title: "Import complete!",
        description: `${data.firms || 0} firms and ${data.contacts || 0} contacts imported.`,
      });

      onImportComplete?.({ firms: data.firms || 0, contacts: data.contacts || 0, failed: data.failed });
    } catch (error: any) {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
      setStep("idle");
    } finally {
      setImporting(false);
    }
  };

  const handleBiDirectionalSync = async () => {
    if (!selectedGroup) {
      toast({ title: "Please select a Folk group", variant: "destructive" });
      return;
    }

    setSyncing(true);
    setStep("syncing");
    setSyncResults(null);
    toast({ title: `Starting bi-directional sync...` });

    try {
      const results = await fullSync(selectedGroup, ({ stage, progress }) => {
        setSyncStage(stage);
        setProgress(progress);
      });

      setSyncResults(results);
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investment-firms"] });

      const totalChanges =
        results.fromFolk.created + results.fromFolk.updated +
        results.toFolk.created + results.toFolk.updated;

      toast({ title: "Sync complete!", description: `${totalChanges} records synchronized.` });
      setStep("complete");

      onImportComplete?.({
        firms: results.fromFolk.created,
        contacts: results.fromFolk.updated,
      });
    } catch (error: any) {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
      setStep("idle");
    } finally {
      setSyncing(false);
    }
  };

  const isConnected = (connectionQuery.data as any)?.success;
  const groups = groupsQuery.data || [];

  return (
    <div className="space-y-6">
      {step === "idle" && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Building2 className="w-5 h-5 text-[rgb(142,132,247)]" />
              Import from Folk CRM
            </CardTitle>
            <CardDescription className="text-white/60">
              Sync your investor contacts and firms from Folk CRM automatically
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-[rgb(142,132,247)]/10 border border-[rgb(142,132,247)]/30 rounded-lg p-6">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="w-12 h-12 rounded-full bg-[rgb(142,132,247)] flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <h3 className="font-semibold text-white mb-1">Automatic Sync</h3>
                  <p className="text-sm text-white/70 mb-4">
                    Connect to your Folk CRM account and automatically import all investor contacts and firms.
                    Data will be matched and deduplicated automatically.
                  </p>

                  <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
                    <label className="text-xs font-medium text-white/80 mb-2 block">
                      Select Folk Group
                    </label>
                    {groupsQuery.isLoading ? (
                      <div className="flex items-center gap-2 text-sm text-white/60">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading groups...
                      </div>
                    ) : groups.length > 0 ? (
                      <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                        <SelectTrigger className="bg-white/5 border-white/20 text-white" data-testid="select-folk-group">
                          <SelectValue placeholder="Select a group" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups.map((group: any) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-[rgb(251,194,213)]">
                        {isConnected ? "No groups found in Folk CRM" : "Connect to Folk first"}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm text-white/80">
                      <CheckCircle className="w-4 h-4 text-[rgb(196,227,230)]" />
                      Imports contacts with company information
                    </div>
                    <div className="flex items-center gap-2 text-sm text-white/80">
                      <CheckCircle className="w-4 h-4 text-[rgb(196,227,230)]" />
                      Automatically creates or matches firms
                    </div>
                    <div className="flex items-center gap-2 text-sm text-white/80">
                      <CheckCircle className="w-4 h-4 text-[rgb(196,227,230)]" />
                      Deduplicates existing data
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3 flex-wrap">
                      <Button
                        onClick={() => setStep("mapping")}
                        disabled={importing || syncing || !selectedGroup || groupsQuery.isLoading}
                        className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
                        data-testid="button-configure-mapping"
                      >
                        <Sparkles className="w-4 h-4 mr-2" />
                        AI Field Mapping
                      </Button>
                      <Button
                        onClick={handleBiDirectionalSync}
                        disabled={importing || syncing || !selectedGroup || groupsQuery.isLoading}
                        variant="outline"
                        className="border-white/20 text-white/80"
                        data-testid="button-bidirectional-sync"
                      >
                        <ArrowUpDown className="w-4 h-4 mr-2" />
                        Bi-Directional Sync
                      </Button>
                    </div>
                    <p className="text-xs text-white/50">
                      Use AI Field Mapping to customize how Folk fields map to your database
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "mapping" && selectedGroup && (
        <div className="space-y-4">
          <FieldMappingPanel 
            groupId={selectedGroup} 
            onMappingsApproved={() => {
              setMappingsApproved(true);
              handleImportFromFolk();
            }}
          />
          <div className="flex gap-3 justify-between flex-wrap">
            <Button
              variant="outline"
              onClick={() => {
                setStep("idle");
                setMappingsApproved(false);
              }}
              className="border-white/20 text-white/80"
              data-testid="button-back-to-group"
            >
              Back to Group Selection
            </Button>
          </div>
        </div>
      )}

      {step === "importing" && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Loader2 className="w-5 h-5 animate-spin text-[rgb(142,132,247)]" />
              Importing from Folk CRM...
            </CardTitle>
            <CardDescription className="text-white/60">
              Syncing your investor data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Progress</span>
                <span className="font-medium text-white">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="flex items-center justify-center gap-8 flex-wrap">
              <div className="text-center">
                <div className="flex items-center justify-center w-12 h-12 bg-[rgb(142,132,247)]/20 rounded-full mx-auto mb-2">
                  <Building2 className="w-6 h-6 text-[rgb(142,132,247)]" />
                </div>
                <p className="text-2xl font-bold text-[rgb(142,132,247)]">{results.firms}</p>
                <p className="text-sm text-white/50">Firms</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center w-12 h-12 bg-[rgb(196,227,230)]/20 rounded-full mx-auto mb-2">
                  <Users className="w-6 h-6 text-[rgb(196,227,230)]" />
                </div>
                <p className="text-2xl font-bold text-[rgb(196,227,230)]">{results.contacts}</p>
                <p className="text-sm text-white/50">Contacts</p>
              </div>
              {results.failed > 0 && (
                <div className="text-center">
                  <div className="flex items-center justify-center w-12 h-12 bg-[rgb(251,194,213)]/20 rounded-full mx-auto mb-2">
                    <AlertCircle className="w-6 h-6 text-[rgb(251,194,213)]" />
                  </div>
                  <p className="text-2xl font-bold text-[rgb(251,194,213)]">{results.failed}</p>
                  <p className="text-sm text-white/50">Failed</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === "syncing" && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Loader2 className="w-5 h-5 animate-spin text-[rgb(142,132,247)]" />
              Bi-Directional Sync in Progress...
            </CardTitle>
            <CardDescription className="text-white/60">
              {syncStage === "pull" ? "Pulling updates from Folk CRM" : "Pushing updates to Folk CRM"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Progress</span>
                <span className="font-medium text-white">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="flex items-center justify-center gap-4 flex-wrap">
              <div className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                syncStage === "pull" ? "bg-[rgb(142,132,247)]/20" : "bg-white/5"
              )}>
                <ArrowRight className={cn(
                  "w-5 h-5",
                  syncStage === "pull" ? "text-[rgb(142,132,247)] animate-pulse" : "text-white/40"
                )} />
                <span className="text-sm font-medium text-white">Pull from Folk</span>
              </div>
              <div className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                syncStage === "push" ? "bg-[rgb(196,227,230)]/20" : "bg-white/5"
              )}>
                <ArrowRight className={cn(
                  "w-5 h-5 rotate-180",
                  syncStage === "push" ? "text-[rgb(196,227,230)] animate-pulse" : "text-white/40"
                )} />
                <span className="text-sm font-medium text-white">Push to Folk</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "complete" && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <CheckCircle className="w-5 h-5 text-[rgb(196,227,230)]" />
              {syncResults ? "Sync Complete" : "Import Complete"}
            </CardTitle>
            <CardDescription className="text-white/60">
              {syncResults ? "Successfully synchronized with Folk CRM" : "Successfully imported data from Folk CRM"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {syncResults ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-white/10 rounded-lg p-4 bg-white/5">
                  <h4 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 text-[rgb(142,132,247)]" />
                    From Folk CRM
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Created:</span>
                      <span className="font-semibold text-[rgb(196,227,230)]">{syncResults.fromFolk.created}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Updated:</span>
                      <span className="font-semibold text-[rgb(142,132,247)]">{syncResults.fromFolk.updated}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Skipped:</span>
                      <span className="font-semibold text-white/50">{syncResults.fromFolk.skipped}</span>
                    </div>
                  </div>
                </div>

                <div className="border border-white/10 rounded-lg p-4 bg-white/5">
                  <h4 className="text-sm font-semibold text-white/80 mb-3 flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 text-[rgb(196,227,230)] rotate-180" />
                    To Folk CRM
                  </h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Created:</span>
                      <span className="font-semibold text-[rgb(196,227,230)]">{syncResults.toFolk.created}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Updated:</span>
                      <span className="font-semibold text-[rgb(142,132,247)]">{syncResults.toFolk.updated}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">Skipped:</span>
                      <span className="font-semibold text-white/50">{syncResults.toFolk.skipped}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-8 py-4 flex-wrap">
                <div className="text-center">
                  <div className="flex items-center justify-center w-12 h-12 bg-[rgb(142,132,247)]/20 rounded-full mx-auto mb-2">
                    <Building2 className="w-6 h-6 text-[rgb(142,132,247)]" />
                  </div>
                  <p className="text-2xl font-bold text-[rgb(142,132,247)]">{results.firms}</p>
                  <p className="text-sm text-white/50">Firms Imported</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center w-12 h-12 bg-[rgb(196,227,230)]/20 rounded-full mx-auto mb-2">
                    <Users className="w-6 h-6 text-[rgb(196,227,230)]" />
                  </div>
                  <p className="text-2xl font-bold text-[rgb(196,227,230)]">{results.contacts}</p>
                  <p className="text-sm text-white/50">Contacts Imported</p>
                </div>
                {results.failed > 0 && (
                  <div className="text-center">
                    <div className="flex items-center justify-center w-12 h-12 bg-[rgb(251,194,213)]/20 rounded-full mx-auto mb-2">
                      <AlertCircle className="w-6 h-6 text-[rgb(251,194,213)]" />
                    </div>
                    <p className="text-2xl font-bold text-[rgb(251,194,213)]">{results.failed}</p>
                    <p className="text-sm text-white/50">Failed</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-center">
              <Button
                onClick={() => {
                  setStep("idle");
                  setSyncResults(null);
                  setResults({ firms: 0, contacts: 0, failed: 0 });
                }}
                variant="outline"
                className="border-white/20 text-white"
                data-testid="button-import-more"
              >
                Import More Data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
