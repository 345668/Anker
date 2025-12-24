import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Sparkles,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  TrendingUp,
  Users,
  DollarSign,
  Target,
  Lightbulb,
  FileText,
  BarChart3,
  MessageSquare,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

import PitchDeckUploader from "./PitchDeckUploader";
import SlideImprovementSuggestions from "./SlideImprovementSuggestions";
import FinancialProjectionsAnalysis from "./FinancialProjectionsAnalysis";
import CompetitiveDeckComparison from "./CompetitiveDeckComparison";
import BusinessMetricsAnalysis from "./BusinessMetricsAnalysis";

const sectionConfig = {
  problem: { icon: Target, label: "Problem Statement", weight: 15 },
  solution: { icon: Lightbulb, label: "Solution", weight: 15 },
  market: { icon: BarChart3, label: "Market Size", weight: 15 },
  business_model: { icon: DollarSign, label: "Business Model", weight: 10 },
  traction: { icon: TrendingUp, label: "Traction & Metrics", weight: 20 },
  team: { icon: Users, label: "Team", weight: 15 },
  competition: { icon: Target, label: "Competition", weight: 5 },
  financials: { icon: DollarSign, label: "Financials", weight: 5 },
};

/* ----------------------------- UI primitives ----------------------------- */

function LiquidGlassCard({
  children,
  className = "",
  gradient = "from-purple-500 to-blue-500",
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

function GlassButton({
  children,
  className = "",
  ...props
}) {
  return (
    <Button
      {...props}
      className={cn(
        "rounded-full border-2 border-white/60 bg-white/55 text-slate-800 hover:bg-white/70 backdrop-blur-xl shadow-lg",
        className
      )}
      variant="outline"
    >
      {children}
    </Button>
  );
}

function scoreTone(score) {
  if (typeof score !== "number") return { text: "text-slate-700", grad: "from-slate-400 to-slate-500" };
  if (score >= 80) return { text: "text-emerald-700", grad: "from-emerald-500 to-teal-500" };
  if (score >= 60) return { text: "text-amber-700", grad: "from-amber-500 to-orange-500" };
  return { text: "text-rose-700", grad: "from-rose-500 to-red-500" };
}

function readinessConfig(readiness) {
  const map = {
    not_ready: { label: "Not Ready", icon: XCircle, grad: "from-rose-500 to-red-500" },
    needs_work: { label: "Needs Work", icon: AlertTriangle, grad: "from-amber-500 to-orange-500" },
    almost_ready: { label: "Almost Ready", icon: CheckCircle, grad: "from-blue-500 to-indigo-500" },
    investor_ready: { label: "Investor Ready", icon: CheckCircle, grad: "from-emerald-500 to-teal-500" },
  };
  return map[readiness || "needs_work"] || map.needs_work;
}

/* ------------------------------------------------------------------------ */

export default function PitchDeckAnalysis({ startup, onAnalysisComplete, onDeckUpload }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(startup?.pitch_deck_extracted?.analysis || null);
  const [deckUrl, setDeckUrl] = useState(startup?.pitch_deck_url || "");
  const [error, setError] = useState(null);

  const currentDeckUrl = deckUrl || startup?.pitch_deck_url;

  const handleDeckUpload = (url, fileName) => {
    setDeckUrl(url);
    onDeckUpload?.(url, fileName);
  };

  const analyzePitchDeck = async () => {
    const urlToAnalyze = currentDeckUrl;
    if (!urlToAnalyze) {
      setError("No pitch deck URL available. Please upload a deck first.");
      return;
    }
    setIsAnalyzing(true);
    setError(null);

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a world-class VC analyst evaluating pitch decks for institutional investors.

Analyze the provided pitch deck comprehensively. Focus on:
1. Each section's strength, clarity, data quality, and persuasiveness
2. Investor readiness (red flags, missing elements, competitive positioning)
3. Slide-by-slide recommendations with examples from successful decks
4. Personalized raise ranges and fundraising tactics based on traction, market, and team

Be brutally honest. Highlight both strengths and critical weaknesses.

PITCH DECK: ${urlToAnalyze}`,
        file_urls: [urlToAnalyze],
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            overall_score: { type: "number", description: "Overall score 0-100" },
            persuasiveness_score: { type: "number", description: "How persuasive 0-100" },
            fundability_score: { type: "number", description: "Likelihood to get funded 0-100" },
            competitive_positioning_score: { type: "number", description: "How well positioned vs competitors 0-100" },
            investor_readiness: {
              type: "string",
              enum: ["not_ready", "needs_work", "almost_ready", "investor_ready"],
            },
            summary: { type: "string" },
            investor_appeal: { type: "string" },
            top_strengths: { type: "array", items: { type: "string" } },
            top_weaknesses: { type: "array", items: { type: "string" } },
            deal_killers: { type: "array", items: { type: "string" } },
            critical_missing: { type: "array", items: { type: "string" } },
            sections: {
              type: "object",
              properties: {
                problem: {
                  type: "object",
                  properties: {
                    present: { type: "boolean" },
                    score: { type: "number" },
                    strengths: { type: "array", items: { type: "string" } },
                    improvements: { type: "array", items: { type: "string" } },
                    suggestions: { type: "array", items: { type: "string" } },
                    research_sources: { type: "array", items: { type: "string" } },
                  },
                },
                solution: {
                  type: "object",
                  properties: {
                    present: { type: "boolean" },
                    score: { type: "number" },
                    strengths: { type: "array", items: { type: "string" } },
                    improvements: { type: "array", items: { type: "string" } },
                    suggestions: { type: "array", items: { type: "string" } },
                  },
                },
                market: {
                  type: "object",
                  properties: {
                    present: { type: "boolean" },
                    score: { type: "number" },
                    strengths: { type: "array", items: { type: "string" } },
                    improvements: { type: "array", items: { type: "string" } },
                    suggestions: { type: "array", items: { type: "string" } },
                  },
                },
                business_model: {
                  type: "object",
                  properties: {
                    present: { type: "boolean" },
                    score: { type: "number" },
                    strengths: { type: "array", items: { type: "string" } },
                    improvements: { type: "array", items: { type: "string" } },
                    suggestions: { type: "array", items: { type: "string" } },
                  },
                },
                traction: {
                  type: "object",
                  properties: {
                    present: { type: "boolean" },
                    score: { type: "number" },
                    strengths: { type: "array", items: { type: "string" } },
                    improvements: { type: "array", items: { type: "string" } },
                    suggestions: { type: "array", items: { type: "string" } },
                  },
                },
                team: {
                  type: "object",
                  properties: {
                    present: { type: "boolean" },
                    score: { type: "number" },
                    strengths: { type: "array", items: { type: "string" } },
                    improvements: { type: "array", items: { type: "string" } },
                    suggestions: { type: "array", items: { type: "string" } },
                  },
                },
                competition: {
                  type: "object",
                  properties: {
                    present: { type: "boolean" },
                    score: { type: "number" },
                    strengths: { type: "array", items: { type: "string" } },
                    improvements: { type: "array", items: { type: "string" } },
                    suggestions: { type: "array", items: { type: "string" } },
                  },
                },
                financials: {
                  type: "object",
                  properties: {
                    present: { type: "boolean" },
                    score: { type: "number" },
                    strengths: { type: "array", items: { type: "string" } },
                    improvements: { type: "array", items: { type: "string" } },
                    suggestions: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
            slide_by_slide: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  slide_number: { type: "number" },
                  slide_title: { type: "string" },
                  slide_type: { type: "string" },
                  score: { type: "number", description: "Score 1-10" },
                  strengths: { type: "array", items: { type: "string" } },
                  weaknesses: { type: "array", items: { type: "string" } },
                  rewrite_suggestions: { type: "string" },
                  example_from_successful_deck: { type: "string" },
                },
              },
            },
            fundraising_recommendations: {
              type: "object",
              properties: {
                ideal_raise_range_min: { type: "number" },
                ideal_raise_range_max: { type: "number" },
                suggested_valuation: { type: "number" },
                investor_types_to_target: { type: "array", items: { type: "string" } },
                pitch_positioning: { type: "string" },
                timeline_recommendation: { type: "string" },
              },
            },
            industry_comparison: {
              type: "object",
              properties: {
                similar_successful_companies: { type: "array", items: { type: "string" } },
                typical_metrics_at_this_stage: { type: "string" },
                how_you_compare: { type: "string" },
              },
            },
          },
        },
      });

      setAnalysis(result);
      if (onAnalysisComplete) await onAnalysisComplete(result);
    } catch (e) {
      console.error("Error analyzing pitch deck:", e);
      setError(`Analysis failed: ${e?.message || "Unknown error"}. Please try again.`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const readiness = useMemo(() => readinessConfig(analysis?.investor_readiness), [analysis?.investor_readiness]);

  // If no deck: clean "upload first" hero
  if (!currentDeckUrl) {
    return (
      <div className="relative">
        {/* Canvas */}
        <div className="absolute inset-0 -z-10">
          <div className="min-h-[200px] rounded-3xl bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />
          <div className="absolute -top-10 left-10 h-56 w-56 rounded-full bg-gradient-to-br from-purple-400/25 to-pink-400/20 blur-3xl" />
          <div className="absolute -bottom-10 right-10 h-56 w-56 rounded-full bg-gradient-to-br from-orange-400/20 to-yellow-400/20 blur-3xl" />
        </div>

        <LiquidGlassCard gradient="from-purple-500 via-pink-500 to-blue-500">
          <div className="p-8 md:p-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <LiquidPill icon={Upload} gradient="from-purple-500 to-blue-500">
                  Upload pitch deck (PDF)
                </LiquidPill>
                <h2 className="mt-4 text-3xl md:text-4xl font-bold text-slate-900">
                  Get an investor-grade deck review
                </h2>
                <p className="mt-2 text-slate-600 max-w-2xl">
                  Upload your deck to unlock slide-by-slide critique, fundraising recommendations, and industry benchmarking.
                </p>
              </div>
            </div>

            <div className="mt-8">
              <PitchDeckUploader onUploadComplete={handleDeckUpload} currentUrl="" />
            </div>
          </div>
        </LiquidGlassCard>
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      {/* Canvas background */}
      <div className="absolute inset-0 -z-10">
        <div className="min-h-[320px] rounded-3xl bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />
        <div className="absolute -top-10 left-12 h-72 w-72 rounded-full bg-gradient-to-br from-purple-400/25 to-pink-400/20 blur-3xl" />
        <div className="absolute top-24 right-10 h-64 w-64 rounded-full bg-gradient-to-br from-orange-400/20 to-yellow-400/20 blur-3xl" />
        <div className="absolute -bottom-10 left-1/3 h-72 w-72 rounded-full bg-gradient-to-br from-green-400/20 to-blue-400/20 blur-3xl" />
      </div>

      {/* Header / Hero */}
      <LiquidGlassCard gradient="from-purple-500 via-pink-500 to-blue-500">
        <div className="p-8 md:p-10">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
            <div className="min-w-0">
              <LiquidPill icon={Sparkles} gradient="from-purple-500 to-pink-500">
                AI Pitch Deck Analysis
              </LiquidPill>

              <h1 className="mt-4 text-3xl md:text-4xl font-bold text-slate-900 leading-tight">
                {startup?.company_name || "Startup"}{" "}
                <span className="bg-gradient-to-r from-purple-600 via-pink-600 via-orange-500 via-yellow-500 via-green-500 to-blue-600 bg-clip-text text-transparent bg-[length:200%_100%] animate-[synergyai-gradient_6s_ease_infinite]">
                  Deck Review
                </span>
              </h1>

              <p className="mt-2 text-slate-600 max-w-2xl">
                Slide-by-slide critique, section scoring, and benchmark-driven fundraising guidance.
              </p>

              {analysis?.investor_readiness && (
                <div className="mt-5">
                  <LiquidPill icon={readiness.icon} gradient={readiness.grad}>
                    {readiness.label}
                  </LiquidPill>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
              <LiquidRainbowButton onClick={analyzePitchDeck} disabled={isAnalyzing}>
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Analyze deck
                  </>
                )}
              </LiquidRainbowButton>

              <GlassButton className="px-6" disabled={isAnalyzing} onClick={analyzePitchDeck}>
                Re-run analysis
              </GlassButton>

              {error && (
                <div className="mt-2 text-sm text-rose-700 bg-white/60 border-2 border-white/60 rounded-2xl p-3 backdrop-blur-xl shadow">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    <span className="min-w-0">{error}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {isAnalyzing && (
            <div className="mt-6 rounded-2xl border-2 border-white/60 bg-white/45 backdrop-blur-xl p-4 shadow">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Analyzing deck</p>
                <p className="text-xs text-slate-500">This can take up to ~60 seconds</p>
              </div>
              <Progress value={50} className="h-2 mt-3" />
            </div>
          )}
        </div>
      </LiquidGlassCard>

      {/* Deck uploader */}
      <LiquidGlassCard gradient="from-blue-500 to-purple-500">
        <div className="p-6 md:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-slate-800 font-bold">
                <FileText className="h-5 w-5 text-slate-500" />
                Pitch Deck
              </div>
              <p className="text-sm text-slate-600 mt-1">Upload a new version any time. We&apos;ll analyze the latest file.</p>
            </div>
          </div>
          <div className="mt-5">
            <PitchDeckUploader onUploadComplete={handleDeckUpload} currentUrl={currentDeckUrl} />
          </div>
        </div>
      </LiquidGlassCard>

      {/* If no analysis yet: callout */}
      {!analysis && (
        <LiquidGlassCard gradient="from-purple-500 to-pink-500">
          <div className="p-8 text-center">
            <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-white/60 bg-white/50 backdrop-blur-xl shadow">
              <Sparkles className="h-7 w-7 text-purple-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Run an investor-grade analysis</h3>
            <p className="text-slate-600 mt-2 max-w-2xl mx-auto">
              You&apos;ll get section scoring, slide-by-slide improvements, a personalized raise range, and industry comparisons.
            </p>
            <div className="mt-6 flex justify-center">
              <LiquidRainbowButton onClick={analyzePitchDeck} disabled={isAnalyzing}>
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Analyze now
                  </>
                )}
              </LiquidRainbowButton>
            </div>
          </div>
        </LiquidGlassCard>
      )}

      {/* Results */}
      {analysis && (
        <>
          {/* Score tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { label: "Overall", value: analysis.overall_score, icon: Sparkles },
              { label: "Persuasiveness", value: analysis.persuasiveness_score, icon: MessageSquare },
              analysis.fundability_score != null ? { label: "Fundability", value: analysis.fundability_score, icon: DollarSign } : null,
              { label: "Positioning", value: analysis.competitive_positioning_score, icon: Target },
            ]
              .filter(Boolean)
              .map((item, idx) => {
                const tone = scoreTone(item.value);
                const Icon = item.icon;
                return (
                  <LiquidGlassCard key={idx} gradient={tone.grad}>
                    <div className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </div>
                        <div className={cn("text-3xl font-bold", tone.text)}>{item.value ?? "—"}</div>
                      </div>
                      <div className="mt-4">
                        <Progress value={typeof item.value === "number" ? item.value : 0} className="h-2" />
                      </div>
                    </div>
                  </LiquidGlassCard>
                );
              })}
          </div>

          {/* Summary */}
          <LiquidGlassCard gradient="from-indigo-500 to-purple-500">
            <div className="p-8">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl border-2 border-white/60 bg-white/50 backdrop-blur-xl shadow flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">AI Summary</h3>
                  <p className="text-sm text-slate-600">High-level diagnosis and what an investor will notice first.</p>
                </div>
              </div>

              <p className="mt-5 text-slate-700 leading-relaxed">{analysis.summary}</p>

              {analysis.investor_appeal && (
                <div className="mt-6 rounded-2xl border-2 border-white/60 bg-white/45 backdrop-blur-xl p-5 shadow">
                  <p className="text-sm font-semibold text-slate-900">Investor appeal</p>
                  <p className="text-sm text-slate-700 mt-1">{analysis.investor_appeal}</p>
                </div>
              )}
            </div>
          </LiquidGlassCard>

          {/* Strengths / Improvements */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <LiquidGlassCard gradient="from-emerald-500 to-teal-500">
              <div className="p-7">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow flex items-center justify-center">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Top strengths</h3>
                    <p className="text-sm text-slate-600">What to preserve and amplify.</p>
                  </div>
                </div>
                <ul className="mt-5 space-y-2">
                  {(analysis.top_strengths || []).map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-700">
                      <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </LiquidGlassCard>

            <LiquidGlassCard gradient="from-amber-500 to-orange-500">
              <div className="p-7">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Areas to improve</h3>
                    <p className="text-sm text-slate-600">Highest-leverage fixes before outreach.</p>
                  </div>
                </div>
                <ul className="mt-5 space-y-2">
                  {(analysis.top_weaknesses || []).map((w, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-700">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </LiquidGlassCard>
          </div>

          {/* Deal killers / critical missing */}
          {(analysis.deal_killers?.length || analysis.critical_missing?.length) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {analysis.deal_killers?.length > 0 && (
                <LiquidGlassCard gradient="from-rose-500 to-red-500">
                  <div className="p-7">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-rose-500 to-red-500 text-white shadow flex items-center justify-center">
                        <XCircle className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Deal killers</h3>
                        <p className="text-sm text-slate-600">Fix these before sending to investors.</p>
                      </div>
                    </div>
                    <ul className="mt-5 space-y-2">
                      {analysis.deal_killers.map((d, i) => (
                        <li key={i} className="flex gap-2 text-sm text-slate-700">
                          <XCircle className="h-4 w-4 text-rose-600 mt-0.5 flex-shrink-0" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </LiquidGlassCard>
              )}

              {analysis.critical_missing?.length > 0 && (
                <LiquidGlassCard gradient="from-orange-500 to-amber-500">
                  <div className="p-7">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow flex items-center justify-center">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Critical missing</h3>
                        <p className="text-sm text-slate-600">Gaps investors will ask about immediately.</p>
                      </div>
                    </div>
                    <ul className="mt-5 space-y-2">
                      {analysis.critical_missing.map((m, i) => (
                        <li key={i} className="flex gap-2 text-sm text-slate-700">
                          <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                          <span>{m}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </LiquidGlassCard>
              )}
            </div>
          )}

          {/* Section analysis */}
          <LiquidGlassCard gradient="from-purple-500 to-blue-500">
            <div className="p-8">
              <h3 className="text-xl font-bold text-slate-900">Section analysis</h3>
              <p className="text-sm text-slate-600 mt-1">
                Score + presence + improvements per section, optimized for fast scanning.
              </p>

              <div className="mt-6">
                <Accordion type="multiple" className="w-full">
                  {Object.entries(sectionConfig).map(([key, cfg]) => {
                    const section = analysis.sections?.[key];
                    if (!section) return null;
                    const Icon = cfg.icon;
                    const tone = scoreTone(section.score);

                    return (
                      <AccordionItem key={key} value={key} className="border-none">
                        <div className="mb-3">
                          <div className="rounded-2xl border-2 border-white/60 bg-white/45 backdrop-blur-xl shadow overflow-hidden">
                            <AccordionTrigger className="px-5 py-4 hover:no-underline">
                              <div className="flex items-center justify-between w-full pr-3">
                                <div className="flex items-center gap-3">
                                  <div className={cn("h-10 w-10 rounded-2xl text-white shadow flex items-center justify-center", `bg-gradient-to-br ${tone.grad}`)}>
                                    <Icon className="h-5 w-5" />
                                  </div>
                                  <div className="text-left">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-slate-900">{cfg.label}</span>
                                      {!section.present && (
                                        <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800">
                                          Missing
                                        </Badge>
                                      )}
                                    </div>
                                    <span className="text-xs text-slate-500">Weight: {cfg.weight}%</span>
                                  </div>
                                </div>

                                <div className="text-right">
                                  <div className={cn("text-xl font-bold", tone.text)}>{section.score}/100</div>
                                </div>
                              </div>
                            </AccordionTrigger>

                            <AccordionContent className="px-5 pb-5">
                              <div className="grid gap-5 md:grid-cols-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900 mb-2">What&apos;s working</p>
                                  <ul className="space-y-2">
                                    {(section.strengths || []).map((s, i) => (
                                      <li key={i} className="flex gap-2 text-sm text-slate-700">
                                        <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5" />
                                        <span>{s}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                <div>
                                  <p className="text-sm font-semibold text-slate-900 mb-2">Needs improvement</p>
                                  <ul className="space-y-2">
                                    {(section.improvements || []).map((s, i) => (
                                      <li key={i} className="flex gap-2 text-sm text-slate-700">
                                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                                        <span>{s}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                <div>
                                  <p className="text-sm font-semibold text-slate-900 mb-2">Suggestions</p>
                                  <ul className="space-y-2">
                                    {(section.suggestions || []).map((s, i) => (
                                      <li key={i} className="flex gap-2 text-sm text-slate-700">
                                        <Lightbulb className="h-4 w-4 text-indigo-600 mt-0.5" />
                                        <span>{s}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>

                              {/* Optional sources */}
                              {section.research_sources?.length > 0 && (
                                <div className="mt-5 rounded-2xl border-2 border-white/60 bg-white/40 backdrop-blur-xl p-4">
                                  <p className="text-xs font-semibold text-slate-600 mb-2">Research sources (sample)</p>
                                  <div className="space-y-1">
                                    {section.research_sources.slice(0, 3).map((src, i) => (
                                      <p key={i} className="text-xs text-slate-500 truncate">{src}</p>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </AccordionContent>
                          </div>
                        </div>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            </div>
          </LiquidGlassCard>

          {/* Slide-by-slide */}
          {analysis.slide_by_slide?.length > 0 && (
            <LiquidGlassCard gradient="from-pink-500 to-purple-500">
              <div className="p-8">
                <h3 className="text-xl font-bold text-slate-900">Slide-by-slide breakdown</h3>
                <p className="text-sm text-slate-600 mt-1">Per-slide strengths, weaknesses, and rewrite suggestions.</p>

                <div className="mt-6 space-y-4">
                  {analysis.slide_by_slide.map((slide, i) => {
                    const tone = scoreTone(slide.score * 10);
                    return (
                      <div
                        key={i}
                        className="rounded-2xl border-2 border-white/60 bg-white/45 backdrop-blur-xl shadow p-5 hover:shadow-lg transition-all"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className={cn("h-12 w-12 rounded-2xl text-white shadow flex items-center justify-center font-bold", `bg-gradient-to-br ${tone.grad}`)}>
                              {slide.slide_number}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">
                                {slide.slide_title || slide.slide_type}
                              </p>
                              <Badge className="mt-1 rounded-full border-2 border-white/60 bg-white/55 text-slate-800">
                                {slide.slide_type}
                              </Badge>
                            </div>
                          </div>

                          <div className={cn("text-2xl font-bold", tone.text)}>
                            {slide.score}/10
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          {slide.strengths?.length > 0 && (
                            <div>
                              <p className="text-sm font-semibold text-slate-900 mb-2">What works</p>
                              <ul className="space-y-1">
                                {slide.strengths.map((s, j) => (
                                  <li key={j} className="text-sm text-slate-700">• {s}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {slide.weaknesses?.length > 0 && (
                            <div>
                              <p className="text-sm font-semibold text-slate-900 mb-2">Needs improvement</p>
                              <ul className="space-y-1">
                                {slide.weaknesses.map((w, j) => (
                                  <li key={j} className="text-sm text-slate-700">• {w}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {slide.rewrite_suggestions && (
                          <div className="mt-4 rounded-2xl border-2 border-white/60 bg-white/50 backdrop-blur-xl p-4">
                            <p className="text-sm font-semibold text-slate-900">Rewrite suggestion</p>
                            <p className="text-sm text-slate-700 mt-1">{slide.rewrite_suggestions}</p>
                          </div>
                        )}

                        {slide.example_from_successful_deck && (
                          <div className="mt-3 rounded-2xl border-2 border-white/60 bg-white/40 backdrop-blur-xl p-4">
                            <p className="text-sm font-semibold text-slate-900">Learn from the best</p>
                            <p className="text-sm text-slate-700 mt-1">{slide.example_from_successful_deck}</p>
                          </div>
                        )}

                        <div className="mt-4">
                          <SlideImprovementSuggestions slide={slide} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </LiquidGlassCard>
          )}

          {/* Keep your existing "deep modules" below; they will inherit your global styling */}
          <FinancialProjectionsAnalysis startup={startup} />
          <BusinessMetricsAnalysis startup={startup} />
          <CompetitiveDeckComparison yourDeckData={analysis} />

          <div className="flex justify-center pt-2">
            <GlassButton onClick={analyzePitchDeck} disabled={isAnalyzing} className="px-7">
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Re-analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Re-analyze deck
                </>
              )}
            </GlassButton>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * NOTE:
 * This file references the animation name "synergyai-gradient".
 * Ensure your global keyframes are loaded once (as in the Landing page),
 * OR add this minimal keyframe in your global CSS:
 *
 * @keyframes synergyai-gradient {
 *   0% { background-position: 0% 50%; }
 *   50% { background-position: 100% 50%; }
 *   100% { background-position: 0% 50%; }
 * }
 */