import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Database, HardDrive, RefreshCw, Download, Trash2, 
  Calendar, Clock, Check, X, AlertCircle, Plus, Loader2,
  Server, Table, FileJson
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "./AdminLayout";

interface DatabaseBackup {
  id: string;
  name: string;
  description: string | null;
  environment: string;
  status: string;
  backupType: string;
  tables: string[] | null;
  recordCounts: Record<string, number> | null;
  fileSize: number | null;
  checksum: string | null;
  startedAt: string | null;
  completedAt: string | null;
  restoredAt: string | null;
  createdBy: string | null;
  errorMessage: string | null;
  createdAt: string | null;
}

interface DatabaseStats {
  tables: Array<{ name: string; count: number }>;
  totalRecords: number;
  lastBackup: DatabaseBackup | null;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString();
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge className="bg-green-500/20 text-green-400"><Check className="w-3 h-3 mr-1" />Completed</Badge>;
    case "in_progress":
      return <Badge className="bg-blue-500/20 text-blue-400"><Loader2 className="w-3 h-3 mr-1 animate-spin" />In Progress</Badge>;
    case "failed":
      return <Badge className="bg-red-500/20 text-red-400"><X className="w-3 h-3 mr-1" />Failed</Badge>;
    case "restored":
      return <Badge className="bg-purple-500/20 text-purple-400"><RefreshCw className="w-3 h-3 mr-1" />Restored</Badge>;
    default:
      return <Badge className="bg-gray-500/20 text-gray-400">{status}</Badge>;
  }
}

export default function DatabaseBackups() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [backupName, setBackupName] = useState("");
  const [backupDescription, setBackupDescription] = useState("");

  const { data: stats, isLoading: statsLoading } = useQuery<DatabaseStats>({
    queryKey: ["/api/admin/backups/stats"],
  });

  const { data: backups = [], isLoading: backupsLoading } = useQuery<DatabaseBackup[]>({
    queryKey: ["/api/admin/backups"],
  });

  const createBackupMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description: string }) => {
      const res = await apiRequest("POST", "/api/admin/backups", { name, description, backupType: "manual" });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backups/stats"] });
      setCreateDialogOpen(false);
      setBackupName("");
      setBackupDescription("");
      toast({ 
        title: result.success ? "Backup created" : "Backup failed",
        description: result.message,
        variant: result.success ? "default" : "destructive"
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteBackupMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/backups/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backups/stats"] });
      toast({ title: "Backup deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateBackup = () => {
    if (!backupName.trim()) {
      toast({ title: "Error", description: "Please enter a backup name", variant: "destructive" });
      return;
    }
    createBackupMutation.mutate({ name: backupName.trim(), description: backupDescription.trim() });
  };

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-light text-white flex items-center gap-2" data-testid="text-page-title">
              <Database className="w-6 h-6 text-[rgb(142,132,247)]" />
              Database Backups
            </h1>
            <p className="text-white/60 mt-1">
              Create and manage database snapshots for backup and recovery
            </p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/90"
                data-testid="button-create-backup"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Backup
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[rgb(30,30,35)] border-white/10 text-white">
              <DialogHeader>
                <DialogTitle>Create Database Backup</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm text-white/70">Backup Name</label>
                  <Input
                    value={backupName}
                    onChange={(e) => setBackupName(e.target.value)}
                    placeholder="e.g., Pre-migration backup"
                    className="bg-white/5 border-white/10 text-white"
                    data-testid="input-backup-name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-white/70">Description (optional)</label>
                  <Textarea
                    value={backupDescription}
                    onChange={(e) => setBackupDescription(e.target.value)}
                    placeholder="Describe the purpose of this backup..."
                    className="bg-white/5 border-white/10 text-white resize-none"
                    rows={3}
                    data-testid="input-backup-description"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateBackup}
                  disabled={createBackupMutation.isPending}
                  className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/90"
                  data-testid="button-confirm-backup"
                >
                  {createBackupMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <HardDrive className="w-4 h-4 mr-2" />
                  )}
                  Create Backup
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-[rgb(142,132,247)]/20">
                  <Server className="w-5 h-5 text-[rgb(142,132,247)]" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Total Records</p>
                  <p className="text-2xl font-light text-white" data-testid="text-total-records">
                    {statsLoading ? "..." : stats?.totalRecords.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-green-500/20">
                  <Table className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Tables Tracked</p>
                  <p className="text-2xl font-light text-white" data-testid="text-tables-tracked">
                    {statsLoading ? "..." : stats?.tables.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-blue-500/20">
                  <Calendar className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Last Backup</p>
                  <p className="text-sm text-white" data-testid="text-last-backup">
                    {statsLoading ? "..." : stats?.lastBackup 
                      ? formatDate(stats.lastBackup.completedAt)
                      : "No backups yet"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {stats && stats.tables.length > 0 && (
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <FileJson className="w-5 h-5 text-[rgb(142,132,247)]" />
                Current Database State
              </CardTitle>
              <CardDescription className="text-white/60">
                Record counts for each tracked table
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {stats.tables.map((table) => (
                  <div 
                    key={table.name}
                    className="p-3 rounded-lg bg-white/5 border border-white/10"
                  >
                    <p className="text-xs text-white/50 truncate">{table.name}</p>
                    <p className="text-lg font-medium text-white">{table.count.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-[rgb(142,132,247)]" />
              Backup History
            </CardTitle>
            <CardDescription className="text-white/60">
              All database backups and their status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {backupsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-[rgb(142,132,247)] animate-spin" />
              </div>
            ) : backups.length === 0 ? (
              <div className="text-center py-12 text-white/40">
                <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No backups created yet</p>
                <p className="text-sm mt-1">Create your first backup to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {backups.map((backup) => (
                  <div
                    key={backup.id}
                    className="p-4 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 transition-colors"
                    data-testid={`backup-item-${backup.id}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-medium text-white truncate">{backup.name}</h3>
                          {getStatusBadge(backup.status)}
                          <Badge variant="outline" className="text-white/60 border-white/20">
                            {backup.backupType}
                          </Badge>
                        </div>
                        {backup.description && (
                          <p className="text-sm text-white/50 mb-2">{backup.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-4 text-xs text-white/40">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(backup.createdAt)}
                          </span>
                          {backup.fileSize && (
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3" />
                              {formatBytes(backup.fileSize)}
                            </span>
                          )}
                          {backup.recordCounts && (
                            <span className="flex items-center gap-1">
                              <Table className="w-3 h-3" />
                              {Object.values(backup.recordCounts).reduce((a, b) => a + b, 0).toLocaleString()} records
                            </span>
                          )}
                          {backup.tables && (
                            <span>{backup.tables.length} tables</span>
                          )}
                        </div>
                        {backup.errorMessage && (
                          <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                            <AlertCircle className="w-3 h-3 inline mr-1" />
                            {backup.errorMessage}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {backup.status === "completed" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              window.open(`/api/admin/backups/${backup.id}/download`, "_blank");
                            }}
                            className="text-white/40 hover:text-[rgb(142,132,247)]"
                            data-testid={`button-download-backup-${backup.id}`}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteBackupMutation.mutate(backup.id)}
                          disabled={deleteBackupMutation.isPending}
                          className="text-white/40 hover:text-red-400"
                          data-testid={`button-delete-backup-${backup.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-yellow-500/10 border-yellow-500/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
              <div>
                <h3 className="font-medium text-yellow-400">Production Database Note</h3>
                <p className="text-sm text-yellow-400/70 mt-1">
                  This backup system tracks development database snapshots. For production database backups and 
                  restoration, use the Replit Database panel or export data through the database management tools.
                  Production backups require direct database access and should be performed through your database provider's tools.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
