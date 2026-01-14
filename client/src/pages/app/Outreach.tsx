import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
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
  Users,
  Target,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Outreach, InvestmentFirm, Investor, EmailTemplate, Contact, Match } from "@shared/schema";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";

type RecipientSource = "contacts" | "matches" | "firms";

const stageFilters = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "pitch_sent", label: "Sent" },
  { value: "opened", label: "Opened" },
  { value: "replied", label: "Replied" },
  { value: "call_scheduled", label: "Calls" },
];

const stageColors: Record<string, string> = {
  draft: "bg-white/10 text-white/60",
  pitch_sent: "bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)]",
  opened: "bg-[rgb(251,194,213)]/20 text-[rgb(251,194,213)]",
  replied: "bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)]",
  call_scheduled: "bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)]",
  funded: "bg-green-500/20 text-green-400",
  passed: "bg-red-500/20 text-red-400",
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

  const { data: firmsResponse, isLoading: firmsLoading } = useQuery<{ data: InvestmentFirm[], total: number }>({
    queryKey: ["/api/firms"],
  });
  const firms = firmsResponse?.data ?? [];

  const { data: investorsResponse, isLoading: investorsLoading } = useQuery<{ data: Investor[], total: number }>({
    queryKey: ["/api/investors"],
  });
  const investors = investorsResponse?.data ?? [];

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
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout
      title="Investor Outreach"
      subtitle="Track performance and manage your investor communications"
      heroHeight="40vh"
      videoUrl={videoBackgrounds.outreach}
    >
      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {[
              { icon: Send, label: "Sent", value: stats.sent, color: "rgb(142,132,247)" },
              { icon: Eye, label: "Opened", value: stats.opened, color: "rgb(251,194,213)" },
              { icon: MessageSquare, label: "Replied", value: stats.replied, color: "rgb(196,227,230)" },
              { icon: Calendar, label: "Scheduled", value: stats.scheduled, color: "rgb(254,212,92)" },
            ].map((stat, idx) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="p-6 rounded-2xl border border-white/10 bg-white/5"
              >
                <div className="flex items-center gap-4">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${stat.color}20` }}
                  >
                    <stat.icon className="w-6 h-6" style={{ color: stat.color }} />
                  </div>
                  <div>
                    <p className="text-2xl font-light text-white">{stat.value}</p>
                    <p className="text-sm text-white/50">{stat.label}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col md:flex-row gap-4 mb-8"
          >
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <Input
                placeholder="Search by firm, investor, or subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                data-testid="input-search-outreach"
              />
            </div>
            <Tabs value={stageFilter} onValueChange={setStageFilter} className="hidden md:block">
              <TabsList className="h-12 bg-white/5 border border-white/10 rounded-xl p-1">
                {stageFilters.map((filter) => (
                  <TabsTrigger
                    key={filter.value}
                    value={filter.value}
                    className="rounded-lg text-white/60 data-[state=active]:bg-white/10 data-[state=active]:text-white"
                    data-testid={`tab-filter-${filter.value}`}
                  >
                    {filter.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <button
              onClick={() => setShowComposeDialog(true)}
              className="h-12 px-6 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
              data-testid="button-new-outreach"
            >
              <Plus className="w-5 h-5" />
              New Outreach
            </button>
          </motion.div>

          {filteredOutreaches.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="text-center py-24 rounded-2xl border border-white/10 bg-white/5"
            >
              <div 
                className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-6"
                style={{ backgroundColor: 'rgba(142, 132, 247, 0.2)' }}
              >
                <Mail className="w-10 h-10 text-[rgb(142,132,247)]" />
              </div>
              <h3 className="text-2xl font-light text-white mb-2">
                No outreach yet
              </h3>
              <p className="text-white/50 font-light mb-8 max-w-md mx-auto">
                Start reaching out to investors to build relationships
              </p>
              <button
                onClick={() => setShowComposeDialog(true)}
                className="h-12 px-8 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
                data-testid="button-start-outreach"
              >
                <Plus className="w-5 h-5" />
                Start Outreach
              </button>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {filteredOutreaches.map((outreach, index) => {
                const firm = firmsMap[outreach.firmId || ""];
                const investor = investorsMap[outreach.investorId || ""];
                
                return (
                  <motion.div
                    key={outreach.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                    className="flex items-center justify-between gap-4 p-5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/[0.08] transition-colors"
                    data-testid={`card-outreach-${outreach.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white truncate">
                          {firm?.name || "Unknown Firm"}
                        </span>
                        {investor && (
                          <span className="text-sm text-white/40">
                            / {getInvestorFullName(investor)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-white/50 truncate">
                        {outreach.emailSubject}
                      </p>
                      <div className="flex items-center gap-3 mt-3">
                        <Badge className={`text-xs border-0 ${stageColors[outreach.stage || "draft"]}`}>
                          {outreach.stage?.replace("_", " ")}
                        </Badge>
                        {outreach.sentAt && (
                          <span className="text-xs text-white/40">
                            Sent {new Date(outreach.sentAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="rounded-full text-white/40 hover:text-white">
                          <MoreHorizontal className="w-5 h-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-[rgb(28,28,28)] border-white/10">
                        <DropdownMenuItem onClick={() => handleStatusChange(outreach, "opened")} className="text-white/70">
                          <Eye className="w-4 h-4 mr-2" />
                          Mark as Opened
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(outreach, "replied")} className="text-white/70">
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Mark as Replied
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(outreach, "call_scheduled")} className="text-white/70">
                          <Calendar className="w-4 h-4 mr-2" />
                          Schedule Call
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={showComposeDialog} onOpenChange={setShowComposeDialog}>
        <DialogContent className="max-w-2xl bg-[rgb(28,28,28)] border-white/10">
          <DialogHeader>
            <DialogTitle className="text-xl text-white">New Outreach</DialogTitle>
            <DialogDescription className="text-white/50">
              Compose and send an email to an investor
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white/70">Investment Firm</Label>
                <Select value={selectedFirmId} onValueChange={setSelectedFirmId}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-outreach-firm">
                    <SelectValue placeholder="Select a firm" />
                  </SelectTrigger>
                  <SelectContent className="bg-[rgb(28,28,28)] border-white/10 max-h-60">
                    {firms.slice(0, 50).map((firm) => (
                      <SelectItem key={firm.id} value={firm.id}>
                        {firm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Template (optional)</Label>
                <Select value={emailData.templateId} onValueChange={handleTemplateSelect}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-outreach-template">
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
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
              <Label className="text-white/70">Subject</Label>
              <Input
                value={emailData.subject}
                onChange={(e) => setEmailData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Email subject..."
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-outreach-subject"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/70">Email Body</Label>
              <Textarea
                value={emailData.body}
                onChange={(e) => setEmailData(prev => ({ ...prev, body: e.target.value }))}
                placeholder="Write your email..."
                className="min-h-[200px] bg-white/5 border-white/10 text-white"
                data-testid="input-outreach-body"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => { setShowComposeDialog(false); resetEmailForm(); }}
                className="border-white/20 text-white hover:bg-white/5"
                data-testid="button-cancel-outreach"
              >
                Cancel
              </Button>
              <button
                onClick={handleSendEmail}
                disabled={!selectedFirmId || !emailData.subject || !emailData.body || createOutreachMutation.isPending}
                className="h-10 px-6 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                data-testid="button-send-outreach"
              >
                {createOutreachMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Send Email
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
