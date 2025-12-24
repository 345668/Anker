import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  Loader2,
  RefreshCw,
  Link,
  Unlink,
  Save,
  Database,
  Users,
  Building2,
  Info,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";

const FOLK_API_VERSION = "2025-05-26";

interface InspectionResults {
  companyFields: string[];
  peopleFields: string[];
  sampleCompanies?: any[];
  samplePeople?: any[];
}

interface SyncFields {
  contacts: Record<string, boolean>;
  firms: Record<string, boolean>;
}

const defaultSyncFields: SyncFields = {
  contacts: {
    full_name: true,
    first_name: true,
    last_name: true,
    title: true,
    work_email: true,
    personal_email: true,
    primary_phone: true,
    linkedin_url: true,
    twitter_url: true,
    bio: true,
    location: true,
  },
  firms: {
    company_name: true,
    website: true,
    linkedin_url: true,
    firm_type: true,
    firm_description: true,
    investment_focus: true,
    investment_stages: true,
    preferred_geography: true,
    check_size_min: true,
    check_size_max: true,
  },
};

export default function FolkSettingsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncFields, setSyncFields] = useState<SyncFields>(defaultSyncFields);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [syncInterval, setSyncInterval] = useState<string>("manual");
  const [hasChanges, setHasChanges] = useState(false);
  const [inspectionResults, setInspectionResults] = useState<InspectionResults | null>(null);

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

  useEffect(() => {
    const savedFields = localStorage.getItem("folkSyncFields");
    if (savedFields) {
      try {
        setSyncFields(JSON.parse(savedFields));
      } catch (e) {
        console.error("Failed to parse saved sync fields", e);
      }
    }
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      localStorage.setItem("folkSyncFields", JSON.stringify(syncFields));
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

  const inspectFieldsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroup) {
        throw new Error("Please select a group first");
      }
      const res = await apiRequest("GET", `/api/admin/folk/inspect-fields?groupId=${selectedGroup}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.success) {
        setInspectionResults({
          companyFields: data.companyFields || [],
          peopleFields: data.peopleFields || [],
          sampleCompanies: data.sampleCompanies,
          samplePeople: data.samplePeople,
        });
        toast({
          title: "Fields loaded",
          description: `Found ${data.companyFields?.length || 0} company fields and ${data.peopleFields?.length || 0} people fields`,
        });
      } else {
        toast({
          title: "Inspection failed",
          description: data.message || "Could not inspect fields",
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Inspection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleSyncField = (entityType: "contacts" | "firms", field: string) => {
    setSyncFields((prev) => ({
      ...prev,
      [entityType]: {
        ...prev[entityType],
        [field]: !prev[entityType][field],
      },
    }));
    setHasChanges(true);
  };

  const isConnected = (connectionQuery.data as any)?.success;
  const selectedGroupName = groupsQuery.data?.find((g) => g.id === selectedGroup)?.name;

  return (
    <div className="space-y-6">
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-[rgb(142,132,247)]" />
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
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  isConnected
                    ? "bg-emerald-500"
                    : connectionQuery.isLoading
                    ? "bg-slate-400"
                    : "bg-red-500"
                }`}
              />
              <div>
                <p className="font-medium text-white">
                  {isConnected
                    ? "Connected"
                    : connectionQuery.isLoading
                    ? "Testing Connection..."
                    : "Connection Error"}
                </p>
                <p className="text-sm text-white/50">API Version: {FOLK_API_VERSION}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
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
                Test
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => inspectFieldsMutation.mutate()}
                disabled={inspectFieldsMutation.isPending || !selectedGroup}
                className="border-white/20 text-white"
                data-testid="button-inspect-fields"
              >
                {inspectFieldsMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Database className="w-4 h-4 mr-2" />
                )}
                Inspect Fields
              </Button>
            </div>
          </div>

          <Alert className="bg-white/5 border-white/10">
            <Info className="h-4 w-4 text-[rgb(142,132,247)]" />
            <AlertTitle className="text-white">Admin Access Only</AlertTitle>
            <AlertDescription className="text-white/60">
              This integration uses a workspace-level API key with admin access. All synced data
              will be available to users based on their permissions.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Sync Configuration</CardTitle>
          <CardDescription className="text-white/60">
            Configure which Folk group to sync and how often
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-white">Folk Group to Sync</Label>
            <Select
              value={selectedGroup}
              onValueChange={(v) => {
                setSelectedGroup(v);
                setHasChanges(true);
              }}
            >
              <SelectTrigger
                className="w-full border-white/20 text-white bg-white/5"
                data-testid="select-default-group"
              >
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent>
                {groupsQuery.data?.map((group: any) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-white/50">
              Only contacts and companies in this group will be synced
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-white">Sync Frequency</Label>
            <Select
              value={syncInterval}
              onValueChange={(v) => {
                setSyncInterval(v);
                setHasChanges(true);
              }}
            >
              <SelectTrigger
                className="w-full border-white/20 text-white bg-white/5"
                data-testid="select-sync-interval"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual Only</SelectItem>
                <SelectItem value="hourly">Every Hour</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-white/50">
              Automatic sync is currently not implemented - use manual sync
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">API Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-white/60">Base URL:</span>
            <span className="font-mono text-white">https://api.folk.app</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/60">API Version:</span>
            <span className="font-mono text-white">{FOLK_API_VERSION}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/60">Selected Group:</span>
            <Badge className="bg-white/10 text-white">{selectedGroupName || "None"}</Badge>
          </div>
        </CardContent>
      </Card>

      {inspectionResults && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Building2 className="w-5 h-5 text-[rgb(142,132,247)]" />
              Folk Group Fields
            </CardTitle>
            <CardDescription className="text-white/60">
              Columns available in "{selectedGroupName}" group
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-4 h-4 text-indigo-400" />
                <h3 className="font-semibold text-white">Company/Firm Fields</h3>
                <Badge className="bg-white/10 text-white">
                  {inspectionResults.companyFields.length} fields
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {inspectionResults.companyFields.map((field) => (
                  <Badge key={field} variant="outline" className="font-mono text-xs border-white/20 text-white/80">
                    {field}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-white">Contact/People Fields</h3>
                <Badge className="bg-white/10 text-white">
                  {inspectionResults.peopleFields.length} fields
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {inspectionResults.peopleFields.map((field) => (
                  <Badge key={field} variant="outline" className="font-mono text-xs border-white/20 text-white/80">
                    {field}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-white/10">
              <Button
                variant="outline"
                size="sm"
                className="border-white/20 text-white"
                onClick={() => {
                  console.log("Sample Companies:", inspectionResults.sampleCompanies);
                  console.log("Sample People:", inspectionResults.samplePeople);
                  toast({
                    title: "Sample data logged",
                    description: "Check browser console for sample data",
                  });
                }}
                data-testid="button-view-sample-data"
              >
                View Sample Data in Console
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Bidirectional Field Sync</CardTitle>
          <CardDescription className="text-white/60">
            Configure which fields sync between your app and Folk CRM
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="contacts">
            <TabsList className="grid w-full grid-cols-2 bg-white/5">
              <TabsTrigger
                value="contacts"
                className="data-[state=active]:bg-white/10 text-white/60 data-[state=active]:text-white"
              >
                <Users className="w-4 h-4 mr-2" />
                Contact Fields
              </TabsTrigger>
              <TabsTrigger
                value="firms"
                className="data-[state=active]:bg-white/10 text-white/60 data-[state=active]:text-white"
              >
                <Building2 className="w-4 h-4 mr-2" />
                Firm Fields
              </TabsTrigger>
            </TabsList>

            <TabsContent value="contacts" className="space-y-4 mt-4">
              <p className="text-sm text-white/60 mb-4">
                Select which contact fields should sync bidirectionally with Folk CRM
              </p>
              <div className="grid grid-cols-1 gap-3">
                {Object.entries(syncFields.contacts).map(([field, enabled]) => (
                  <div
                    key={field}
                    className="flex items-center gap-3 p-3 border border-white/10 rounded-lg"
                  >
                    <Checkbox
                      id={`contact-${field}`}
                      checked={enabled}
                      onCheckedChange={() => toggleSyncField("contacts", field)}
                      className="border-white/30"
                      data-testid={`checkbox-contact-${field}`}
                    />
                    <Label htmlFor={`contact-${field}`} className="text-white cursor-pointer">
                      {field.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                    </Label>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="firms" className="space-y-4 mt-4">
              <p className="text-sm text-white/60 mb-4">
                Select which firm fields should sync bidirectionally with Folk CRM
              </p>
              <div className="grid grid-cols-1 gap-3">
                {Object.entries(syncFields.firms).map(([field, enabled]) => (
                  <div
                    key={field}
                    className="flex items-center gap-3 p-3 border border-white/10 rounded-lg"
                  >
                    <Checkbox
                      id={`firm-${field}`}
                      checked={enabled}
                      onCheckedChange={() => toggleSyncField("firms", field)}
                      className="border-white/30"
                      data-testid={`checkbox-firm-${field}`}
                    />
                    <Label htmlFor={`firm-${field}`} className="text-white cursor-pointer">
                      {field.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                    </Label>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
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
