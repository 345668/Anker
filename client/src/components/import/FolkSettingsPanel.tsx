import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  Loader2,
  CheckCircle,
  RefreshCw,
  Link,
  Unlink,
  Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";

interface SyncField {
  key: string;
  label: string;
  enabled: boolean;
}

const defaultSyncFields: SyncField[] = [
  { key: "firstName", label: "First Name", enabled: true },
  { key: "lastName", label: "Last Name", enabled: true },
  { key: "email", label: "Email", enabled: true },
  { key: "phone", label: "Phone", enabled: true },
  { key: "title", label: "Job Title", enabled: true },
  { key: "linkedinUrl", label: "LinkedIn URL", enabled: true },
  { key: "investorType", label: "Investor Type", enabled: true },
  { key: "investorState", label: "Investor State", enabled: true },
  { key: "fundingStage", label: "Funding Stage", enabled: true },
  { key: "typicalInvestment", label: "Check Size", enabled: true },
  { key: "fundHQ", label: "Fund HQ", enabled: false },
  { key: "website", label: "Website", enabled: false },
];

export default function FolkSettingsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncFields, setSyncFields] = useState<SyncField[]>(defaultSyncFields);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [syncInterval, setSyncInterval] = useState<string>("manual");
  const [hasChanges, setHasChanges] = useState(false);

  const connectionQuery = useQuery({
    queryKey: ["/api/admin/folk/test"],
  });

  const groupsQuery = useQuery<any[]>({
    queryKey: ["/api/admin/folk/groups"],
    enabled: (connectionQuery.data as any)?.success,
  });

  const settingsQuery = useQuery({
    queryKey: ["/api/admin/folk/settings"],
  });

  useEffect(() => {
    if (settingsQuery.data) {
      const data = settingsQuery.data as any;
      if (data.syncFields) {
        setSyncFields(data.syncFields);
      }
      if (data.selectedGroup) {
        setSelectedGroup(data.selectedGroup);
      }
      if (data.syncInterval) {
        setSyncInterval(data.syncInterval);
      }
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/folk/settings", {
        syncFields,
        selectedGroup,
        syncInterval,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings saved",
        description: "Folk sync settings have been updated",
      });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/settings"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/admin/folk/test");
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({
          title: "Connection successful",
          description: `Connected to Folk workspace: ${data.workspaceName || "Unknown"}`,
        });
      } else {
        toast({
          title: "Connection failed",
          description: data.message || "Could not connect to Folk",
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk/test"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Connection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleField = (key: string) => {
    setSyncFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f))
    );
    setHasChanges(true);
  };

  const isConnected = (connectionQuery.data as any)?.success;

  return (
    <div className="space-y-6">
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-[rgb(142,132,247)]" />
              Folk CRM Connection
            </CardTitle>
            <CardDescription className="text-white/60">
              Manage your Folk CRM integration settings
            </CardDescription>
          </div>
          <Badge
            className={
              isConnected
                ? "bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)]"
                : "bg-[rgb(251,194,213)]/20 text-[rgb(251,194,213)]"
            }
          >
            {isConnected ? (
              <>
                <Link className="w-3 h-3 mr-1" /> Connected
              </>
            ) : (
              <>
                <Unlink className="w-3 h-3 mr-1" /> Disconnected
              </>
            )}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            onClick={() => testConnectionMutation.mutate()}
            disabled={testConnectionMutation.isPending}
            className="border-white/20 text-white"
            data-testid="button-test-connection"
          >
            {testConnectionMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Test Connection
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Default Import Group</CardTitle>
          <CardDescription className="text-white/60">
            Select the default Folk group for importing records
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedGroup}
            onValueChange={(v) => {
              setSelectedGroup(v);
              setHasChanges(true);
            }}
          >
            <SelectTrigger className="w-[300px] border-white/20 text-white bg-white/5" data-testid="select-default-group">
              <SelectValue placeholder="Select a default group" />
            </SelectTrigger>
            <SelectContent>
              {groupsQuery.data?.map((group: any) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Field Sync Settings</CardTitle>
          <CardDescription className="text-white/60">
            Choose which fields to sync from Folk CRM
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {syncFields.map((field) => (
              <div
                key={field.key}
                className="flex items-center justify-between p-3 border border-white/10 rounded-lg"
              >
                <Label className="text-white">{field.label}</Label>
                <Switch
                  checked={field.enabled}
                  onCheckedChange={() => toggleField(field.key)}
                  data-testid={`switch-${field.key}`}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Sync Schedule</CardTitle>
          <CardDescription className="text-white/60">
            Configure automatic sync interval
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={syncInterval}
            onValueChange={(v) => {
              setSyncInterval(v);
              setHasChanges(true);
            }}
          >
            <SelectTrigger className="w-[200px] border-white/20 text-white bg-white/5" data-testid="select-sync-interval">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual only</SelectItem>
              <SelectItem value="hourly">Every hour</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!hasChanges || saveMutation.isPending}
          className="bg-[rgb(142,132,247)]"
          data-testid="button-save-settings"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}
