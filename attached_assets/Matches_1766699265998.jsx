import React, { useMemo, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Target,
  Loader2,
  Sparkles,
  SlidersHorizontal,
  Search,
  AlertCircle,
  RefreshCw,
  Building2,
  X,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import MatchCard from "@/components/matches/MatchCard";
import EnhancedMatchCard from "@/components/matching/EnhancedMatchCard";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const firmTypes = ["VC", "CVC", "Family Office", "Angel", "Accelerator"];
const stages = ["Pre-seed", "Seed", "Series A", "Series B", "Series C+"];

/**
 * Matches — SynergyAI "Liquid Glass" restyle
 * - Light gradient background + subtle animated grid
 * - Liquid glass surfaces (gradient + border-2 + blur)
 * - Rainbow CTA (single primary per cluster)
 * - Neutral secondary buttons (no gradients)
 * - Strong hierarchy typography
 */

function AnimatedGrid() {
  return (
    <div
      className="absolute inset-0 opacity-[0.22] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_70%)]"
      aria-hidden="true"
    >
      <div className="h-full w-full bg-[linear-gradient(to_right,rgba(15,23,42,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.07)_1px,transparent_1px)] bg-[size:56px_56px] animate-[gridDrift_18s_linear_infinite]" />
      <style>{`
        @keyframes gridDrift {
          from { transform: translateY(0px); }
          to { transform: translateY(56px); }
        }
      `}</style>
    </div>
  );
}

function PageBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />
      <AnimatedGrid />
      {/* Large blurred blobs (subtle) */}
      <div className="absolute -top-24 -right-28 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-purple-400/20 to-pink-400/16 blur-3xl" />
      <div className="absolute top-1/3 right-[10%] h-[420px] w-[420px] rounded-full bg-gradient-to-br from-orange-400/14 to-yellow-400/12 blur-3xl" />
      <div className="absolute -bottom-24 left-[12%] h-[520px] w-[520px] rounded-full bg-gradient-to-br from-green-400/12 to-blue-400/14 blur-3xl" />
    </div>
  );
}

function GlassSurface({ className, children }) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-3xl",
        "border-2 border-white/60",
        "bg-gradient-to-br from-white/55 to-white/30",
        "backdrop-blur-2xl",
        "shadow-lg hover:shadow-xl transition-shadow",
        className
      )}
    >
      {/* subtle inner highlight */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.65),transparent_55%)] opacity-60" />
      {children}
    </Card>
  );
}

function UnderGlow({ className }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute -inset-4 -z-10 rounded-[2.25rem] blur-3xl opacity-30",
        "bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400",
        className
      )}
      aria-hidden="true"
    />
  );
}

function Pill({ children, className }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border-2 border-white/60 bg-white/55 px-3 py-1 text-xs font-semibold text-slate-700 backdrop-blur-2xl",
        className
      )}
    >
      <span className="h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
      {children}
    </div>
  );
}

function RainbowCTA({ className, children, ...props }) {
  return (
    <Button
      className={cn(
        "group relative h-11 overflow-hidden rounded-full px-6 font-semibold text-white",
        "shadow-lg hover:shadow-xl transition-shadow",
        className
      )}
      {...props}
    >
      {/* Animated rainbow gradient */}
      <span className="absolute inset-0 bg-[linear-gradient(90deg,#7c3aed,#ec4899,#fb923c,#facc15,#22c55e,#3b82f6,#7c3aed)] bg-[length:220%_100%] animate-[rainbow_7s_linear_infinite]" />
      {/* Hover light sweep */}
      <span className="absolute -inset-y-8 -left-1/3 w-1/3 rotate-12 bg-white/25 blur-md opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:translate-x-[220%]" />
      <span className="relative flex items-center justify-center">{children}</span>

      <style>{`
        @keyframes rainbow {
          0% { background-position: 0% 50%; }
          100% { background-position: 220% 50%; }
        }
      `}</style>
    </Button>
  );
}

function SecondaryButton({ className, ...props }) {
  return (
    <Button
      variant="outline"
      className={cn(
        "h-11 rounded-full px-5",
        "border-2 border-white/60 bg-white/55 backdrop-blur-2xl",
        "text-slate-800 hover:bg-white/70",
        "shadow-lg hover:shadow-xl transition-shadow",
        className
      )}
      {...props}
    />
  );
}

function GlassInput({ className, ...props }) {
  return (
    <Input
      className={cn(
        "h-11 rounded-2xl",
        "border-2 border-white/60 bg-white/55 backdrop-blur-2xl",
        "placeholder:text-slate-500",
        "shadow-lg focus-visible:ring-0",
        className
      )}
      {...props}
    />
  );
}

function GlassSelectTrigger({ className, ...props }) {
  return (
    <SelectTrigger
      className={cn(
        "h-11 rounded-2xl",
        "border-2 border-white/60 bg-white/55 backdrop-blur-2xl",
        "shadow-lg focus:ring-0",
        className
      )}
      {...props}
    />
  );
}

function ScoreTone(score) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-slate-700";
}

export default function Matches() {
  const [user, setUser] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStartupId, setSelectedStartupId] = useState("all");

  const [filters, setFilters] = useState({
    firmTypes: [],
    stages: [],
    minScore: 0,
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [enhancedMatches, setEnhancedMatches] = useState(null);

  const [matchingFilters, setMatchingFilters] = useState({
    excludeContacted: true,
    minCheckSize: null,
    stages: [],
    sectors: [],
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
    };
    loadUser();
  }, []);

  const { data: startups = [] } = useQuery({
    queryKey: ["myStartups", user?.id],
    queryFn: () => base44.entities.Startup.filter({ founder_id: user?.id }),
    enabled: !!user,
  });

  const selectedStartupObj = useMemo(() => {
    if (!startups?.length) return null;
    if (selectedStartupId === "all") return startups[0] || null;
    return startups.find((s) => String(s.id) === String(selectedStartupId)) || null;
  }, [startups, selectedStartupId]);

  const { data: matches = [], isLoading: matchesLoading } = useQuery({
    queryKey: ["matches", selectedStartupId],
    queryFn: () =>
      selectedStartupId === "all"
        ? base44.entities.Match.list("-match_score", 100)
        : base44.entities.Match.filter(
            { startup_id: selectedStartupId },
            "-match_score",
            100
          ),
    enabled: !!user,
  });

  const { data: firms = [] } = useQuery({
    queryKey: ["firms"],
    queryFn: () => base44.entities.InvestorFirm.list("-created_date", 500),
    enabled: !!user,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => base44.entities.Contact.list("-created_date", 500),
    enabled: !!user,
  });

  const firmsMap = useMemo(
    () => firms.reduce((acc, f) => ({ ...acc, [f.id]: f }), {}),
    [firms]
  );
  const contactsMap = useMemo(
    () => contacts.reduce((acc, c) => ({ ...acc, [c.id]: c }), {}),
    [contacts]
  );

  const updateMatchMutation = useMutation({
    mutationFn: ({ id, patch }) => base44.entities.Match.update(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["matches"] }),
  });

  const createMatchMutation = useMutation({
    mutationFn: (payload) => base44.entities.Match.create(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["matches"] }),
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ id, feedback }) =>
      base44.entities.Match.update(id, { user_feedback: feedback }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["matches"] }),
  });

  const generateEnhancedMatches = async (startupId) => {
    if (!startupId || startupId === "all") {
      toast.error("Please select a startup first");
      return;
    }

    setIsGenerating(true);
    setEnhancedMatches(null);

    try {
      const response = await base44.functions.invoke("investorMatching", {
        startupId,
        limit: 50,
        filters: matchingFilters,
      });

      if (response?.data?.success) {
        setEnhancedMatches(response.data);
        toast.success(`Found ${response.data.matches_found} potential matches.`);
      } else {
        throw new Error(response?.data?.error || "Matching failed");
      }
    } catch (error) {
      console.error("Enhanced matching error:", error);
      toast.error(`Matching failed: ${error?.message || "Unknown error"}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Legacy matching kept as-is (your current logic)
  const generateMatches = async () => {
    if (!startups.length) return;
    setIsGenerating(true);

    try {
      const targetStartup =
        selectedStartupId === "all"
          ? startups[0]
          : startups.find((s) => String(s.id) === String(selectedStartupId));
      if (!targetStartup) return;

      const allOutreaches = await base44.entities.Outreach.list("-created_date", 500);

      const successfulOutreaches = allOutreaches.filter(
        (o) => o.stage === "replied" || o.stage === "call_scheduled" || o.stage === "funded"
      );

      const successfulFirmTypes = successfulOutreaches.reduce((acc, o) => {
        const firm = firms.find((f) => f.id === o.firm_id);
        if (firm?.firm_type) acc[firm.firm_type] = (acc[firm.firm_type] || 0) + 1;
        return acc;
      }, {});

      const sentimentData = allOutreaches.reduce((acc, o) => {
        if (o.sentiment_analysis?.overall_sentiment) {
          const firmId = o.firm_id;
          if (!acc[firmId]) acc[firmId] = { positive: 0, negative: 0, total: 0 };
          acc[firmId].total += 1;
          if (o.sentiment_analysis.overall_sentiment === "positive") acc[firmId].positive += 1;
          if (o.sentiment_analysis.overall_sentiment === "negative") acc[firmId].negative += 1;
        }
        return acc;
      }, {});

      for (const firm of firms.slice(0, 30)) {
        const existingMatch = matches.find(
          (m) => m.startup_id === targetStartup.id && m.firm_id === firm.id
        );
        if (existingMatch) continue;

        const historicalBonus = successfulFirmTypes[firm.firm_type]
          ? `This investor type (${firm.firm_type}) has shown ${successfulFirmTypes[firm.firm_type]} successful engagements historically.`
          : "";

        const firmSentiment = sentimentData[firm.id];
        const sentimentScore = firmSentiment
          ? (firmSentiment.positive / firmSentiment.total) * 100
          : null;

        const sentimentContext =
          sentimentScore != null
            ? `Past communications with this firm have ${sentimentScore.toFixed(
                0
              )}% positive sentiment (${firmSentiment.total} interactions).`
            : "";

        const feedbackPatterns = matches
          .filter((m) => m.user_feedback?.rating)
          .reduce(
            (acc, m) => {
              const f = firms.find((firm) => firm.id === m.firm_id);
              if (!f) return acc;

              if (m.user_feedback.rating === "positive") {
                if (f.firm_type)
                  acc.preferredTypes[f.firm_type] = (acc.preferredTypes[f.firm_type] || 0) + 1;
                f.investment_focus?.forEach((focus) => {
                  acc.preferredFocus[focus] = (acc.preferredFocus[focus] || 0) + 1;
                });
                f.investment_stages?.forEach((stage) => {
                  acc.preferredStages[stage] = (acc.preferredStages[stage] || 0) + 1;
                });
              } else if (m.user_feedback.rating === "negative") {
                if (f.firm_type)
                  acc.avoidedTypes[f.firm_type] = (acc.avoidedTypes[f.firm_type] || 0) + 1;
              }
              return acc;
            },
            { preferredTypes: {}, preferredFocus: {}, preferredStages: {}, avoidedTypes: {} }
          );

        const fundingGoal = targetStartup.funding_goal || targetStartup.funding_sought || 0;
        const checkSizeMin = firm.check_size_min || 0;
        const checkSizeMax = firm.check_size_max || 0;
        const avgCheckSize = firm.avg_check_size || (checkSizeMin + checkSizeMax) / 2;

        let checkSizeFit = "unknown";
        if (fundingGoal && avgCheckSize) {
          const ratio = fundingGoal / avgCheckSize;
          if (ratio >= 0.5 && ratio <= 2) checkSizeFit = "perfect";
          else if (ratio >= 0.3 && ratio <= 3) checkSizeFit = "good";
          else checkSizeFit = "poor";
        }

        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `Score this investor-startup match using sophisticated ML-style criteria.

STARTUP PROFILE:
Name: ${targetStartup.company_name}
Industry: ${targetStartup.industry?.join(", ")}
Stage: ${targetStartup.stage}
Location: ${targetStartup.location}
Funding Goal: $${fundingGoal}
Problem: ${targetStartup.problem}
Solution: ${targetStartup.solution}

INVESTOR PROFILE:
Name: ${firm.company_name}
Type: ${firm.firm_type}
Focus Areas: ${firm.investment_focus?.join(", ")}
Investment Stages: ${firm.investment_stages?.join(", ")}
Geography: ${firm.geographic_focus?.join(", ")}
Check Size Range: $${checkSizeMin} - $${checkSizeMax}
Avg Check: $${avgCheckSize}
Portfolio: ${firm.total_investments || 0} investments, ${firm.total_exits || 0} exits

LEARNED USER PREFERENCES:
✓ Preferred Types: ${JSON.stringify(feedbackPatterns.preferredTypes)}
✓ Preferred Focus: ${JSON.stringify(feedbackPatterns.preferredFocus)}
✓ Preferred Stages: ${JSON.stringify(feedbackPatterns.preferredStages)}
✗ Avoided Types: ${JSON.stringify(feedbackPatterns.avoidedTypes)}

HISTORICAL PERFORMANCE:
${historicalBonus}
${sentimentContext}

CHECK SIZE ANALYSIS:
Funding Goal: $${fundingGoal}
Investor Avg Check: $${avgCheckSize}
Fit Assessment: ${checkSizeFit}

SCORING CRITERIA (weighted):
1. Industry/Sector Alignment (20%)
2. Stage Match (20%)
3. Check Size Compatibility (15%) - ${checkSizeFit}
4. Geographic Alignment (10%)
5. User Feedback Learning (15%)
6. Historical Success (10%)
7. Sentiment Analysis (10%)

Score 0-100. Be strict: <50 = poor, 50-69 = decent, 70-84 = good, 85+ = excellent.`,
          response_json_schema: {
            type: "object",
            properties: {
              score: { type: "number" },
              reasons: { type: "array", items: { type: "string" } },
              predicted_interest: { type: "number" },
              recommended_approach: { type: "string" },
              check_size_compatibility: { type: "string" },
              confidence: { type: "number" },
            },
          },
        });

        if (result && result.score > 40) {
          const primaryContact = contacts.find((c) => c.firm_id === firm.id && c.is_primary);

          const matchSentiment = sentimentData[firm.id]
            ? {
                sentiment_score: sentimentScore?.toFixed?.(0),
                total_interactions: firmSentiment.total,
                positive_rate: ((firmSentiment.positive / firmSentiment.total) * 100).toFixed(1),
              }
            : null;

          await base44.entities.Match.create({
            startup_id: targetStartup.id,
            firm_id: firm.id,
            contact_id: primaryContact?.id,
            match_score: result.score,
            match_reasons: result.reasons || [],
            status: "suggested",
            founder_notes: result.recommended_approach,
            predicted_interest: result.predicted_interest,
            sentiment_analysis: matchSentiment,
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["matches"] });
      toast.success("New matches generated.");
    } catch (error) {
      console.error("Error generating matches:", error);
      toast.error("Failed to generate matches.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInitiateOutreach = async (match) => {
    if (!selectedStartupObj || selectedStartupId === "all") {
      toast.error("Select a startup first.");
      return;
    }
    try {
      await createMatchMutation.mutateAsync({
        startup_id: selectedStartupObj.id,
        firm_id: match.investor_id,
        match_score: match.fit_score,
        match_reasons: match.match_reasons,
        status: "contacted",
      });
      toast.success("Match saved. Next: create outreach message.");
    } catch {
      toast.error("Failed to initiate outreach.");
    }
  };

  const handleSaveMatch = async (match) => {
    if (!selectedStartupObj || selectedStartupId === "all") {
      toast.error("Select a startup first.");
      return;
    }
    try {
      await createMatchMutation.mutateAsync({
        startup_id: selectedStartupObj.id,
        firm_id: match.investor_id,
        match_score: match.fit_score,
        match_reasons: match.match_reasons,
        status: "saved",
      });
      toast.success("Match saved.");
    } catch {
      toast.error("Failed to save match.");
    }
  };

  const handleMatchFeedback = async (match, feedback) => {
    try {
      // Find if match exists in database
      const existingMatch = matches.find(m => 
        m.startup_id === selectedStartupObj?.id && 
        m.firm_id === match.investor_id
      );

      if (existingMatch) {
        await updateMatchMutation.mutateAsync({
          id: existingMatch.id,
          patch: { user_feedback: feedback }
        });
      } else {
        // Create match with feedback
        await createMatchMutation.mutateAsync({
          startup_id: selectedStartupObj.id,
          firm_id: match.investor_id,
          match_score: match.fit_score,
          match_reasons: match.match_reasons,
          status: "suggested",
          user_feedback: feedback
        });
      }
    } catch (error) {
      throw error;
    }
  };

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      const firm = firmsMap[match.firm_id];
      if (!firm) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameHit = firm.company_name?.toLowerCase().includes(q);
        const focusHit = firm.investment_focus?.some((f) => String(f).toLowerCase().includes(q));
        if (!nameHit && !focusHit) return false;
      }

      if (filters.firmTypes.length > 0 && !filters.firmTypes.includes(firm.firm_type)) return false;

      if (
        filters.stages.length > 0 &&
        !firm.investment_stages?.some((s) => filters.stages.includes(s))
      )
        return false;

      if ((match.match_score ?? 0) < filters.minScore) return false;

      return true;
    });
  }, [matches, firmsMap, searchQuery, filters]);

  const savedMatches = filteredMatches.filter((m) => m.status === "saved");
  const suggestedMatches = filteredMatches.filter((m) => m.status === "suggested");

  const activeFilterCount =
    filters.firmTypes.length + filters.stages.length + (filters.minScore > 0 ? 1 : 0);

  if (matchesLoading) {
    return (
      <div className="relative min-h-[55vh]">
        <PageBackground />
        <div className="flex h-[55vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading matches…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <PageBackground />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Pill>Investor Matching</Pill>
            <h1 className="mt-3 text-4xl font-bold text-slate-900">
              Investor <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">Matches</span>
            </h1>
            <p className="mt-2 text-slate-600">
              High-signal recommendations with clear scoring, reasons, and next actions.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-[260px]">
              <Select value={String(selectedStartupId)} onValueChange={setSelectedStartupId}>
                <GlassSelectTrigger>
                  <SelectValue placeholder="All startups" />
                </GlassSelectTrigger>
                <SelectContent className="rounded-2xl border-2 border-white/60 bg-white/70 backdrop-blur-2xl shadow-xl">
                  <SelectItem value="all">All Startups</SelectItem>
                  {startups.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* One primary CTA per cluster */}
            <RainbowCTA
              onClick={() =>
                selectedStartupId !== "all" ? generateEnhancedMatches(selectedStartupId) : generateMatches()
              }
              disabled={isGenerating || firms.length === 0}
            >
              {isGenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Find Investors
            </RainbowCTA>

            <SecondaryButton
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["matches"] });
                toast.message("Refreshing…");
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </SecondaryButton>
          </div>
        </div>

        {/* Controls Bar */}
        <GlassSurface>
          <UnderGlow className="opacity-25" />
          <CardContent className="relative p-5 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <GlassInput
                  placeholder="Search investors by name or focus…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Sheet>
                <SheetTrigger asChild>
                  <SecondaryButton>
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge className="ml-2 rounded-full border-2 border-white/60 bg-white/55 text-slate-800">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </SecondaryButton>
                </SheetTrigger>

                <SheetContent className="border-l-0 bg-transparent p-0">
                  <div className="relative h-full">
                    {/* Glass modal panel */}
                    <div className="absolute inset-0 bg-black/0" />
                    <div className="absolute inset-4">
                      <div className="relative h-full rounded-3xl border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30 backdrop-blur-2xl shadow-xl">
                        <UnderGlow className="opacity-30" />
                        <div className="relative p-6">
                          <div className="flex items-start justify-between gap-3">
                            <SheetHeader className="space-y-1">
                              <SheetTitle className="text-slate-900">Filter Matches</SheetTitle>
                              <p className="text-sm text-slate-600">
                                Tune by investor type, stage, and minimum score.
                              </p>
                            </SheetHeader>
                            <SheetClose asChild>
                              <button
                                className="rounded-full border-2 border-white/60 bg-white/55 p-2 text-slate-700 hover:bg-white/70"
                                aria-label="Close"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </SheetClose>
                          </div>

                          <div className="mt-6 space-y-6">
                            <div>
                              <Label className="mb-3 block text-sm font-medium text-slate-800">
                                Investor Type
                              </Label>
                              <div className="grid grid-cols-1 gap-2">
                                {firmTypes.map((type) => (
                                  <label
                                    key={type}
                                    className="flex items-center gap-3 rounded-2xl border-2 border-white/60 bg-white/55 p-3 text-sm text-slate-700 hover:bg-white/70"
                                  >
                                    <Checkbox
                                      checked={filters.firmTypes.includes(type)}
                                      onCheckedChange={(checked) => {
                                        setFilters((prev) => ({
                                          ...prev,
                                          firmTypes: checked
                                            ? [...prev.firmTypes, type]
                                            : prev.firmTypes.filter((t) => t !== type),
                                        }));
                                      }}
                                    />
                                    {type}
                                  </label>
                                ))}
                              </div>
                            </div>

                            <div>
                              <Label className="mb-3 block text-sm font-medium text-slate-800">
                                Investment Stage
                              </Label>
                              <div className="grid grid-cols-1 gap-2">
                                {stages.map((stage) => (
                                  <label
                                    key={stage}
                                    className="flex items-center gap-3 rounded-2xl border-2 border-white/60 bg-white/55 p-3 text-sm text-slate-700 hover:bg-white/70"
                                  >
                                    <Checkbox
                                      checked={filters.stages.includes(stage)}
                                      onCheckedChange={(checked) => {
                                        setFilters((prev) => ({
                                          ...prev,
                                          stages: checked
                                            ? [...prev.stages, stage]
                                            : prev.stages.filter((s) => s !== stage),
                                        }));
                                      }}
                                    />
                                    {stage}
                                  </label>
                                ))}
                              </div>
                            </div>

                            <div className="rounded-3xl border-2 border-white/60 bg-white/55 p-4">
                              <div className="flex items-center justify-between">
                                <Label className="text-sm font-medium text-slate-800">
                                  Minimum Match Score
                                </Label>
                                <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800">
                                  {filters.minScore}%
                                </Badge>
                              </div>

                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={filters.minScore}
                                onChange={(e) =>
                                  setFilters((prev) => ({
                                    ...prev,
                                    minScore: Number(e.target.value),
                                  }))
                                }
                                className="mt-4 w-full"
                              />
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                              <SecondaryButton
                                className="w-full"
                                onClick={() => setFilters({ firmTypes: [], stages: [], minScore: 0 })}
                              >
                                Clear
                              </SecondaryButton>
                              <RainbowCTA className="w-full" onClick={() => toast.success("Filters applied")}>
                                Apply
                              </RainbowCTA>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </CardContent>
        </GlassSurface>

        {/* Enhanced Matching Results Dashboard */}
        {enhancedMatches && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <GlassSurface>
              <UnderGlow className="opacity-22" />
              <CardHeader className="relative pb-3">
                <CardTitle className="text-sm font-medium text-slate-700">Startup Quality</CardTitle>
              </CardHeader>
              <CardContent className="relative">
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-3xl font-bold", ScoreTone(enhancedMatches.startup_quality_score))}>
                    {enhancedMatches.startup_quality_score}
                  </span>
                  <span className="text-sm text-slate-500">/100</span>
                </div>
                <Progress value={enhancedMatches.startup_quality_score} className="mt-3 h-2" />
              </CardContent>
            </GlassSurface>

            <GlassSurface>
              <UnderGlow className="opacity-20 bg-gradient-to-r from-emerald-400 via-yellow-300 to-blue-400" />
              <CardHeader className="relative pb-3">
                <CardTitle className="text-sm font-medium text-slate-700">Data Completeness</CardTitle>
              </CardHeader>
              <CardContent className="relative">
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-3xl font-bold", ScoreTone(enhancedMatches.data_completeness?.score ?? 0))}>
                    {enhancedMatches.data_completeness?.score ?? 0}
                  </span>
                  <span className="text-sm text-slate-500">%</span>
                </div>
                <Progress value={enhancedMatches.data_completeness?.score ?? 0} className="mt-3 h-2" />
                {enhancedMatches.data_completeness?.missing?.length > 0 && (
                  <div className="mt-3">
                    <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800">
                      {enhancedMatches.data_completeness.missing.length} fields missing
                    </Badge>
                  </div>
                )}
              </CardContent>
            </GlassSurface>

            <GlassSurface>
              <UnderGlow className="opacity-22 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400" />
              <CardHeader className="relative pb-3">
                <CardTitle className="text-sm font-medium text-slate-700">Matches Found</CardTitle>
              </CardHeader>
              <CardContent className="relative">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-slate-900">{enhancedMatches.matches_found}</span>
                  <span className="text-sm text-slate-500">investors</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Analyzed {enhancedMatches.total_investors_analyzed} total
                </p>
              </CardContent>
            </GlassSurface>
          </div>
        )}

        {enhancedMatches?.data_completeness?.missing?.length > 0 && (
          <GlassSurface className="border-2 border-amber-200/60">
            <UnderGlow className="opacity-20 bg-gradient-to-r from-amber-300 via-orange-300 to-pink-300" />
            <CardContent className="relative py-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />
                <div>
                  <p className="font-medium text-slate-900">Improve match quality by adding:</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {enhancedMatches.data_completeness.missing.slice(0, 6).join(", ")}
                    {enhancedMatches.data_completeness.missing.length > 6
                      ? ` and ${enhancedMatches.data_completeness.missing.length - 6} more`
                      : ""}
                  </p>
                </div>
              </div>
            </CardContent>
          </GlassSurface>
        )}

        {/* Enhanced Results */}
        {enhancedMatches?.matches?.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  Top <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">Matches</span>
                </h2>
                <p className="text-sm text-slate-600">
                  {enhancedMatches.matches.length} investors, ranked by fit score and predicted interest.
                </p>
              </div>
              <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800">
                Enhanced
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {enhancedMatches.matches.map((match, idx) => (
                <EnhancedMatchCard
                  key={idx}
                  match={match}
                  onInitiateOutreach={handleInitiateOutreach}
                  onSaveMatch={handleSaveMatch}
                  onFeedbackSubmit={(feedback) => handleMatchFeedback(match, feedback)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Legacy Results / Empty State */}
        {!enhancedMatches && filteredMatches.length === 0 ? (
          <GlassSurface>
            <UnderGlow className="opacity-25" />
            <CardContent className="relative p-10 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[linear-gradient(90deg,#7c3aed,#ec4899,#fb923c,#facc15,#22c55e,#3b82f6)] text-white shadow-lg">
                <Target className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900">No matches yet</h3>
              <p className="mx-auto mt-2 max-w-md text-slate-600">
                {firms.length === 0
                  ? "Import investor data first to start finding matches for your startup."
                  : "Click Find Investors to generate recommendations aligned with your startup."}
              </p>

              {firms.length > 0 && (
                <div className="mt-6 flex justify-center">
                  <RainbowCTA onClick={generateMatches} disabled={isGenerating}>
                    {isGenerating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    Find Investors
                  </RainbowCTA>
                </div>
              )}
            </CardContent>
          </GlassSurface>
        ) : !enhancedMatches ? (
          <div className="space-y-10">
            {savedMatches.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-slate-900">
                    Saved <span className="text-slate-500">({savedMatches.length})</span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {savedMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      firm={firmsMap[match.firm_id]}
                      contact={contactsMap[match.contact_id]}
                      isSaved
                      onSave={() =>
                        updateMatchMutation.mutate({ id: match.id, patch: { status: "suggested" } })
                      }
                      onContact={() => {}}
                      onFeedback={(feedback) => feedbackMutation.mutate({ id: match.id, feedback })}
                    />
                  ))}
                </div>
              </div>
            )}

            {suggestedMatches.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-slate-900">
                    Recommended <span className="text-slate-500">({suggestedMatches.length})</span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {suggestedMatches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      firm={firmsMap[match.firm_id]}
                      contact={contactsMap[match.contact_id]}
                      isSaved={false}
                      onSave={() =>
                        updateMatchMutation.mutate({ id: match.id, patch: { status: "saved" } })
                      }
                      onContact={() => {}}
                      onFeedback={(feedback) => feedbackMutation.mutate({ id: match.id, feedback })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}