import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Rocket,
  Upload,
  Loader2,
  Globe,
  Linkedin,
  Users,
  DollarSign,
  Edit,
  Trash2,
  FileText,
  ArrowRight,
  Brain,
  BarChart3,
  Sparkles,
  Search,
  Filter,
  Wand2,
  ExternalLink,
} from "lucide-react";

import PitchDeckAnalysis from "@/components/pitch/PitchDeckAnalysis";
import SlideImprovementSuggestions from "@/components/pitch/SlideImprovementSuggestions";
import FinancialProjectionsAnalysis from "@/components/pitch/FinancialProjectionsAnalysis";
import CompetitiveDeckComparison from "@/components/pitch/CompetitiveDeckComparison";
import MissingSectionGenerator from "@/components/pitch/MissingSectionGenerator";
import SlideOrderOptimizer from "@/components/pitch/SlideOrderOptimizer";
import SlideDesignRecommendations from "@/components/pitch/SlideDesignRecommendations";
import AIInsightsPanel from "@/components/crm/AIInsightsPanel";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

const stages = ["Idea", "Pre-seed", "Seed", "Series A", "Series B", "Series C+", "Growth"];
const industries = [
  "AI/ML",
  "Fintech",
  "Healthcare",
  "SaaS",
  "E-commerce",
  "EdTech",
  "Climate",
  "Biotech",
  "Cybersecurity",
  "Consumer",
  "Enterprise",
  "Web3",
  "Other",
];

function formatMillionsUSD(value) {
  if (!value || Number.isNaN(value)) return "—";
  return `$${(value / 1_000_000).toFixed(1)}M`;
}

function initials(name) {
  const s = (name || "").trim();
  if (!s) return "S";
  return s[0].toUpperCase();
}

/**
 * Landing-inspired global keyframes (lightweight)
 */
const GLOBAL_STYLE_ID = "synergyai-global-keyframes-v1";
function ensureGlobalStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(GLOBAL_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = GLOBAL_STYLE_ID;
  style.setAttribute("data-owner", "SynergyAI");
  style.textContent = `
    @keyframes synergyai-gradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    .synergyai-animate-gradient { animation: synergyai-gradient 6s ease infinite; }
  `;
  document.head.appendChild(style);
}

function AnimatedGridPattern() {
  return (
    <div className="absolute inset-0 opacity-25 pointer-events-none">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to right, rgb(168 85 247 / 0.10) 1px, transparent 1px),
                           linear-gradient(to bottom, rgb(59 130 246 / 0.10) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />
    </div>
  );
}

/**
 * Landing-inspired "Liquid Glass" card wrapper
 * Use as container for sections, stats tiles, and empty states.
 */
function LiquidGlassCard({ children, className = "", gradient = "from-purple-500 to-pink-500" }) {
  return (
    <div className={cn("relative group", className)}>
      <div
        className={cn(
          "absolute inset-0 rounded-3xl blur-2xl opacity-25 group-hover:opacity-40 group-hover:blur-3xl transition-all duration-700",
          `bg-gradient-to-br ${gradient}`
        )}
      />
      <div className="relative rounded-3xl backdrop-blur-2xl bg-gradient-to-br from-white/55 to-white/30 border-2 border-white/60 shadow-lg hover:shadow-xl transition-all duration-500 overflow-hidden">
        <div className="absolute inset-px rounded-3xl bg-gradient-to-br from-white/55 via-white/35 to-white/25 pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:left-full transition-all duration-1000 ease-out" />
        </div>
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

/**
 * Landing-inspired rainbow CTA button
 * Keep this for primary actions only.
 */
function LiquidRainbowButton({ children, className = "", onClick, href, type = "button" }) {
  const content = (
    <>
      <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 via-orange-500 via-yellow-500 via-green-500 to-blue-600 bg-[length:200%_100%] synergyai-animate-gradient" />
      <div className="absolute inset-0 backdrop-blur-sm bg-white/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/45 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
      <div className="absolute inset-px rounded-full bg-gradient-to-br from-white/25 to-transparent pointer-events-none" />
      <span className="relative z-10 flex items-center gap-2 text-base font-semibold text-white drop-shadow-sm">
        {children}
      </span>
    </>
  );

  if (href) {
    return (
      <Link to={href} className={cn("group relative px-6 py-3 rounded-full overflow-hidden inline-flex items-center justify-center", className)}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      className={cn("group relative px-6 py-3 rounded-full overflow-hidden inline-flex items-center justify-center", className)}
    >
      {content}
    </button>
  );
}

export default function MyStartups() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("startups");

  // Dialog
  const [showDialog, setShowDialog] = useState(false);
  const [editingStartup, setEditingStartup] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Page-level controls
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [sortBy, setSortBy] = useState("new");

  // Analysis/Insights selectors (dropdowns)
  const [selectedStartupForAnalysisId, setSelectedStartupForAnalysisId] = useState("");
  const [selectedStartupForInsightsId, setSelectedStartupForInsightsId] = useState("");

  const [formData, setFormData] = useState({
    company_name: "",
    one_liner: "",
    website: "",
    linkedin_url: "",
    industry: [],
    stage: "",
    location: "",
    funding_sought: "",
    team_size: "",
    problem: "",
    solution: "",
    pitch_deck_url: "",
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    ensureGlobalStyles();
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
      } catch (e) {
        // If not authenticated, app routing should handle redirects.
      }
    };
    loadUser();
  }, []);

  const { data: startups = [], isLoading } = useQuery({
    queryKey: ["myStartups", user?.id],
    queryFn: () => base44.entities.Startup.filter({ founder_id: user?.id }),
    enabled: !!user,
  });

  const { data: outreaches = [] } = useQuery({
    queryKey: ["myOutreaches"],
    queryFn: () => base44.entities.Outreach.list("-created_date", 200),
    enabled: !!user,
  });

  const { data: matches = [] } = useQuery({
    queryKey: ["myMatches"],
    queryFn: () => base44.entities.Match.list("-created_date", 200),
    enabled: !!user,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => base44.entities.Contact.list("-created_date", 500),
    enabled: !!user,
  });

  const { data: firms = [] } = useQuery({
    queryKey: ["firms"],
    queryFn: () => base44.entities.InvestorFirm.list("-created_date", 500),
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

  // Keep dropdown selections stable
  useEffect(() => {
    if (startups.length && !selectedStartupForAnalysisId) setSelectedStartupForAnalysisId(startups[0].id);
    if (startups.length && !selectedStartupForInsightsId) setSelectedStartupForInsightsId(startups[0].id);
  }, [startups, selectedStartupForAnalysisId, selectedStartupForInsightsId]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Startup.create({ ...data, founder_id: user.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myStartups"] });
      toast.success("Startup created");
      setShowDialog(false);
      resetForm();
    },
    onError: () => toast.error("Failed to create startup"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Startup.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myStartups"] });
      toast.success("Startup updated");
      setShowDialog(false);
      resetForm();
    },
    onError: () => toast.error("Failed to update startup"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Startup.delete(id),
    onSuccess: () => {
      toast.success("Startup deleted");
      queryClient.invalidateQueries({ queryKey: ["myStartups"] });
    },
    onError: () => toast.error("Failed to delete startup"),
  });

  const resetForm = () => {
    setFormData({
      company_name: "",
      one_liner: "",
      website: "",
      linkedin_url: "",
      industry: [],
      stage: "",
      location: "",
      funding_sought: "",
      team_size: "",
      problem: "",
      solution: "",
      pitch_deck_url: "",
    });
    setEditingStartup(null);
  };

  const handleEdit = (startup) => {
    setEditingStartup(startup);
    setFormData({
      company_name: startup.company_name || "",
      one_liner: startup.one_liner || "",
      website: startup.website || "",
      linkedin_url: startup.linkedin_url || "",
      industry: startup.industry || [],
      stage: startup.stage || "",
      location: startup.location || "",
      funding_sought: startup.funding_sought || "",
      team_size: startup.team_size || "",
      problem: startup.problem || "",
      solution: startup.solution || "",
      pitch_deck_url: startup.pitch_deck_url || "",
    });
    setShowDialog(true);
  };

  const toggleIndustry = (ind) => {
    setFormData((prev) => ({
      ...prev,
      industry: prev.industry.includes(ind)
        ? prev.industry.filter((i) => i !== ind)
        : [...prev.industry, ind],
    }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData((prev) => ({ ...prev, pitch_deck_url: file_url }));

      const analysis = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this pitch deck and extract key information. URL: ${file_url}`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            company_name: { type: "string" },
            one_liner: { type: "string" },
            industry: { type: "array", items: { type: "string" } },
            stage: { type: "string" },
            problem: { type: "string" },
            solution: { type: "string" },
            team_size: { type: "number" },
            funding_sought: { type: "number" },
            summary: { type: "string" },
          },
        },
      });

      if (analysis) {
        setFormData((prev) => ({
          ...prev,
          company_name: prev.company_name || analysis.company_name || "",
          one_liner: prev.one_liner || analysis.one_liner || "",
          industry: prev.industry?.length ? prev.industry : analysis.industry || [],
          stage: prev.stage || analysis.stage || "",
          problem: prev.problem || analysis.problem || "",
          solution: prev.solution || analysis.solution || "",
          team_size: prev.team_size || analysis.team_size || "",
          funding_sought: prev.funding_sought || analysis.funding_sought || "",
        }));
        toast.success("Deck uploaded and analyzed");
      } else {
        toast.success("Deck uploaded");
      }
    } catch (error) {
      console.error("Error analyzing pitch deck:", error);
      toast.error("Upload/analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      funding_sought: formData.funding_sought ? Number(formData.funding_sought) : undefined,
      team_size: formData.team_size ? Number(formData.team_size) : undefined,
      status: "active",
    };

    if (!data.company_name || !data.stage) {
      toast.error("Company name and stage are required");
      return;
    }

    if (editingStartup) updateMutation.mutate({ id: editingStartup.id, data });
    else createMutation.mutate(data);
  };

  const stats = useMemo(() => {
    const activeStartups = startups.length;
    const withDeck = startups.filter((s) => !!s.pitch_deck_url).length;
    const totalMatches = matches.length;
    const sentOutreach = outreaches.filter((o) => o.stage && o.stage !== "draft").length;
    return { activeStartups, withDeck, totalMatches, sentOutreach };
  }, [startups, matches, outreaches]);

  const filteredStartups = useMemo(() => {
    const term = search.trim().toLowerCase();
    let rows = [...startups];

    if (stageFilter !== "all") {
      rows = rows.filter((s) => (s.stage || "").toLowerCase() === stageFilter.toLowerCase());
    }

    if (term) {
      rows = rows.filter((s) => {
        const name = (s.company_name || "").toLowerCase();
        const desc = (s.one_liner || "").toLowerCase();
        const ind = (s.industry || []).join(" ").toLowerCase();
        return name.includes(term) || desc.includes(term) || ind.includes(term);
      });
    }

    rows.sort((a, b) => {
      if (sortBy === "name") return (a.company_name || "").localeCompare(b.company_name || "");
      const da = new Date(a.created_date || 0).getTime();
      const db = new Date(b.created_date || 0).getTime();
      return db - da;
    });

    return rows;
  }, [startups, search, stageFilter, sortBy]);

  const selectedStartupForAnalysis = useMemo(
    () => startups.find((s) => s.id === selectedStartupForAnalysisId) || null,
    [startups, selectedStartupForAnalysisId]
  );

  const selectedStartupForInsights = useMemo(
    () => startups.find((s) => s.id === selectedStartupForInsightsId) || null,
    [startups, selectedStartupForInsightsId]
  );

  if (isLoading) {
    return (
      <div className="min-h-[420px] rounded-3xl overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />
        <AnimatedGridPattern />
        <div className="relative p-10">
          <LiquidGlassCard gradient="from-purple-500 to-blue-500">
            <div className="p-8 flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
              <p className="text-slate-700 font-medium">Loading startups…</p>
            </div>
          </LiquidGlassCard>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Page background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />
      <AnimatedGridPattern />
      <div className="absolute top-0 left-1/4 w-[520px] h-[520px] bg-gradient-to-br from-purple-400/25 to-pink-400/25 rounded-full blur-3xl animate-pulse" />
      <div className="absolute top-1/3 right-1/4 w-[420px] h-[420px] bg-gradient-to-br from-orange-400/25 to-yellow-400/25 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      <div className="absolute bottom-0 left-1/3 w-[460px] h-[460px] bg-gradient-to-br from-green-400/25 to-blue-400/25 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />

      <div className="relative z-10 space-y-6 px-4 sm:px-6 lg:px-8 py-6">
        {/* Header / Hero */}
        <LiquidGlassCard gradient="from-purple-500 via-pink-500 to-blue-500">
          <div className="p-6 md:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-xl bg-gradient-to-r from-purple-100/80 to-pink-100/80 border-2 border-white/60 shadow-lg relative overflow-hidden">
                  <div className="absolute inset-px rounded-full bg-gradient-to-r from-white/40 to-transparent pointer-events-none" />
                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 animate-pulse relative z-10" />
                  <Sparkles className="h-4 w-4 text-purple-600 relative z-10" />
                  <span className="text-sm font-semibold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent relative z-10">
                    Startup workspace
                  </span>
                </div>

                <h1 className="mt-6 text-4xl md:text-5xl font-bold text-slate-900 leading-tight">
                  My{" "}
                  <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Startups
                  </span>
                </h1>
                <p className="mt-2 text-base md:text-lg text-slate-600 max-w-2xl">
                  Manage profiles, upload pitch decks, and unlock AI insights to improve investor matching.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <LiquidRainbowButton
                  onClick={() => {
                    resetForm();
                    setShowDialog(true);
                  }}
                  className="h-[48px]"
                >
                  <Plus className="w-5 h-5" />
                  Add Startup
                </LiquidRainbowButton>
              </div>
            </div>

            {/* Compact stats */}
            <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: "Startups", value: stats.activeStartups, icon: Rocket, gradient: "from-purple-500 to-pink-500" },
                { label: "With Deck", value: stats.withDeck, icon: FileText, gradient: "from-pink-500 to-orange-500" },
                { label: "Matches", value: stats.totalMatches, icon: Wand2, gradient: "from-orange-500 to-yellow-500" },
                { label: "Outreach Sent", value: stats.sentOutreach, icon: BarChart3, gradient: "from-green-500 to-blue-500" },
              ].map((s, idx) => (
                <LiquidGlassCard key={idx} gradient={s.gradient}>
                  <div className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className={cn("absolute inset-0 rounded-2xl blur-lg opacity-50", `bg-gradient-to-br ${s.gradient}`)} />
                        <div className={cn("relative h-11 w-11 rounded-2xl backdrop-blur-xl border-2 border-white/60 shadow-lg flex items-center justify-center", `bg-gradient-to-br ${s.gradient}`)}>
                          <s.icon className="h-5 w-5 text-white" />
                        </div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-slate-900">{s.value}</div>
                        <div className="text-sm text-slate-600 font-medium">{s.label}</div>
                      </div>
                    </div>
                  </div>
                </LiquidGlassCard>
              ))}
            </div>
          </div>
        </LiquidGlassCard>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start rounded-3xl border-2 border-white/60 backdrop-blur-2xl bg-gradient-to-r from-white/55 to-white/35 p-1 shadow-lg">
            {[
              { value: "startups", icon: Rocket, label: "Startups" },
              { value: "pitch-analysis", icon: Brain, label: "Pitch Analysis" },
              { value: "crm-insights", icon: BarChart3, label: "CRM Insights" },
            ].map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="rounded-2xl px-4 py-2 data-[state=active]:bg-white/70 data-[state=active]:shadow-md data-[state=active]:text-slate-900 text-slate-700"
              >
                <span className="inline-flex items-center gap-2 font-semibold">
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* STARTUPS */}
          <TabsContent value="startups" className="mt-6 space-y-6">
            {/* Controls */}
            <LiquidGlassCard gradient="from-blue-500 to-purple-500">
              <div className="p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-1 items-center gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search startups, industries, one-liners…"
                        className="pl-11 h-12 rounded-2xl bg-white/55 border-2 border-white/60 backdrop-blur-xl text-slate-800 placeholder:text-slate-500 shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>

                    <div className="hidden md:flex items-center gap-3">
                      <div className="w-[190px]">
                        <Select value={stageFilter} onValueChange={setStageFilter}>
                          <SelectTrigger className="h-12 rounded-2xl bg-white/55 border-2 border-white/60 backdrop-blur-xl text-slate-800 shadow-sm">
                            <Filter className="w-4 h-4 mr-2 text-slate-600" />
                            <SelectValue placeholder="Stage" />
                          </SelectTrigger>
                          <SelectContent className="border-2 border-white/60 bg-white/80 backdrop-blur-xl">
                            <SelectItem value="all">All stages</SelectItem>
                            {stages.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="w-[170px]">
                        <Select value={sortBy} onValueChange={(v) => setSortBy(v)}>
                          <SelectTrigger className="h-12 rounded-2xl bg-white/55 border-2 border-white/60 backdrop-blur-xl text-slate-800 shadow-sm">
                            <SelectValue placeholder="Sort" />
                          </SelectTrigger>
                          <SelectContent className="border-2 border-white/60 bg-white/80 backdrop-blur-xl">
                            <SelectItem value="new">Newest</SelectItem>
                            <SelectItem value="name">Name</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      className="h-12 rounded-full border-2 border-white/60 bg-white/55 text-slate-800 hover:bg-white/70 shadow-sm"
                      asChild
                    >
                      <Link to={createPageUrl("Matches")}>
                        <Wand2 className="w-4 h-4 mr-2" />
                        Investor Matches
                      </Link>
                    </Button>

                    <LiquidRainbowButton
                      onClick={() => {
                        resetForm();
                        setShowDialog(true);
                      }}
                      className="h-12"
                    >
                      <Plus className="w-5 h-5" />
                      Add
                    </LiquidRainbowButton>
                  </div>
                </div>
              </div>
            </LiquidGlassCard>

            {startups.length === 0 ? (
              <LiquidGlassCard gradient="from-purple-500 to-blue-500">
                <div className="p-12 text-center">
                  <div className="mx-auto w-16 h-16 rounded-2xl border-2 border-white/60 bg-white/55 backdrop-blur-xl flex items-center justify-center shadow-lg">
                    <Rocket className="w-8 h-8 text-purple-600" />
                  </div>
                  <h3 className="mt-5 text-2xl font-bold text-slate-900">No startups yet</h3>
                  <p className="mt-2 text-slate-600 max-w-xl mx-auto">
                    Add your startup to get matched with the right investors. Upload a pitch deck to unlock AI extraction and recommendations.
                  </p>
                  <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                    <LiquidRainbowButton
                      onClick={() => {
                        resetForm();
                        setShowDialog(true);
                      }}
                    >
                      <Plus className="w-5 h-5" />
                      Add your first startup
                    </LiquidRainbowButton>

                    <Button
                      variant="outline"
                      className="h-12 rounded-full border-2 border-white/60 bg-white/55 text-slate-800 hover:bg-white/70 shadow-sm"
                      asChild
                    >
                      <Link to={createPageUrl("DataImport")}>
                        Go to Import / Onboarding
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </LiquidGlassCard>
            ) : filteredStartups.length === 0 ? (
              <LiquidGlassCard gradient="from-orange-500 to-yellow-500">
                <div className="p-10">
                  <p className="text-slate-700 font-medium">No results. Try adjusting your search or filters.</p>
                </div>
              </LiquidGlassCard>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredStartups.map((startup) => (
                  <LiquidGlassCard
                    key={startup.id}
                    gradient="from-purple-500 via-pink-500 to-blue-500"
                    className="h-full"
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-500 via-pink-500 via-orange-500 via-yellow-500 via-green-500 to-blue-500 rounded-2xl blur-lg opacity-50" />
                            <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600/90 via-pink-600/90 via-orange-500/90 via-yellow-500/90 via-green-500/90 to-blue-600/90 flex items-center justify-center text-white font-bold shadow-xl border-2 border-white/60 overflow-hidden">
                              <div className="absolute inset-0.5 rounded-2xl bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
                              {initials(startup.company_name)}
                            </div>
                          </div>

                          <div>
                            <CardTitle className="text-xl text-slate-900 leading-tight">
                              {startup.company_name || "Untitled"}
                            </CardTitle>

                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <Badge className="border-2 border-white/60 bg-white/55 text-slate-800">
                                {startup.stage || "Stage not set"}
                              </Badge>
                              {startup.pitch_deck_url ? (
                                <Badge className="border-2 border-white/60 bg-emerald-500/15 text-emerald-700">
                                  Deck
                                </Badge>
                              ) : (
                                <Badge className="border-2 border-white/60 bg-amber-500/15 text-amber-800">
                                  No deck
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-slate-700 hover:bg-white/60"
                            onClick={() => handleEdit(startup)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-600 hover:bg-red-500/10"
                            onClick={() => deleteMutation.mutate(startup.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      <p className="mt-4 text-sm text-slate-600 leading-relaxed line-clamp-2 min-h-[40px]">
                        {startup.one_liner || "Add a one-liner to improve your matches."}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {(startup.industry || []).slice(0, 3).map((ind, i) => (
                          <Badge
                            key={`${startup.id}-ind-${i}`}
                            variant="outline"
                            className="text-xs border-2 border-white/60 bg-white/45 text-slate-700"
                          >
                            {ind}
                          </Badge>
                        ))}
                        {(startup.industry || []).length > 3 && (
                          <Badge className="text-xs border-2 border-white/60 bg-white/55 text-slate-700">
                            +{(startup.industry || []).length - 3}
                          </Badge>
                        )}
                      </div>

                      <div className="mt-4 space-y-2 text-sm text-slate-600">
                        {startup.location && (
                          <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 text-slate-500" />
                            <span>{startup.location}</span>
                          </div>
                        )}
                        {startup.funding_sought && (
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-slate-500" />
                            <span>Seeking {formatMillionsUSD(startup.funding_sought)}</span>
                          </div>
                        )}
                        {startup.team_size && (
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-slate-500" />
                            <span>{startup.team_size} team members</span>
                          </div>
                        )}
                      </div>

                      {(startup.website || startup.linkedin_url) && (
                        <div className="mt-5 flex items-center gap-2">
                          {startup.website && (
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800 hover:bg-white/70 shadow-sm"
                            >
                              <a href={startup.website} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Website
                              </a>
                            </Button>
                          )}
                          {startup.linkedin_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800 hover:bg-white/70 shadow-sm"
                            >
                              <a href={startup.linkedin_url} target="_blank" rel="noopener noreferrer">
                                <Linkedin className="w-4 h-4 mr-2" />
                                LinkedIn
                              </a>
                            </Button>
                          )}
                        </div>
                      )}

                      <div className="mt-6 flex items-center gap-3 pt-4 border-t border-white/60">
                        {startup.pitch_deck_url ? (
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                            className="flex-1 rounded-full border-2 border-white/60 bg-white/55 text-slate-800 hover:bg-white/70 shadow-sm"
                          >
                            <a href={startup.pitch_deck_url} target="_blank" rel="noopener noreferrer">
                              <FileText className="w-4 h-4 mr-1" />
                              View Deck
                            </a>
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 rounded-full border-2 border-white/60 bg-white/55 text-slate-800 hover:bg-white/70 shadow-sm"
                            onClick={() => handleEdit(startup)}
                          >
                            <Upload className="w-4 h-4 mr-1" />
                            Upload Deck
                          </Button>
                        )}

                        <LiquidRainbowButton
                          href={createPageUrl(`Matches?startup=${startup.id}`)}
                          className="flex-1 h-9 py-0"
                        >
                          Find Investors
                          <ArrowRight className="w-4 h-4" />
                        </LiquidRainbowButton>
                      </div>
                    </div>
                  </LiquidGlassCard>
                ))}
              </div>
            )}
          </TabsContent>

          {/* PITCH ANALYSIS */}
          <TabsContent value="pitch-analysis" className="mt-6">
            {startups.length === 0 ? (
              <LiquidGlassCard gradient="from-purple-500 to-blue-500">
                <div className="p-12 text-center">
                  <Brain className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                  <p className="text-slate-700 font-medium">
                    Add a startup and upload a pitch deck to get AI analysis.
                  </p>
                </div>
              </LiquidGlassCard>
            ) : (
              <div className="space-y-6">
                <LiquidGlassCard gradient="from-blue-500 to-purple-500">
                  <div className="p-6">
                    <CardHeader className="p-0 mb-4">
                      <CardTitle className="text-slate-900">Select startup</CardTitle>
                      <CardDescription className="text-slate-600">
                        Choose which startup you want to analyze.
                      </CardDescription>
                    </CardHeader>

                    <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                      <div className="w-full md:max-w-md">
                        <Select value={selectedStartupForAnalysisId} onValueChange={setSelectedStartupForAnalysisId}>
                          <SelectTrigger className="h-12 rounded-2xl bg-white/55 border-2 border-white/60 backdrop-blur-xl text-slate-800 shadow-sm">
                            <SelectValue placeholder="Select startup" />
                          </SelectTrigger>
                          <SelectContent className="border-2 border-white/60 bg-white/80 backdrop-blur-xl">
                            {startups.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.company_name || "Untitled"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedStartupForAnalysis?.pitch_deck_url ? (
                        <Badge className="border-2 border-white/60 bg-emerald-500/15 text-emerald-700 w-fit">
                          Deck attached
                        </Badge>
                      ) : (
                        <Badge className="border-2 border-white/60 bg-amber-500/15 text-amber-800 w-fit">
                          No deck
                        </Badge>
                      )}
                    </div>
                  </div>
                </LiquidGlassCard>

                {selectedStartupForAnalysis && (
                  <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 md:grid-cols-7 rounded-3xl border-2 border-white/60 bg-gradient-to-r from-white/55 to-white/35 p-1 backdrop-blur-2xl shadow-lg">
                      {[
                        ["overview", "Overview"],
                        ["improvements", "Improvements"],
                        ["financials", "Financials"],
                        ["competitive", "Competitive"],
                        ["generator", "Generator"],
                        ["order", "Order"],
                        ["design", "Design"],
                      ].map(([v, label]) => (
                        <TabsTrigger
                          key={v}
                          value={v}
                          className="rounded-2xl data-[state=active]:bg-white/70 data-[state=active]:text-slate-900 text-slate-700 font-semibold"
                        >
                          {label}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    <TabsContent value="overview" className="mt-6">
                      <PitchDeckAnalysis
                        startup={selectedStartupForAnalysis}
                        onAnalysisComplete={async (analysis) => {
                          await base44.entities.Startup.update(selectedStartupForAnalysis.id, {
                            pitch_deck_extracted: {
                              ...selectedStartupForAnalysis.pitch_deck_extracted,
                              analysis,
                            },
                          });
                          queryClient.invalidateQueries({ queryKey: ["myStartups"] });
                        }}
                        onDeckUpload={async (url) => {
                          await base44.entities.Startup.update(selectedStartupForAnalysis.id, {
                            pitch_deck_url: url,
                          });
                          queryClient.invalidateQueries({ queryKey: ["myStartups"] });
                        }}
                      />
                    </TabsContent>

                    <TabsContent value="improvements" className="mt-6">
                      {selectedStartupForAnalysis.pitch_deck_extracted?.analysis?.slide_by_slide?.length ? (
                        selectedStartupForAnalysis.pitch_deck_extracted.analysis.slide_by_slide.map((slide, i) => (
                          <div key={i} className="mb-4">
                            <SlideImprovementSuggestions slide={slide} />
                          </div>
                        ))
                      ) : (
                        <LiquidGlassCard gradient="from-orange-500 to-yellow-500">
                          <div className="p-10 text-slate-700 font-medium">
                            Run an analysis first to see slide-level improvements.
                          </div>
                        </LiquidGlassCard>
                      )}
                    </TabsContent>

                    <TabsContent value="financials" className="mt-6">
                      <FinancialProjectionsAnalysis startup={selectedStartupForAnalysis} />
                    </TabsContent>

                    <TabsContent value="competitive" className="mt-6">
                      <CompetitiveDeckComparison
                        myDeckData={selectedStartupForAnalysis.pitch_deck_extracted?.analysis}
                        startup={selectedStartupForAnalysis}
                      />
                    </TabsContent>

                    <TabsContent value="generator" className="mt-6">
                      <MissingSectionGenerator
                        startup={selectedStartupForAnalysis}
                        analysis={selectedStartupForAnalysis.pitch_deck_extracted?.analysis}
                      />
                    </TabsContent>

                    <TabsContent value="order" className="mt-6">
                      <SlideOrderOptimizer
                        startup={selectedStartupForAnalysis}
                        analysis={selectedStartupForAnalysis.pitch_deck_extracted?.analysis}
                      />
                    </TabsContent>

                    <TabsContent value="design" className="mt-6">
                      <SlideDesignRecommendations
                        startup={selectedStartupForAnalysis}
                        analysis={selectedStartupForAnalysis.pitch_deck_extracted?.analysis}
                      />
                    </TabsContent>
                  </Tabs>
                )}
              </div>
            )}
          </TabsContent>

          {/* CRM INSIGHTS */}
          <TabsContent value="crm-insights" className="mt-6">
            {startups.length === 0 ? (
              <LiquidGlassCard gradient="from-purple-500 to-blue-500">
                <div className="p-12 text-center">
                  <BarChart3 className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                  <p className="text-slate-700 font-medium">
                    Add a startup and start outreach to see CRM insights.
                  </p>
                </div>
              </LiquidGlassCard>
            ) : (
              <div className="space-y-6">
                <LiquidGlassCard gradient="from-blue-500 to-purple-500">
                  <div className="p-6">
                    <CardHeader className="p-0 mb-4">
                      <CardTitle className="text-slate-900">Select startup</CardTitle>
                      <CardDescription className="text-slate-600">
                        CRM insights are scoped to the selected startup.
                      </CardDescription>
                    </CardHeader>

                    <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                      <div className="w-full md:max-w-md">
                        <Select value={selectedStartupForInsightsId} onValueChange={setSelectedStartupForInsightsId}>
                          <SelectTrigger className="h-12 rounded-2xl bg-white/55 border-2 border-white/60 backdrop-blur-xl text-slate-800 shadow-sm">
                            <SelectValue placeholder="Select startup" />
                          </SelectTrigger>
                          <SelectContent className="border-2 border-white/60 bg-white/80 backdrop-blur-xl">
                            {startups.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.company_name || "Untitled"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </LiquidGlassCard>

                {selectedStartupForInsights ? (
                  <AIInsightsPanel
                    startup={selectedStartupForInsights}
                    matches={matches.filter((m) => m.startup_id === selectedStartupForInsights.id)}
                    outreaches={outreaches.filter((o) => o.startup_id === selectedStartupForInsights.id)}
                    contacts={contactsMap}
                    firms={firmsMap}
                  />
                ) : (
                  <LiquidGlassCard gradient="from-purple-500 to-pink-500">
                    <div className="p-12 text-center">
                      <BarChart3 className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                      <p className="text-slate-700 font-medium">Select a startup above to view CRM insights.</p>
                    </div>
                  </LiquidGlassCard>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Add/Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-2 border-white/60 bg-white/65 text-slate-900 backdrop-blur-2xl rounded-3xl shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-slate-900">
                {editingStartup ? "Edit Startup" : "Add New Startup"}
              </DialogTitle>
              <DialogDescription className="text-slate-600">
                Fill in your startup details or upload a pitch deck to auto-populate.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Pitch deck upload */}
              <div className="rounded-3xl border-2 border-dashed border-white/60 bg-white/50 backdrop-blur-xl p-6 text-center shadow-sm">
                <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" id="pitch-deck" />
                <label htmlFor="pitch-deck" className="cursor-pointer">
                  {isAnalyzing ? (
                    <div className="flex flex-col items-center">
                      <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-2" />
                      <p className="text-sm text-slate-600">Analyzing your pitch deck with AI…</p>
                    </div>
                  ) : formData.pitch_deck_url ? (
                    <div className="flex flex-col items-center">
                      <FileText className="w-8 h-8 text-emerald-600 mb-2" />
                      <p className="text-sm text-emerald-700 font-semibold">Pitch deck uploaded</p>
                      <p className="text-xs text-slate-500 mt-1">Click to replace</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <Upload className="w-8 h-8 text-slate-500 mb-2" />
                      <p className="text-sm text-slate-800 font-semibold">Upload your pitch deck (PDF)</p>
                      <p className="text-xs text-slate-500 mt-1">We&apos;ll extract key information automatically</p>
                    </div>
                  )}
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-700">Company Name *</Label>
                  <Input
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    placeholder="Your startup name"
                    required
                    className="h-12 rounded-2xl bg-white/55 border-2 border-white/60 backdrop-blur-xl text-slate-800 placeholder:text-slate-500 shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700">Stage *</Label>
                  <Select value={formData.stage} onValueChange={(value) => setFormData({ ...formData, stage: value })}>
                    <SelectTrigger className="h-12 rounded-2xl bg-white/55 border-2 border-white/60 backdrop-blur-xl text-slate-800 shadow-sm">
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                    <SelectContent className="border-2 border-white/60 bg-white/80 backdrop-blur-xl">
                      {stages.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {stage}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700">One-liner</Label>
                <Input
                  value={formData.one_liner}
                  onChange={(e) => setFormData({ ...formData, one_liner: e.target.value })}
                  placeholder="Describe your startup in one sentence"
                  className="h-12 rounded-2xl bg-white/55 border-2 border-white/60 backdrop-blur-xl text-slate-800 placeholder:text-slate-500 shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700">Industry</Label>
                <div className="flex flex-wrap gap-2">
                  {industries.map((ind) => {
                    const active = formData.industry.includes(ind);
                    return (
                      <Badge
                        key={ind}
                        variant={active ? "default" : "outline"}
                        className={cn(
                          "cursor-pointer transition-all border-2 border-white/60 rounded-full px-3 py-1",
                          active
                            ? "text-white bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 shadow-md"
                            : "bg-white/50 text-slate-700 hover:bg-white/70"
                        )}
                        onClick={() => toggleIndustry(ind)}
                      >
                        {ind}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-700">Website</Label>
                  <Input
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://example.com"
                    className="h-12 rounded-2xl bg-white/55 border-2 border-white/60 backdrop-blur-xl text-slate-800 placeholder:text-slate-500 shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700">LinkedIn</Label>
                  <Input
                    value={formData.linkedin_url}
                    onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                    placeholder="https://linkedin.com/company/..."
                    className="h-12 rounded-2xl bg-white/55 border-2 border-white/60 backdrop-blur-xl text-slate-800 placeholder:text-slate-500 shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-700">Location</Label>
                  <Input
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="e.g., Berlin, DE"
                    className="h-12 rounded-2xl bg-white/55 border-2 border-white/60 backdrop-blur-xl text-slate-800 placeholder:text-slate-500 shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700">Team Size</Label>
                  <Input
                    type="number"
                    value={formData.team_size}
                    onChange={(e) => setFormData({ ...formData, team_size: e.target.value })}
                    placeholder="5"
                    className="h-12 rounded-2xl bg-white/55 border-2 border-white/60 backdrop-blur-xl text-slate-800 placeholder:text-slate-500 shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700">Funding Sought ($)</Label>
                <Input
                  type="number"
                  value={formData.funding_sought}
                  onChange={(e) => setFormData({ ...formData, funding_sought: e.target.value })}
                  placeholder="1000000"
                  className="h-12 rounded-2xl bg-white/55 border-2 border-white/60 backdrop-blur-xl text-slate-800 placeholder:text-slate-500 shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700">Problem</Label>
                <Textarea
                  value={formData.problem}
                  onChange={(e) => setFormData({ ...formData, problem: e.target.value })}
                  placeholder="What problem are you solving?"
                  rows={3}
                  className="rounded-2xl bg-white/55 border-2 border-white/60 backdrop-blur-xl text-slate-800 placeholder:text-slate-500 shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700">Solution</Label>
                <Textarea
                  value={formData.solution}
                  onChange={(e) => setFormData({ ...formData, solution: e.target.value })}
                  placeholder="How are you solving it?"
                  rows={3}
                  className="rounded-2xl bg-white/55 border-2 border-white/60 backdrop-blur-xl text-slate-800 placeholder:text-slate-500 shadow-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/60">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-full border-2 border-white/60 bg-white/55 text-slate-800 hover:bg-white/70 shadow-sm"
                  onClick={() => setShowDialog(false)}
                >
                  Cancel
                </Button>

                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="group relative h-12 px-6 rounded-full overflow-hidden inline-flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 via-orange-500 via-yellow-500 via-green-500 to-blue-600 bg-[length:200%_100%] synergyai-animate-gradient" />
                  <div className="absolute inset-0 backdrop-blur-sm bg-white/10" />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/45 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
                  <div className="absolute inset-px rounded-full bg-gradient-to-br from-white/25 to-transparent pointer-events-none" />
                  <span className="relative z-10 flex items-center gap-2 text-white font-semibold">
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    {editingStartup ? "Save Changes" : "Create Startup"}
                  </span>
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {process?.env?.NODE_ENV !== "production" ? <DevSelfTest startups={startups} /> : null}
      </div>
    </div>
  );
}

function DevSelfTest({ startups }) {
  try {
    startups.forEach((s) => {
      if (s.stage && typeof s.stage !== "string") throw new Error("Startup.stage must be a string");
      if (s.industry && !Array.isArray(s.industry)) throw new Error("Startup.industry must be an array");
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("MyStartups DevSelfTest failed:", e);
  }
  return null;
}