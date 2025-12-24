import React, { useMemo, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Loader2,
  Send,
  Search,
  Eye,
  MessageSquare,
  Calendar,
  Mail,
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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import OutreachTable from "@/components/outreach/OutreachTable";
import OutreachPrioritization from "@/components/crm/OutreachPrioritization";
import { cn } from "@/lib/utils";

const stageFilters = [
  { value: "all", label: "All" },
  { value: "pitch_sent", label: "Sent" },
  { value: "opened", label: "Opened" },
  { value: "replied", label: "Replied" },
  { value: "call_scheduled", label: "Calls" },
];

/* -------------------------------------------
   SynergyAI: Light "Liquid Glass" primitives
-------------------------------------------- */

function LiquidBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />

      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,rgba(15,23,42,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.35)_1px,transparent_1px)] [background-size:64px_64px]" />

      {/* Gradient blobs (alive, not loud) */}
      <div className="absolute -top-28 left-1/4 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-purple-400/30 to-pink-400/25 blur-3xl" />
      <div className="absolute top-1/4 right-1/4 h-[480px] w-[480px] rounded-full bg-gradient-to-br from-orange-400/20 to-yellow-400/18 blur-3xl" />
      <div className="absolute -bottom-28 left-1/3 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-green-400/18 to-blue-400/18 blur-3xl" />
    </div>
  );
}

function GlassSurface({ className, children }) {
  return (
    <div
      className={cn(
        "relative rounded-3xl border-2 border-white/60",
        "bg-gradient-to-br from-white/55 to-white/30",
        "backdrop-blur-2xl shadow-lg hover:shadow-xl transition-shadow",
        className
      )}
    >
      {children}
    </div>
  );
}

function UnderGlow({ className }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 rounded-[28px]",
        "bg-gradient-to-br from-purple-400/30 via-pink-400/20 to-blue-400/25",
        "blur-3xl opacity-40",
        className
      )}
    />
  );
}

function PrimaryRainbowButton({ className, children, ...props }) {
  // One primary CTA per cluster: use for "New Outreach" and "Send Email"
  return (
    <Button
      className={cn(
        "relative overflow-hidden rounded-full px-5 h-11 text-white shadow-lg",
        "bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)]",
        "bg-[length:220%_220%] animate-[synergyGradient_10s_ease_infinite]",
        "hover:shadow-xl",
        className
      )}
      {...props}
    >
      {/* light sweep */}
      <span className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-100 transition-opacity">
        <span className="absolute -left-1/3 top-0 h-full w-1/2 rotate-12 bg-white/25 blur-xl animate-[synergySweep_1.2s_ease_forwards]" />
      </span>
      <span className="relative z-10 inline-flex items-center">{children}</span>
    </Button>
  );
}

function SecondaryGlassButton({ className, ...props }) {
  return (
    <Button
      variant="outline"
      className={cn(
        "h-11 rounded-full border-2 border-white/60 bg-white/55 text-slate-800",
        "hover:bg-white/70 backdrop-blur-2xl",
        className
      )}
      {...props}
    />
  );
}

function MetricTile({ icon: Icon, label, value }) {
  return (
    <div className="relative">
      <UnderGlow className="opacity-30 blur-2xl" />
      <GlassSurface className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-white/60 border-2 border-white/60 backdrop-blur-2xl flex items-center justify-center">
            <Icon className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-sm text-slate-500">{label}</p>
          </div>
        </div>
      </GlassSurface>
    </div>
  );
}

function GlassTabsList({ className, ...props }) {
  return (
    <TabsList
      className={cn(
        "rounded-3xl border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30",
        "backdrop-blur-2xl shadow-lg p-2",
        className
      )}
      {...props}
    />
  );
}

function GlassTabsTrigger({ className, ...props }) {
  return (
    <TabsTrigger
      className={cn(
        "h-10 rounded-2xl px-4 transition",
        "text-slate-600 data-[state=active]:bg-white/70 data-[state=active]:shadow-sm data-[state=active]:text-slate-900",
        "hover:bg-white/55 hover:text-slate-900",
        className
      )}
      {...props}
    />
  );
}

/* -----------------------------
   Keyframes (scoped + safe)
------------------------------ */
const GlobalStyles = () => (
  <style>{`
    @keyframes synergyGradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes synergySweep {
      0% { transform: translateX(0) rotate(12deg); opacity: 0; }
      20% { opacity: 1; }
      100% { transform: translateX(220%) rotate(12deg); opacity: 0; }
    }
  `}</style>
);

/* -----------------------------
   Page
------------------------------ */
export default function Outreach() {
  const [user, setUser] = useState(null);
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [selectedContact, setSelectedContact] = useState(null);
  const [emailData, setEmailData] = useState({
    subject: "",
    body: "",
    template_id: "",
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
    };
    loadUser();
  }, []);

  const { data: outreaches = [], isLoading: outreachesLoading } = useQuery({
    queryKey: ["outreaches"],
    queryFn: () => base44.entities.Outreach.list("-created_date", 200),
    enabled: !!user,
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => base44.entities.Contact.list("-created_date", 500),
    enabled: !!user,
  });

  const { data: firms = [], isLoading: firmsLoading } = useQuery({
    queryKey: ["firms"],
    queryFn: () => base44.entities.InvestorFirm.list("-created_date", 500),
    enabled: !!user,
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => base44.entities.EmailTemplate.list("-created_date", 50),
    enabled: !!user,
  });

  const { data: startups = [], isLoading: startupsLoading } = useQuery({
    queryKey: ["myStartups", user?.id],
    queryFn: () => base44.entities.Startup.filter({ founder_id: user?.id }),
    enabled: !!user,
  });

  const { data: matches = [], isLoading: matchesLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: () => base44.entities.Match.list("-match_score", 100),
    enabled: !!user,
  });

  const contactsMap = useMemo(
    () => contacts.reduce((acc, c) => ({ ...acc, [c.id]: c }), {}),
    [contacts]
  );
  const firmsMap = useMemo(
    () => firms.reduce((acc, f) => ({ ...acc, [f.id]: f }), {}),
    [firms]
  );

  const createOutreachMutation = useMutation({
    mutationFn: async (data) => {
      const outreach = await base44.entities.Outreach.create({
        ...data,
        stage: "pitch_sent",
        sent_at: new Date().toISOString(),
      });

      await base44.entities.InteractionLog.create({
        outreach_id: outreach.id,
        startup_id: data.startup_id,
        contact_id: data.contact_id,
        firm_id: data.firm_id,
        type: "email_sent",
        subject: data.email_subject,
        content: data.email_body,
        performed_by: user.email,
      });

      return outreach;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["outreaches"]);
      setShowComposeDialog(false);
      resetEmailForm();
    },
  });

  const updateOutreachMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Outreach.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(["outreaches"]),
  });

  const resetEmailForm = () => {
    setEmailData({ subject: "", body: "", template_id: "" });
    setSelectedContact(null);
  };

  const handleTemplateSelect = (templateId) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    let body = template.body;
    let subject = template.subject;

    if (startups.length > 0) {
      const startup = startups[0];
      body = body.replace(/\{\{startup_name\}\}/g, startup.company_name || "");
      subject = subject.replace(/\{\{startup_name\}\}/g, startup.company_name || "");
    }

    if (selectedContact) {
      const contact = contactsMap[selectedContact];
      const firm = firmsMap[contact?.firm_id];
      body = body.replace(/\{\{investor_name\}\}/g, contact?.full_name || "");
      body = body.replace(/\{\{firm_name\}\}/g, firm?.company_name || "");
      subject = subject.replace(/\{\{investor_name\}\}/g, contact?.full_name || "");
      subject = subject.replace(/\{\{firm_name\}\}/g, firm?.company_name || "");
    }

    setEmailData({ subject, body, template_id: templateId });
  };

  const handleSendEmail = () => {
    if (!selectedContact || !emailData.subject || !emailData.body) return;
    const contact = contactsMap[selectedContact];

    createOutreachMutation.mutate({
      startup_id: startups[0]?.id,
      contact_id: selectedContact,
      firm_id: contact?.firm_id,
      email_subject: emailData.subject,
      email_body: emailData.body,
    });
  };

  const handleStatusChange = (outreach, newStatus) => {
    updateOutreachMutation.mutate({
      id: outreach.id,
      data: {
        stage: newStatus,
        ...(newStatus === "replied" && { replied_at: new Date().toISOString() }),
        ...(newStatus === "call_scheduled" && {
          replied_at: outreach.replied_at || new Date().toISOString(),
        }),
      },
    });
  };

  const filteredOutreaches = useMemo(() => {
    return outreaches.filter((o) => {
      if (stageFilter !== "all" && o.stage !== stageFilter) return false;
      if (searchQuery) {
        const contact = contactsMap[o.contact_id];
        const firm = firmsMap[o.firm_id];
        const query = searchQuery.toLowerCase();
        if (
          !contact?.full_name?.toLowerCase().includes(query) &&
          !firm?.company_name?.toLowerCase().includes(query)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [outreaches, stageFilter, searchQuery, contactsMap, firmsMap]);

  const stats = useMemo(() => {
    return {
      sent: outreaches.filter((o) => o.stage !== "draft").length,
      opened: outreaches.filter((o) => o.opened_at).length,
      replied: outreaches.filter((o) => o.replied_at).length,
      scheduled: outreaches.filter((o) => o.stage === "call_scheduled").length,
    };
  }, [outreaches]);

  const pageLoading =
    !user ||
    outreachesLoading ||
    contactsLoading ||
    firmsLoading ||
    templatesLoading ||
    startupsLoading ||
    matchesLoading;

  if (pageLoading) {
    return (
      <div className="relative min-h-[55vh]">
        <GlobalStyles />
        <LiquidBackground />
        <div className="flex h-[55vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading outreach…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <GlobalStyles />
      <LiquidBackground />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30 px-3 py-1 backdrop-blur-2xl text-xs font-semibold text-slate-700 shadow-lg">
              <span className="h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-blue-500" />
              Outreach
            </div>

            <h1 className="mt-3 text-4xl font-bold text-slate-900">
              Investor{" "}
              <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                Communications
              </span>
            </h1>
            <p className="mt-1 text-slate-600">
              Track performance and manage your pipeline without friction.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <PrimaryRainbowButton onClick={() => setShowComposeDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Outreach
            </PrimaryRainbowButton>
          </div>
        </div>

        {/* AI Prioritization */}
        <div className="relative">
          <UnderGlow />
          <GlassSurface className="p-5 md:p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <Badge className="rounded-full border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30 text-slate-800 backdrop-blur-2xl">
                  AI
                </Badge>
                <p className="text-sm font-semibold text-slate-900">
                  Outreach Prioritization
                </p>
              </div>
              <p className="text-sm text-slate-500">
                Match score + interaction signals to suggest next actions.
              </p>
            </div>

            <div className="mt-4">
              <OutreachPrioritization
                matches={matches}
                outreaches={outreaches}
                firms={firmsMap}
                contacts={contactsMap}
                onSelectInvestor={(inv) => {
                  setSelectedContact(inv.match?.contact_id);
                  setShowComposeDialog(true);
                }}
              />
            </div>
          </GlassSurface>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricTile icon={Send} label="Sent" value={stats.sent} />
          <MetricTile icon={Eye} label="Opened" value={stats.opened} />
          <MetricTile icon={MessageSquare} label="Replied" value={stats.replied} />
          <MetricTile icon={Calendar} label="Calls Set" value={stats.scheduled} />
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <UnderGlow className="opacity-25 blur-2xl" />
            <GlassSurface className="p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search by contact or firm…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 pl-10 text-slate-800 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            </GlassSurface>
          </div>

          <Tabs value={stageFilter} onValueChange={setStageFilter} className="w-full md:w-auto">
            <GlassTabsList className="w-full md:w-auto">
              {stageFilters.map((filter) => (
                <GlassTabsTrigger key={filter.value} value={filter.value}>
                  {filter.label}
                </GlassTabsTrigger>
              ))}
            </GlassTabsList>
          </Tabs>
        </div>

        {/* Table */}
        <div className="relative overflow-hidden rounded-3xl">
          <UnderGlow className="opacity-25" />
          <GlassSurface className="p-0">
            <OutreachTable
              outreaches={filteredOutreaches}
              contacts={contactsMap}
              firms={firmsMap}
              onStatusChange={handleStatusChange}
              isLoading={false}
            />
          </GlassSurface>
        </div>

        {/* Compose dialog */}
        <Dialog open={showComposeDialog} onOpenChange={setShowComposeDialog}>
          <DialogContent className="max-w-2xl rounded-3xl border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30 backdrop-blur-2xl shadow-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)] text-white shadow-lg">
                  <Mail className="h-4 w-4" />
                </span>
                New Outreach
              </DialogTitle>
              <DialogDescription className="text-slate-600">
                Compose and send a personalized email. Templates support placeholders.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-slate-700">Select Contact</Label>
                  <Select value={selectedContact || ""} onValueChange={setSelectedContact}>
                    <SelectTrigger className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 text-slate-800 focus:ring-0">
                      <SelectValue placeholder="Choose a contact" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {contacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.full_name} — {firmsMap[contact.firm_id]?.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-700">Use Template</Label>
                  <Select value={emailData.template_id} onValueChange={handleTemplateSelect}>
                    <SelectTrigger className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 text-slate-800 focus:ring-0">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <GlassSurface className="p-4">
                <div className="space-y-2">
                  <Label className="text-slate-700">Subject</Label>
                  <Input
                    value={emailData.subject}
                    onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
                    placeholder="Email subject line"
                    className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 text-slate-800 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>

                <div className="mt-4 space-y-2">
                  <Label className="text-slate-700">Message</Label>
                  <Textarea
                    value={emailData.body}
                    onChange={(e) => setEmailData({ ...emailData, body: e.target.value })}
                    placeholder="Write your message…"
                    rows={10}
                    className="rounded-2xl border-2 border-white/60 bg-white/55 text-slate-800 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>

                <div className="mt-4 flex flex-col-reverse gap-3 border-t border-white/60 pt-4 sm:flex-row sm:justify-end">
                  <SecondaryGlassButton onClick={() => setShowComposeDialog(false)}>
                    Cancel
                  </SecondaryGlassButton>

                  <PrimaryRainbowButton
                    onClick={handleSendEmail}
                    disabled={
                      !selectedContact ||
                      !emailData.subject ||
                      !emailData.body ||
                      createOutreachMutation.isPending
                    }
                  >
                    {createOutreachMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send Email
                  </PrimaryRainbowButton>
                </div>
              </GlassSurface>

              <div className="rounded-3xl border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30 px-4 py-3 text-xs text-slate-500 backdrop-blur-2xl">
                Placeholders supported:{" "}
                <span className="font-semibold text-slate-700">
                  {"{{startup_name}}"} {"{{investor_name}}"} {"{{firm_name}}"}
                </span>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}