import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  DollarSign,
  Loader2,
  Target,
  Users,
  Sparkles,
  AlertTriangle,
} from "lucide-react";

import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import PipelineStatusChart from "@/components/dashboard/PipelineStatusChart";
import ResponseRateAnalysis from "@/components/dashboard/ResponseRateAnalysis";
import DealVelocityMetrics from "@/components/dashboard/DealVelocityMetrics";
import FundraisingHealthScore from "@/components/dashboard/FundraisingHealthScore";
import { cn } from "@/lib/utils";

/**
 * FundraisingDashboard (SynergyAI Liquid Glass redesign)
 * - Soft gradients + liquid-glass surfaces + subtle depth
 * - Startup selector = glass dropdown
 * - Empty state uses the same hero pattern
 */

/* ----------------------------- helpers ----------------------------- */

function routeTo(path) {
  if (typeof window === "undefined") return;
  window.location.assign(path);
}

function DevSelfTests({ startups, selectedStartupId }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (Array.isArray(startups) && startups.length === 0 && selectedStartupId) {
      // eslint-disable-next-line no-console
      console.error(
        "[FundraisingDashboard] Self-test: selectedStartupId should be empty when there are no startups."
      );
    }
  }, [startups, selectedStartupId]);

  return null;
}

function scoreTone(score) {
  if (typeof score !== "number")
    return { text: "text-slate-700", grad: "from-slate-400 to-slate-500" };
  if (score >= 80) return { text: "text-emerald-700", grad: "from-emerald-500 to-teal-500" };
  if (score >= 60) return { text: "text-amber-700", grad: "from-amber-500 to-orange-500" };
  return { text: "text-rose-700", grad: "from-rose-500 to-red-500" };
}

function readinessPill(readiness) {
  const map = {
    investor_ready: "from-emerald-500 to-teal-500",
    almost_ready: "from-blue-500 to-indigo-500",
    needs_work: "from-amber-500 to-orange-500",
    not_ready: "from-rose-500 to-red-500",
  };
  return map[readiness] || map.needs_work;
}

/* ----------------------------- liquid glass UI primitives ----------------------------- */

function LiquidGlassCard({
  children,
  className = "",
  gradient = "from-purple-500 via-pink-500 to-blue-500",
}) {
  return (
    <div className={cn("relative group", className)}>
      <div
        className={cn(
          "absolute inset-0 rounded-3xl blur-2xl opacity-25 transition-all duration-700 group-hover:opacity-40 group-hover:blur-3xl",
          `bg-gradient-to-br ${gradient}`
        )}
      />
      <div className="relative rounded-3xl border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30 backdrop-blur-2xl shadow-lg transition-all duration-500 hover:shadow-xl overflow-hidden">
        <div className="absolute inset-px rounded-3xl bg-gradient-to-br from-white/60 via-white/40 to-white/30 pointer-events-none" />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

function LiquidPill({
  icon: Icon,
  children,
  gradient = "from-purple-500 to-pink-500",
  className = "",
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border-2 border-white/60 bg-white/50 backdrop-blur-xl px-4 py-2 shadow-lg",
        className
      )}
    >
      <span
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-full text-white shadow",
          `bg-gradient-to-br ${gradient}`
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-semibold text-slate-700">{children}</span>
    </div>
  );
}

function LiquidRainbowButton({
  children,
  className = "",
  onClick,
  disabled,
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative inline-flex items-center justify-center rounded-full px-7 py-3 overflow-hidden transition-all",
        disabled ? "opacity-70 cursor-not-allowed" : "hover:scale-[1.01]",
        className
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 via-orange-500 via-yellow-500 via-green-500 to-blue-600 bg-[length:200%_100%] animate-[synergyai-gradient_6s_ease_infinite]" />
      <div className="absolute inset-0 bg-white/10 backdrop-blur-sm" />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
      <div className="absolute inset-px rounded-full bg-gradient-to-br from-white/25 to-transparent pointer-events-none" />
      <span className="relative z-10 inline-flex items-center text-base font-semibold text-white drop-shadow">
        {children}
      </span>
    </button>
  );
}

function GlassSelectTrigger({ className = "", ...props }) {
  return (
    <SelectTrigger
      {...props}
      className={cn(
        "h-11 rounded-2xl border-2 border-white/60 bg-white/50 backdrop-blur-xl shadow-lg",
        className
      )}
    />
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  sub,
  gradient,
  valueTone = "text-slate-900",
}) {
  return (
    <LiquidGlassCard gradient={gradient}>
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
            <Icon className="h-4 w-4" />
            {label}
          </div>
          <div className={cn("text-3xl font-bold", valueTone)}>{value}</div>
        </div>
        {sub && <p className="mt-2 text-xs text-slate-500">{sub}</p>}
      </div>
    </LiquidGlassCard>
  );
}

/* ----------------------------- component ----------------------------- */

export default function FundraisingDashboard() {
  const [user, setUser] = useState(null);
  const [selectedStartupId, setSelectedStartupId] = useState("");

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
    };
    loadUser();
  }, []);

  const { data: startups = [], isLoading: startupsLoading } = useQuery({
    queryKey: ["myStartups", user?.id],
    queryFn: () => base44.entities.Startup.filter({ founder_id: user?.id }),
    enabled: !!user,
  });

  const { data: matches = [], isLoading: matchesLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: () => base44.entities.Match.list("-created_date", 1000),
    enabled: !!user,
  });

  const { data: outreaches = [], isLoading: outreachesLoading } = useQuery({
    queryKey: ["outreaches"],
    queryFn: () => base44.entities.Outreach.list("-created_date", 1000),
    enabled: !!user,
  });

  const { data: deals = [], isLoading: dealsLoading } = useQuery({
    queryKey: ["deals"],
    queryFn: () => base44.entities.InvestmentDeal.list("-created_date", 1000),
    enabled: !!user,
  });

  const { data: interactions = [], isLoading: interactionsLoading } = useQuery({
    queryKey: ["interactions"],
    queryFn: () => base44.entities.InteractionLog.list("-created_date", 1000),
    enabled: !!user,
  });

  useEffect(() => {
    if (!startups || startups.length === 0) {
      if (selectedStartupId) setSelectedStartupId("");
      return;
    }
    if (!selectedStartupId) setSelectedStartupId(String(startups[0].id));
  }, [startups, selectedStartupId]);

  const selectedStartup = useMemo(() => {
    if (!startups?.length || !selectedStartupId) return null;
    return startups.find((s) => String(s.id) === String(selectedStartupId)) || null;
  }, [startups, selectedStartupId]);

  const pageLoading =
    !user ||
    startupsLoading ||
    matchesLoading ||
    outreachesLoading ||
    dealsLoading ||
    interactionsLoading;

  if (pageLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="rounded-3xl border-2 border-white/60 bg-white/50 backdrop-blur-2xl shadow-lg px-6 py-4">
          <div className="flex items-center gap-3 text-slate-700">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-semibold">Loading fundraising analytics…</span>
          </div>
        </div>
      </div>
    );
  }

  /* ----------------------------- empty state ----------------------------- */

  if (!startups || startups.length === 0) {
    return (
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />
          <div className="absolute -top-10 left-12 h-72 w-72 rounded-full bg-gradient-to-br from-purple-400/25 to-pink-400/20 blur-3xl" />
          <div className="absolute top-24 right-10 h-64 w-64 rounded-full bg-gradient-to-br from-orange-400/20 to-yellow-400/20 blur-3xl" />
          <div className="absolute -bottom-10 left-1/3 h-72 w-72 rounded-full bg-gradient-to-br from-green-400/20 to-blue-400/20 blur-3xl" />
        </div>

        <LiquidGlassCard gradient="from-purple-500 via-pink-500 to-blue-500">
          <div className="p-8 md:p-10">
            <LiquidPill icon={BarChart3} gradient="from-purple-500 to-pink-500">
              Fundraising Dashboard
            </LiquidPill>

            <h1 className="mt-4 text-3xl md:text-4xl font-bold text-slate-900">
              Add a startup to unlock analytics
            </h1>
            <p className="mt-2 text-slate-600 max-w-2xl">
              Track match quality, response rates, pipeline health, and deal velocity per startup.
              Start by importing data or completing onboarding.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <LiquidRainbowButton onClick={() => routeTo("/import")}>
                Go to Import
              </LiquidRainbowButton>

              <button
                type="button"
                onClick={() => routeTo("/onboarding")}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border-2 border-white/60 bg-white/55 backdrop-blur-xl text-slate-800 font-semibold hover:bg-white/70 shadow-lg transition"
              >
                Go to Onboarding
              </button>
            </div>
          </div>
        </LiquidGlassCard>

        <DevSelfTests startups={startups} selectedStartupId={selectedStartupId} />
      </div>
    );
  }

  if (!selectedStartup) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  /* ----------------------------- derived metrics ----------------------------- */

  const startupMatches = matches.filter((m) => m.startup_id === selectedStartup.id);
  const startupOutreaches = outreaches.filter((o) => o.startup_id === selectedStartup.id);
  const startupDeals = deals.filter((d) => d.startup_id === selectedStartup.id);

  const totalInvestorsContacted = startupOutreaches.length;
  const totalReplies = startupOutreaches.filter((o) => o.stage === "replied" || o.stage === "call_scheduled").length;
  const responseRate = totalInvestorsContacted > 0 ? (totalReplies / totalInvestorsContacted) * 100 : 0;

  const avgMatchScore =
    startupMatches.length > 0
      ? Math.round(
          startupMatches.reduce((sum, m) => sum + (m.match_score || 0), 0) / startupMatches.length
        )
      : 0;

  const dealsInProgress = startupDeals.filter((d) => d.status === "Active").length;
  const totalDealValue = startupDeals
    .filter((d) => d.status === "Won")
    .reduce((sum, d) => sum + (d.actual_amount || 0), 0);

  const pitchDeckScore = selectedStartup.pitch_deck_extracted?.analysis?.overall_score || 0;
  const investorReadiness = selectedStartup.pitch_deck_extracted?.analysis?.investor_readiness || "needs_work";

  const pitchTone = scoreTone(pitchDeckScore);
  const matchTone = scoreTone(avgMatchScore);

  /* ----------------------------- render ----------------------------- */

  return (
    <div className="relative">
      {/* Background canvas */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />
        <div className="absolute top-0 left-1/4 w-[520px] h-[520px] bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-[420px] h-[420px] bg-gradient-to-br from-orange-400/15 to-yellow-400/15 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-[480px] h-[480px] bg-gradient-to-br from-green-400/15 to-blue-400/15 rounded-full blur-3xl" />
      </div>

      <div className="space-y-6">
        {/* Hero header */}
        <LiquidGlassCard gradient="from-purple-500 via-pink-500 to-blue-500">
          <div className="p-8 md:p-10">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
              <div className="min-w-0">
                <LiquidPill icon={Sparkles} gradient="from-purple-500 to-pink-500">
                  Fundraising Dashboard
                </LiquidPill>

                <h1 className="mt-4 text-3xl md:text-4xl font-bold text-slate-900 leading-tight">
                  {selectedStartup.company_name}{" "}
                  <span className="bg-gradient-to-r from-purple-600 via-pink-600 via-orange-500 via-yellow-500 via-green-500 to-blue-600 bg-clip-text text-transparent bg-[length:200%_100%] animate-[synergyai-gradient_6s_ease_infinite]">
                    Performance
                  </span>
                </h1>

                <p className="mt-2 text-slate-600 max-w-2xl">
                  Pipeline health, investor engagement, match quality, and deck readiness for this startup.
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800 px-4 py-2 shadow-lg">
                    Stage: {selectedStartup.stage}
                  </Badge>

                  <div
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border-2 border-white/60 bg-white/50 backdrop-blur-xl px-4 py-2 shadow-lg"
                    )}
                  >
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full bg-gradient-to-br",
                        readinessPill(investorReadiness)
                      )}
                    />
                    <span className="text-sm font-semibold text-slate-700">
                      Deck: {String(investorReadiness).replace(/_/g, " ")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Controls bar */}
              <div className="w-full lg:w-auto">
                <div className="rounded-3xl border-2 border-white/60 bg-white/50 backdrop-blur-2xl shadow-lg p-4">
                  <p className="text-xs font-semibold text-slate-600 mb-2">Startup</p>
                  <Select value={String(selectedStartupId)} onValueChange={setSelectedStartupId}>
                    <GlassSelectTrigger className="min-w-[280px]">
                      <SelectValue placeholder="Select a startup" />
                    </GlassSelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {startups.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.company_name || `Startup ${s.id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </LiquidGlassCard>

        {/* KPI tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          <MetricTile
            icon={Users}
            label="Investors contacted"
            value={totalInvestorsContacted}
            sub="Total outreaches sent"
            gradient="from-blue-500 to-indigo-500"
          />

          <MetricTile
            icon={Activity}
            label="Response rate"
            value={`${responseRate.toFixed(1)}%`}
            sub={`${totalReplies} replies / ${totalInvestorsContacted} outreaches`}
            gradient="from-emerald-500 to-teal-500"
            valueTone={responseRate >= 15 ? "text-emerald-700" : responseRate >= 8 ? "text-amber-700" : "text-rose-700"}
          />

          <MetricTile
            icon={Target}
            label="Active deals"
            value={dealsInProgress}
            sub="Currently in progress"
            gradient="from-purple-500 to-pink-500"
          />

          <MetricTile
            icon={DollarSign}
            label="Committed"
            value={`$${(totalDealValue / 1_000_000).toFixed(1)}M`}
            sub="Won deals (actual amount)"
            gradient="from-amber-500 to-orange-500"
          />
        </div>

        {/* Fundraising Health Score */}
        <FundraisingHealthScore
          startup={selectedStartup}
          matches={startupMatches}
          outreaches={startupOutreaches}
          deals={startupDeals}
        />

        {/* Pipeline + Response */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PipelineStatusChart outreaches={startupOutreaches} deals={startupDeals} />
          <ResponseRateAnalysis outreaches={startupOutreaches} interactions={interactions} />
        </div>

        {/* Deal velocity */}
        <DealVelocityMetrics outreaches={startupOutreaches} deals={startupDeals} />

        {/* Pitch Deck Performance */}
        <LiquidGlassCard gradient="from-indigo-500 to-purple-500">
          <div className="p-6 md:p-8">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <h3 className="text-xl font-bold text-slate-900">Pitch deck performance</h3>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Deck quality, readiness, and match alignment signals.
            </p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-3xl border-2 border-white/60 bg-white/45 backdrop-blur-2xl shadow-lg p-5">
                <p className="text-sm font-semibold text-slate-700">Overall score</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={cn("text-3xl font-bold", pitchTone.text)}>{pitchDeckScore}</span>
                  <span className="text-sm text-slate-500">/100</span>
                </div>
                <Progress value={pitchDeckScore} className="h-2 mt-3" />
              </div>

              <div className="rounded-3xl border-2 border-white/60 bg-white/45 backdrop-blur-2xl shadow-lg p-5">
                <p className="text-sm font-semibold text-slate-700">Investor readiness</p>
                <div className="mt-3">
                  <Badge
                    className={cn(
                      "rounded-full px-4 py-2 text-white border border-white/30 shadow",
                      `bg-gradient-to-br ${readinessPill(investorReadiness)}`
                    )}
                  >
                    {String(investorReadiness).replace(/_/g, " ")}
                  </Badge>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Based on the latest pitch deck analysis.
                </p>
              </div>

              <div className="rounded-3xl border-2 border-white/60 bg-white/45 backdrop-blur-2xl shadow-lg p-5">
                <p className="text-sm font-semibold text-slate-700">Avg match quality</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={cn("text-3xl font-bold", matchTone.text)}>{avgMatchScore}</span>
                  <span className="text-sm text-slate-500">/100</span>
                </div>
                <Progress value={avgMatchScore} className="h-2 mt-3" />
              </div>
            </div>
          </div>
        </LiquidGlassCard>

        {/* Match Quality Distribution */}
        <LiquidGlassCard gradient="from-blue-500 to-indigo-500">
          <div className="p-6 md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Match quality distribution</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Count of matches by score band (higher is better).
                </p>
              </div>
              <div className="rounded-full border-2 border-white/60 bg-white/50 backdrop-blur-xl px-4 py-2 shadow-lg text-sm font-semibold text-slate-700 inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500" />
                {startupMatches.length} matches
              </div>
            </div>

            <div className="mt-6 rounded-3xl border-2 border-white/60 bg-white/40 backdrop-blur-2xl p-4 shadow-inner">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={[
                    { range: "90-100", count: startupMatches.filter((m) => (m.match_score ?? 0) >= 90).length },
                    { range: "80-89", count: startupMatches.filter((m) => (m.match_score ?? 0) >= 80 && (m.match_score ?? 0) < 90).length },
                    { range: "70-79", count: startupMatches.filter((m) => (m.match_score ?? 0) >= 70 && (m.match_score ?? 0) < 80).length },
                    { range: "60-69", count: startupMatches.filter((m) => (m.match_score ?? 0) >= 60 && (m.match_score ?? 0) < 70).length },
                    { range: "<60", count: startupMatches.filter((m) => (m.match_score ?? 0) < 60).length },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  {/* Keep your original color if desired; otherwise inherit theme */}
                  <Bar dataKey="count" fill="#6366f1" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </LiquidGlassCard>

        <DevSelfTests startups={startups} selectedStartupId={selectedStartupId} />
      </div>
    </div>
  );
}

/**
 * Ensure these global keyframes exist once in your app:
 * @keyframes synergyai-gradient {
 *   0% { background-position: 0% 50%; }
 *   50% { background-position: 100% 50%; }
 *   100% { background-position: 0% 50%; }
 * }
 */