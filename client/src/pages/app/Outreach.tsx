import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus,
  Loader2,
  Send,
  Search,
  Eye,
  MessageSquare,
  Calendar,
  Mail,
  MoreHorizontal,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  LiquidBackground, 
  GlassSurface, 
  UnderGlow, 
  Pill, 
  RainbowButton,
  SecondaryGlassButton,
  GlassMetric
} from "@/components/liquid-glass";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Outreach, InvestmentFirm, Investor, EmailTemplate } from "@shared/schema";

const stageFilters = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "pitch_sent", label: "Sent" },
  { value: "opened", label: "Opened" },
  { value: "replied", label: "Replied" },
  { value: "call_scheduled", label: "Calls" },
];

const stageColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  pitch_sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  opened: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  replied: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  call_scheduled: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  funded: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  passed: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

export default function OutreachPage() {
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [selectedFirmId, setSelectedFirmId] = useState<string>("");
  const [selectedInvestorId, setSelectedInvestorId] = useState<string>("");
  const [emailData, setEmailData] = useState({
    subject: "",
    body: "",
    templateId: "",
  });

  const { data: outreaches = [], isLoading: outreachesLoading } = useQuery<Outreach[]>({
    queryKey: ["/api/outreaches"],
  });

  const { data: firms = [], isLoading: firmsLoading } = useQuery<InvestmentFirm[]>({
    queryKey: ["/api/investment-firms"],
  });

  const { data: investors = [], isLoading: investorsLoading } = useQuery<Investor[]>({
    queryKey: ["/api/investors"],
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email-templates"],
  });

  const firmsMap = useMemo(
    () => firms.reduce((acc, f) => ({ ...acc, [f.id]: f }), {} as Record<string, InvestmentFirm>),
    [firms]
  );

  const investorsMap = useMemo(
    () => investors.reduce((acc, i) => ({ ...acc, [i.id]: i }), {} as Record<string, Investor>),
    [investors]
  );

  const createOutreachMutation = useMutation({
    mutationFn: async (data: Partial<Outreach>) => {
      const response = await apiRequest("POST", "/api/outreaches", {
        ...data,
        stage: "pitch_sent",
        sentAt: new Date().toISOString(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outreaches"] });
      setShowComposeDialog(false);
      resetEmailForm();
    },
  });

  const updateOutreachMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Outreach> }) => 
      apiRequest("PATCH", `/api/outreaches/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outreaches"] });
    },
  });

  const resetEmailForm = () => {
    setEmailData({ subject: "", body: "", templateId: "" });
    setSelectedFirmId("");
    setSelectedInvestorId("");
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    setEmailData({
      subject: template.subject || "",
      body: template.body || "",
      templateId,
    });
  };

  const handleSendEmail = () => {
    if (!selectedFirmId || !emailData.subject || !emailData.body) return;

    createOutreachMutation.mutate({
      firmId: selectedFirmId,
      investorId: selectedInvestorId || undefined,
      emailSubject: emailData.subject,
      emailBody: emailData.body,
      templateId: emailData.templateId || undefined,
    });
  };

  const handleStatusChange = (outreach: Outreach, newStatus: string) => {
    updateOutreachMutation.mutate({
      id: outreach.id,
      data: {
        stage: newStatus,
        ...(newStatus === "replied" && { repliedAt: new Date() }),
        ...(newStatus === "opened" && { openedAt: new Date() }),
        ...(newStatus === "call_scheduled" && {
          repliedAt: outreach.repliedAt || new Date(),
          scheduledCallAt: new Date(),
        }),
      },
    });
  };

  const getInvestorFullName = (investor: Investor | undefined) => {
    if (!investor) return "";
    return [investor.firstName, investor.lastName].filter(Boolean).join(" ");
  };

  const filteredOutreaches = useMemo(() => {
    return outreaches.filter((o) => {
      if (stageFilter !== "all" && o.stage !== stageFilter) return false;
      if (searchQuery) {
        const firm = firmsMap[o.firmId || ""];
        const investor = investorsMap[o.investorId || ""];
        const query = searchQuery.toLowerCase();
        const investorName = getInvestorFullName(investor);
        if (
          !firm?.name?.toLowerCase().includes(query) &&
          !investorName.toLowerCase().includes(query) &&
          !o.emailSubject?.toLowerCase().includes(query)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [outreaches, stageFilter, searchQuery, firmsMap, investorsMap]);

  const stats = useMemo(() => {
    return {
      sent: outreaches.filter((o) => o.stage !== "draft").length,
      opened: outreaches.filter((o) => o.openedAt).length,
      replied: outreaches.filter((o) => o.repliedAt).length,
      scheduled: outreaches.filter((o) => o.stage === "call_scheduled").length,
    };
  }, [outreaches]);

  const pageLoading = outreachesLoading || firmsLoading || investorsLoading || templatesLoading;

  if (pageLoading) {
    return (
      <div className="relative min-h-[55vh]">
        <LiquidBackground />
        <div className="flex h-[55vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading outreach...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <LiquidBackground />

      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Pill className="mb-3">Outreach</Pill>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">
              Investor{" "}
              <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                Communications
              </span>
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              Track performance and manage your investor outreach pipeline.
            </p>
          </div>

          <RainbowButton 
            onClick={() => setShowComposeDialog(true)}
            data-testid="button-new-outreach"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Outreach
          </RainbowButton>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <GlassMetric icon={Send} label="Sent" value={stats.sent} />
          <GlassMetric icon={Eye} label="Opened" value={stats.opened} />
          <GlassMetric icon={MessageSquare} label="Replied" value={stats.replied} />
          <GlassMetric icon={Calendar} label="Scheduled" value={stats.scheduled} />
        </div>

        <div className="relative">
          <UnderGlow className="opacity-20" />
          <GlassSurface className="p-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-4">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by firm, investor, or subject..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 rounded-xl"
                  data-testid="input-search-outreach"
                />
              </div>
              <Tabs value={stageFilter} onValueChange={setStageFilter}>
                <TabsList className="rounded-2xl bg-white/50 dark:bg-slate-800/50">
                  {stageFilters.map((filter) => (
                    <TabsTrigger
                      key={filter.value}
                      value={filter.value}
                      className="rounded-xl text-sm"
                      data-testid={`tab-filter-${filter.value}`}
                    >
                      {filter.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {filteredOutreaches.length === 0 ? (
              <div className="flex flex-col items-center py-12">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 mb-3">
                  <Mail className="h-6 w-6 text-slate-500 dark:text-slate-400" />
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
                  {stageFilter === "all" ? "No outreach yet" : `No ${stageFilter.replace("_", " ")} outreach`}
                </p>
                <SecondaryGlassButton onClick={() => setShowComposeDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Start Outreach
                </SecondaryGlassButton>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOutreaches.map((outreach) => {
                  const firm = firmsMap[outreach.firmId || ""];
                  const investor = investorsMap[outreach.investorId || ""];
                  
                  return (
                    <div
                      key={outreach.id}
                      className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-white/40 dark:border-white/10 bg-white/30 dark:bg-slate-800/30"
                      data-testid={`card-outreach-${outreach.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                            {firm?.name || "Unknown Firm"}
                          </span>
                          {investor && (
                            <span className="text-sm text-slate-500 dark:text-slate-400">
                              / {getInvestorFullName(investor)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
                          {outreach.emailSubject}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge className={`text-xs ${stageColors[outreach.stage || "draft"]}`}>
                            {outreach.stage?.replace("_", " ")}
                          </Badge>
                          {outreach.sentAt && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              Sent {new Date(outreach.sentAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="rounded-full">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl">
                          <DropdownMenuItem onClick={() => handleStatusChange(outreach, "opened")}>
                            <Eye className="w-4 h-4 mr-2" />
                            Mark as Opened
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleStatusChange(outreach, "replied")}>
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Mark as Replied
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleStatusChange(outreach, "call_scheduled")}>
                            <Calendar className="w-4 h-4 mr-2" />
                            Schedule Call
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassSurface>
        </div>
      </div>

      <Dialog open={showComposeDialog} onOpenChange={setShowComposeDialog}>
        <DialogContent className="max-w-2xl rounded-3xl border-2 border-white/60 dark:border-white/20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl text-slate-900 dark:text-slate-100">
              New Outreach
            </DialogTitle>
            <DialogDescription className="text-slate-600 dark:text-slate-400">
              Compose and send an email to an investor
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Investment Firm</Label>
                <Select value={selectedFirmId} onValueChange={setSelectedFirmId}>
                  <SelectTrigger className="rounded-xl" data-testid="select-outreach-firm">
                    <SelectValue placeholder="Select a firm" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl max-h-60">
                    {firms.slice(0, 50).map((firm) => (
                      <SelectItem key={firm.id} value={firm.id}>
                        {firm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-slate-300">Template (optional)</Label>
                <Select value={emailData.templateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger className="rounded-xl" data-testid="select-outreach-template">
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Subject</Label>
              <Input
                value={emailData.subject}
                onChange={(e) => setEmailData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Email subject..."
                className="rounded-xl"
                data-testid="input-outreach-subject"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-700 dark:text-slate-300">Email Body</Label>
              <Textarea
                value={emailData.body}
                onChange={(e) => setEmailData(prev => ({ ...prev, body: e.target.value }))}
                placeholder="Write your email..."
                className="min-h-[200px] rounded-xl"
                data-testid="input-outreach-body"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <SecondaryGlassButton
                onClick={() => { setShowComposeDialog(false); resetEmailForm(); }}
                data-testid="button-cancel-outreach"
              >
                Cancel
              </SecondaryGlassButton>
              <RainbowButton
                onClick={handleSendEmail}
                disabled={!selectedFirmId || !emailData.subject || !emailData.body || createOutreachMutation.isPending}
                data-testid="button-send-outreach"
              >
                {createOutreachMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Send Email
              </RainbowButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
