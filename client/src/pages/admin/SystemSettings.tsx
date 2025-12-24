import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Save, RefreshCw, CheckCircle, Database, Key } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "./AdminLayout";

export default function SystemSettings() {
  const { toast } = useToast();

  const { data: folkStatus } = useQuery({
    queryKey: ["/api/admin/folk/test"],
    refetchOnWindowFocus: false,
  });

  const { data: settings, isLoading } = useQuery<{ key: string; value: string; description?: string }[]>({
    queryKey: ["/api/admin/settings"],
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value, description }: { key: string; value: string; description?: string }) => {
      return apiRequest(`/api/admin/settings/${key}`, { 
        method: "PUT", 
        body: JSON.stringify({ value, description }) 
      });
    },
    onSuccess: () => {
      toast({ title: "Setting saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">System Settings</h1>
          <p className="text-white/60">Configure application settings and integrations</p>
        </div>

        <div className="space-y-6">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                  <Database className="w-5 h-5 text-[rgb(142,132,247)]" />
                </div>
                <div>
                  <CardTitle className="text-white">Folk CRM Integration</CardTitle>
                  <CardDescription className="text-white/50">Connection status and settings</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`
                    w-3 h-3 rounded-full
                    ${folkStatus?.success ? 'bg-[rgb(196,227,230)]' : 'bg-[rgb(251,194,213)]'}
                  `} />
                  <div>
                    <div className="text-white font-medium">Connection Status</div>
                    <div className="text-white/50 text-sm">
                      {folkStatus?.success ? 'Connected to Folk CRM' : folkStatus?.message || 'Not connected'}
                    </div>
                  </div>
                </div>
                {folkStatus?.success && (
                  <CheckCircle className="w-5 h-5 text-[rgb(196,227,230)]" />
                )}
              </div>

              <div className="p-4 bg-white/5 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Key className="w-4 h-4 text-white/40" />
                  <span className="text-white/60 text-sm">API Key</span>
                </div>
                <div className="text-white font-mono text-sm">
                  ****************************{process.env.FOLK_API_KEY?.slice(-8) || '(not set)'}
                </div>
                <p className="text-white/40 text-xs mt-2">
                  API key is securely stored in environment secrets
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Application Settings</CardTitle>
              <CardDescription className="text-white/50">General application configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-5 h-5 text-[rgb(142,132,247)] animate-spin" />
                </div>
              ) : settings && settings.length > 0 ? (
                settings.map((setting) => (
                  <SettingRow
                    key={setting.key}
                    settingKey={setting.key}
                    value={setting.value || ""}
                    description={setting.description}
                    onSave={(value) => updateSettingMutation.mutate({ 
                      key: setting.key, 
                      value, 
                      description: setting.description 
                    })}
                    isSaving={updateSettingMutation.isPending}
                  />
                ))
              ) : (
                <div className="text-center py-8 text-white/40">
                  <p>No settings configured yet</p>
                  <p className="text-sm mt-1">Settings will appear here as they are added</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}

function SettingRow({ 
  settingKey, 
  value, 
  description, 
  onSave, 
  isSaving 
}: { 
  settingKey: string; 
  value: string; 
  description?: string; 
  onSave: (value: string) => void;
  isSaving: boolean;
}) {
  const [localValue, setLocalValue] = useState(value);
  const hasChanged = localValue !== value;

  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <Label className="text-white mb-1 block">{settingKey}</Label>
        {description && <p className="text-white/40 text-xs mb-2">{description}</p>}
        <Input
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          className="bg-white/5 border-white/10 text-white"
        />
      </div>
      <Button
        onClick={() => onSave(localValue)}
        disabled={!hasChanged || isSaving}
        className="mt-6 bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80 text-white"
      >
        {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      </Button>
    </div>
  );
}
