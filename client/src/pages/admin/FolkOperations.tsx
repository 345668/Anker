import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, Mail, RefreshCw, Download, Upload, Send, 
  CheckCircle, XCircle, AlertCircle, Loader2, Database,
  ChevronRight, Eye
} from "lucide-react";
import AdminLayout from "./AdminLayout";

interface FolkGroup {
  id: string;
  name: string;
}

interface PreviewPerson {
  folkId: string;
  name: string;
  email: string | null;
  title: string | null;
  linkedinUrl: string | null;
  company: string | null;
  hasEmail: boolean;
}

interface PreviewResult {
  success: boolean;
  total: number;
  selected: number;
  withEmail: number;
  withoutEmail: number;
  preview: PreviewPerson[];
}

export default function FolkOperations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [rangeType, setRangeType] = useState<"all" | "first" | "last" | "range">("all");
  const [rangeValue, setRangeValue] = useState<string>("500");
  const [rangeStart, setRangeStart] = useState<string>("1");
  const [rangeEnd, setRangeEnd] = useState<string>("500");
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  
  const [emailSubject, setEmailSubject] = useState("Introducing 1000VC - Premium Investor Network");
  const [emailContent, setEmailContent] = useState(`<p>Hi {{firstName}},</p>

<p>I hope this message finds you well. I wanted to personally reach out to introduce you to 1000VC, a premium platform connecting leading investors with high-potential startups.</p>

<p>As a recognized investor in the venture capital space, we believe you would be a valuable addition to our network.</p>

<p>Would you be open to a brief conversation to explore potential synergies?</p>

<p>Best regards,<br>The 1000VC Team</p>`);
  const [testMode, setTestMode] = useState(true);

  const { data: groups, isLoading: groupsLoading } = useQuery<FolkGroup[]>({
    queryKey: ["/api/admin/folk/groups"],
  });

  const { data: connectionTest } = useQuery<{ success: boolean; message: string }>({
    queryKey: ["/api/admin/folk/test"],
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const rangeParams: any = { groupId: selectedGroup };
      if (rangeType === "first") rangeParams.first = parseInt(rangeValue);
      if (rangeType === "last") rangeParams.last = parseInt(rangeValue);
      if (rangeType === "range") {
        rangeParams.start = parseInt(rangeStart);
        rangeParams.end = parseInt(rangeEnd);
      }
      const res = await apiRequest("POST", "/api/admin/folk/bulk/preview", rangeParams);
      return res.json() as Promise<PreviewResult>;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      toast({ title: "Preview loaded", description: `${data.selected} people selected from ${data.total} total` });
    },
    onError: (error: any) => {
      toast({ title: "Preview failed", description: error.message, variant: "destructive" });
    },
  });

  const enrichMutation = useMutation({
    mutationFn: async () => {
      const rangeParams: any = { groupId: selectedGroup };
      if (rangeType === "first") rangeParams.first = parseInt(rangeValue);
      if (rangeType === "last") rangeParams.last = parseInt(rangeValue);
      if (rangeType === "range") {
        rangeParams.start = parseInt(rangeStart);
        rangeParams.end = parseInt(rangeEnd);
      }
      const res = await apiRequest("POST", "/api/admin/folk/bulk/enrich", rangeParams);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "Enrichment complete", 
        description: `Enriched ${data.enriched} investors, ${data.failed} failed` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/folk"] });
    },
    onError: (error: any) => {
      toast({ title: "Enrichment failed", description: error.message, variant: "destructive" });
    },
  });

  const emailMutation = useMutation({
    mutationFn: async () => {
      const rangeParams: any = { 
        groupId: selectedGroup,
        subject: emailSubject,
        htmlContent: emailContent,
        testMode,
      };
      if (rangeType === "first") rangeParams.first = parseInt(rangeValue);
      if (rangeType === "last") rangeParams.last = parseInt(rangeValue);
      if (rangeType === "range") {
        rangeParams.start = parseInt(rangeStart);
        rangeParams.end = parseInt(rangeEnd);
      }
      const res = await apiRequest("POST", "/api/admin/folk/bulk/email", rangeParams);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ 
        title: testMode ? "Test emails sent" : "Email campaign complete", 
        description: `Sent ${data.sent} emails, ${data.failed} failed, ${data.skipped} skipped` 
      });
    },
    onError: (error: any) => {
      toast({ title: "Email campaign failed", description: error.message, variant: "destructive" });
    },
  });

  const syncToFolkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/folk/bulk/sync-to-folk", { 
        groupId: selectedGroup,
        fields: ['email', 'phone', 'title', 'linkedinUrl', 'investorType', 'status']
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "Sync to Folk complete", 
        description: `Synced ${data.synced} investors, ${data.failed} failed` 
      });
    },
    onError: (error: any) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const triggerEnrichmentMutation = useMutation({
    mutationFn: async () => {
      const rangeParams: any = { groupId: selectedGroup };
      if (rangeType === "first") rangeParams.first = parseInt(rangeValue);
      if (rangeType === "last") rangeParams.last = parseInt(rangeValue);
      if (rangeType === "range") {
        rangeParams.start = parseInt(rangeStart);
        rangeParams.end = parseInt(rangeEnd);
      }
      const res = await apiRequest("POST", "/api/admin/folk/bulk/trigger-enrichment", rangeParams);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ 
        title: "Folk Enrichment Triggered", 
        description: data.message || `Triggered enrichment for ${data.triggered} contacts`
      });
    },
    onError: (error: any) => {
      toast({ title: "Trigger enrichment failed", description: error.message, variant: "destructive" });
    },
  });

  const getRangeDescription = () => {
    if (rangeType === "all") return "All people in group";
    if (rangeType === "first") return `First ${rangeValue} people`;
    if (rangeType === "last") return `Last ${rangeValue} people`;
    if (rangeType === "range") return `People ${rangeStart} to ${rangeEnd}`;
    return "";
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Folk CRM Operations</h1>
            <p className="text-white/60">Bulk operations for investor data from Folk CRM</p>
          </div>
          <div className="flex items-center gap-2">
            {connectionTest?.success ? (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                <CheckCircle className="w-3 h-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                <XCircle className="w-3 h-3 mr-1" />
                Not Connected
              </Badge>
            )}
          </div>
        </div>

        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-[rgb(142,132,247)]" />
              Select Group & Range
            </CardTitle>
            <CardDescription className="text-white/60">
              Choose a Folk group and specify which investors to operate on
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white/80">Folk Group</Label>
                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                  <SelectTrigger className="bg-white/5 border-white/20 text-white" data-testid="select-folk-group">
                    <SelectValue placeholder={groupsLoading ? "Loading groups..." : "Select a group"} />
                  </SelectTrigger>
                  <SelectContent>
                    {groups?.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-white/80">Range Type</Label>
                <Select value={rangeType} onValueChange={(v: any) => setRangeType(v)}>
                  <SelectTrigger className="bg-white/5 border-white/20 text-white" data-testid="select-range-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All People</SelectItem>
                    <SelectItem value="first">First N People</SelectItem>
                    <SelectItem value="last">Last N People</SelectItem>
                    <SelectItem value="range">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(rangeType === "first" || rangeType === "last") && (
              <div className="space-y-2">
                <Label className="text-white/80">Number of People</Label>
                <Input
                  type="number"
                  value={rangeValue}
                  onChange={(e) => setRangeValue(e.target.value)}
                  className="bg-white/5 border-white/20 text-white max-w-xs"
                  placeholder="500"
                  data-testid="input-range-value"
                />
              </div>
            )}

            {rangeType === "range" && (
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div className="space-y-2">
                  <Label className="text-white/80">Start</Label>
                  <Input
                    type="number"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="bg-white/5 border-white/20 text-white"
                    placeholder="1"
                    data-testid="input-range-start"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/80">End</Label>
                  <Input
                    type="number"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="bg-white/5 border-white/20 text-white"
                    placeholder="500"
                    data-testid="input-range-end"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 pt-4">
              <Button
                onClick={() => previewMutation.mutate()}
                disabled={!selectedGroup || previewMutation.isPending}
                className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
                data-testid="button-preview"
              >
                {previewMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4 mr-2" />
                )}
                Preview Selection
              </Button>
              <span className="text-white/60 text-sm">{getRangeDescription()}</span>
            </div>
          </CardContent>
        </Card>

        {previewData && (
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Preview Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white/5 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-white">{previewData.total}</div>
                  <div className="text-white/60 text-sm">Total in Group</div>
                </div>
                <div className="bg-white/5 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-[rgb(142,132,247)]">{previewData.selected}</div>
                  <div className="text-white/60 text-sm">Selected</div>
                </div>
                <div className="bg-green-500/10 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-400">{previewData.withEmail}</div>
                  <div className="text-white/60 text-sm">With Email</div>
                </div>
                <div className="bg-yellow-500/10 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-400">{previewData.withoutEmail}</div>
                  <div className="text-white/60 text-sm">No Email</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-2 text-white/60">Name</th>
                      <th className="text-left py-2 text-white/60">Email</th>
                      <th className="text-left py-2 text-white/60">Title</th>
                      <th className="text-left py-2 text-white/60">Company</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.preview.slice(0, 10).map((person) => (
                      <tr key={person.folkId} className="border-b border-white/5">
                        <td className="py-2 text-white">{person.name}</td>
                        <td className="py-2">
                          {person.email ? (
                            <span className="text-green-400">{person.email}</span>
                          ) : (
                            <span className="text-white/40">No email</span>
                          )}
                        </td>
                        <td className="py-2 text-white/60">{person.title || "-"}</td>
                        <td className="py-2 text-white/60">{person.company || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewData.preview.length > 10 && (
                  <p className="text-white/40 text-sm mt-2">
                    Showing first 10 of {previewData.preview.length} people...
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="folk-enrich" className="space-y-4">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="folk-enrich" className="data-[state=active]:bg-[rgb(142,132,247)]">
              <RefreshCw className="w-4 h-4 mr-2" />
              Folk Enrichment
            </TabsTrigger>
            <TabsTrigger value="enrich" className="data-[state=active]:bg-[rgb(142,132,247)]">
              <Download className="w-4 h-4 mr-2" />
              Import to DB
            </TabsTrigger>
            <TabsTrigger value="email" className="data-[state=active]:bg-[rgb(142,132,247)]">
              <Mail className="w-4 h-4 mr-2" />
              Bulk Email
            </TabsTrigger>
            <TabsTrigger value="sync" className="data-[state=active]:bg-[rgb(142,132,247)]">
              <Upload className="w-4 h-4 mr-2" />
              Sync to Folk
            </TabsTrigger>
          </TabsList>

          <TabsContent value="folk-enrich">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-[rgb(142,132,247)]" />
                  Trigger Folk Native Enrichment
                </CardTitle>
                <CardDescription className="text-white/60">
                  Trigger Folk's built-in Dropcontact enrichment for selected contacts. 
                  This will enrich emails, phone numbers, LinkedIn profiles, and company data directly in Folk CRM.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <h4 className="text-blue-400 font-medium mb-2">How Folk Enrichment Works</h4>
                  <ul className="text-white/60 text-sm space-y-1">
                    <li>- Uses Dropcontact to find missing contact information</li>
                    <li>- Enriches emails, phone numbers, LinkedIn URLs, and job titles</li>
                    <li>- GDPR compliant (algorithm-based, no stored database)</li>
                    <li>- Uses your Folk enrichment credits (check your plan limits)</li>
                  </ul>
                </div>
                
                <Button
                  onClick={() => triggerEnrichmentMutation.mutate()}
                  disabled={!selectedGroup || triggerEnrichmentMutation.isPending}
                  className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black font-semibold"
                  data-testid="button-trigger-folk-enrichment"
                >
                  {triggerEnrichmentMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Trigger Enrichment for {previewData?.selected || "Selected"} Contacts
                </Button>
                
                {previewData && (
                  <p className="text-white/40 text-sm">
                    This will use approximately {previewData.selected} enrichment credits from your Folk plan.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="enrich">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Download className="w-5 h-5 text-[rgb(142,132,247)]" />
                  Import to Local Database
                </CardTitle>
                <CardDescription className="text-white/60">
                  Import selected investors from Folk to your local database for additional processing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => enrichMutation.mutate()}
                  disabled={!selectedGroup || enrichMutation.isPending}
                  className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black font-semibold"
                  data-testid="button-enrich"
                >
                  {enrichMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Database className="w-4 h-4 mr-2" />
                  )}
                  Import {previewData?.selected || "Selected"} Investors
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="email">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Mail className="w-5 h-5 text-[rgb(142,132,247)]" />
                  Bulk Email Campaign
                </CardTitle>
                <CardDescription className="text-white/60">
                  Send personalized emails to selected investors. Use {"{{firstName}}"}, {"{{name}}"}, {"{{company}}"} for personalization.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-white/80">Subject Line</Label>
                  <Input
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="bg-white/5 border-white/20 text-white"
                    placeholder="Email subject..."
                    data-testid="input-email-subject"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-white/80">Email Content (HTML)</Label>
                  <Textarea
                    value={emailContent}
                    onChange={(e) => setEmailContent(e.target.value)}
                    className="bg-white/5 border-white/20 text-white min-h-[200px] font-mono text-sm"
                    placeholder="<p>Hi {{firstName}},</p>..."
                    data-testid="input-email-content"
                  />
                </div>

                <div className="flex items-center gap-3 py-2">
                  <Switch
                    checked={testMode}
                    onCheckedChange={setTestMode}
                    data-testid="switch-test-mode"
                  />
                  <div>
                    <Label className="text-white/80">Test Mode</Label>
                    <p className="text-white/40 text-sm">Only send to first 3 recipients</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => emailMutation.mutate()}
                    disabled={!selectedGroup || !emailSubject || !emailContent || emailMutation.isPending}
                    className={testMode 
                      ? "bg-yellow-500 hover:bg-yellow-600 text-black" 
                      : "bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black font-semibold"
                    }
                    data-testid="button-send-emails"
                  >
                    {emailMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    {testMode 
                      ? "Send Test (3 emails)" 
                      : `Send to ${previewData?.withEmail || "All"} Recipients`
                    }
                  </Button>
                  {!testMode && previewData && previewData.withEmail > 50 && (
                    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Large campaign - consider testing first
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sync">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Upload className="w-5 h-5 text-[rgb(142,132,247)]" />
                  Sync Enriched Data to Folk
                </CardTitle>
                <CardDescription className="text-white/60">
                  Push enriched investor data back to Folk CRM
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-white/5 rounded-lg p-4">
                    <h4 className="text-white font-medium mb-2">Fields to sync:</h4>
                    <div className="flex flex-wrap gap-2">
                      {['Email', 'Phone', 'Title', 'LinkedIn', 'Investor Type', 'Status'].map((field) => (
                        <Badge key={field} variant="outline" className="border-white/20 text-white/60">
                          {field}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={() => syncToFolkMutation.mutate()}
                    disabled={!selectedGroup || syncToFolkMutation.isPending}
                    className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-black font-semibold"
                    data-testid="button-sync-to-folk"
                  >
                    {syncToFolkMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Sync to Folk CRM
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
