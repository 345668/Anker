import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Upload, RefreshCw, CheckCircle, AlertCircle, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "./AdminLayout";

export default function DataImport() {
  const { toast } = useToast();
  const [folkStatus, setFolkStatus] = useState<{ success: boolean; message: string } | null>(null);

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

  const importFromFolk = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/admin/folk/import", { method: "POST" });
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "Import completed", 
        description: `Created: ${data.recordsCreated}, Updated: ${data.recordsUpdated}, Failed: ${data.recordsFailed}` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/investors"] });
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const { data: syncLogs } = useQuery<any[]>({
    queryKey: ["/api/admin/sync-logs"],
  });

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Data Import</h1>
          <p className="text-white/60">Import investors from CSV files or Folk CRM integration</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                  <Database className="w-5 h-5 text-[rgb(142,132,247)]" />
                </div>
                <div>
                  <CardTitle className="text-white">Folk CRM</CardTitle>
                  <CardDescription className="text-white/50">Sync contacts from Folk CRM</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {folkStatus && (
                <div className={`
                  p-3 rounded-lg flex items-center gap-2
                  ${folkStatus.success ? 'bg-[rgb(196,227,230)]/10 text-[rgb(196,227,230)]' : 'bg-[rgb(251,194,213)]/10 text-[rgb(251,194,213)]'}
                `}>
                  {folkStatus.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span className="text-sm">{folkStatus.message}</span>
                </div>
              )}
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-white/20 text-white"
                  onClick={() => testFolkConnection.mutate()}
                  disabled={testFolkConnection.isPending}
                  data-testid="button-test-folk"
                >
                  {testFolkConnection.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                  Test Connection
                </Button>
                <Button
                  className="flex-1 bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80 text-white"
                  onClick={() => importFromFolk.mutate()}
                  disabled={importFromFolk.isPending}
                  data-testid="button-import-folk"
                >
                  {importFromFolk.isPending && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                  Import Data
                </Button>
              </div>
            </CardContent>
          </Card>

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
              <div className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center">
                <Upload className="w-8 h-8 text-white/40 mx-auto mb-3" />
                <p className="text-white/60 text-sm mb-2">Drag and drop CSV files here</p>
                <p className="text-white/40 text-xs">or click to browse</p>
              </div>
              <p className="text-white/40 text-xs mt-3 text-center">Coming soon</p>
            </CardContent>
          </Card>
        </div>

        {syncLogs && syncLogs.length > 0 && (
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Import History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {syncLogs.map((log: any) => (
                  <div 
                    key={log.id}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`
                        w-2 h-2 rounded-full
                        ${log.status === 'completed' ? 'bg-[rgb(196,227,230)]' : ''}
                        ${log.status === 'in_progress' ? 'bg-[rgb(254,212,92)]' : ''}
                        ${log.status === 'failed' ? 'bg-[rgb(251,194,213)]' : ''}
                      `} />
                      <div>
                        <div className="text-white capitalize">{log.source} - {log.syncType}</div>
                        <div className="text-white/40 text-sm">
                          {log.recordsCreated || 0} created, {log.recordsUpdated || 0} updated
                        </div>
                      </div>
                    </div>
                    <div className="text-white/40 text-sm">
                      {log.startedAt && new Date(log.startedAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
