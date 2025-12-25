import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Target,
  Loader2,
  Sparkles,
  SlidersHorizontal,
  Search,
  Building2,
  Star,
  Mail,
  CheckCircle2,
  XCircle,
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
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  LiquidBackground, 
  GlassSurface, 
  UnderGlow, 
  Pill, 
  RainbowButton,
  SecondaryGlassButton,
  AnimatedGrid
} from "@/components/liquid-glass";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Match, InvestmentFirm, Investor, Startup } from "@shared/schema";
import { useLocation } from "wouter";

const statusFilters = [
  { value: "all", label: "All Matches" },
  { value: "suggested", label: "Suggested" },
  { value: "saved", label: "Saved" },
  { value: "contacted", label: "Contacted" },
  { value: "passed", label: "Passed" },
];

export default function MatchesPage() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: matches = [], isLoading: matchesLoading } = useQuery<Match[]>({
    queryKey: ["/api/matches"],
  });

  const { data: firms = [], isLoading: firmsLoading } = useQuery<InvestmentFirm[]>({
    queryKey: ["/api/investment-firms"],
  });

  const { data: investors = [], isLoading: investorsLoading } = useQuery<Investor[]>({
    queryKey: ["/api/investors"],
  });

  const { data: startups = [], isLoading: startupsLoading } = useQuery<Startup[]>({
    queryKey: ["/api/startups/mine"],
  });

  const firmsMap = useMemo(
    () => firms.reduce((acc, f) => ({ ...acc, [f.id]: f }), {} as Record<string, InvestmentFirm>),
    [firms]
  );

  const investorsMap = useMemo(
    () => investors.reduce((acc, i) => ({ ...acc, [i.id]: i }), {} as Record<string, Investor>),
    [investors]
  );

  const updateMatchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Match> }) =>
      apiRequest("PATCH", `/api/matches/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
    },
  });

  const handleSaveMatch = (match: Match) => {
    updateMatchMutation.mutate({
      id: match.id,
      data: { status: "saved" },
    });
  };

  const handlePassMatch = (match: Match) => {
    updateMatchMutation.mutate({
      id: match.id,
      data: { status: "passed" },
    });
  };

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (searchQuery) {
        const firm = firmsMap[m.firmId || ""];
        const investor = investorsMap[m.investorId || ""];
        const query = searchQuery.toLowerCase();
        const investorName = investor 
          ? [investor.firstName, investor.lastName].filter(Boolean).join(" ").toLowerCase()
          : "";
        if (
          !firm?.name?.toLowerCase().includes(query) &&
          !investorName.includes(query)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [matches, statusFilter, searchQuery, firmsMap, investorsMap]);

  const stats = useMemo(() => ({
    total: matches.length,
    saved: matches.filter(m => m.status === "saved").length,
    contacted: matches.filter(m => m.status === "contacted").length,
    avgScore: matches.length > 0 
      ? Math.round(matches.reduce((acc, m) => acc + (m.matchScore || 0), 0) / matches.length) 
      : 0,
  }), [matches]);

  const pageLoading = matchesLoading || firmsLoading || investorsLoading || startupsLoading;

  if (pageLoading) {
    return (
      <div className="relative min-h-[55vh]">
        <LiquidBackground />
        <div className="flex h-[55vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading matches...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <LiquidBackground />
      <AnimatedGrid />

      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Pill className="mb-3">
              <Sparkles className="h-3 w-3" />
              AI Matching
            </Pill>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">
              Investor{" "}
              <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                Matches
              </span>
            </h1>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              AI-powered recommendations based on your startup profile
            </p>
          </div>

          <RainbowButton data-testid="button-generate-matches">
            <Sparkles className="mr-2 h-4 w-4" />
            Generate New Matches
          </RainbowButton>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="relative">
            <UnderGlow className="opacity-20" />
            <GlassSurface className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-white/60 dark:bg-slate-700/60 border-2 border-white/60 dark:border-white/20 flex items-center justify-center">
                  <Target className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.total}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Total Matches</p>
                </div>
              </div>
            </GlassSurface>
          </div>
          <div className="relative">
            <UnderGlow className="opacity-20" />
            <GlassSurface className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-white/60 dark:bg-slate-700/60 border-2 border-white/60 dark:border-white/20 flex items-center justify-center">
                  <Star className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.saved}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Saved</p>
                </div>
              </div>
            </GlassSurface>
          </div>
          <div className="relative">
            <UnderGlow className="opacity-20" />
            <GlassSurface className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-white/60 dark:bg-slate-700/60 border-2 border-white/60 dark:border-white/20 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.contacted}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Contacted</p>
                </div>
              </div>
            </GlassSurface>
          </div>
          <div className="relative">
            <UnderGlow className="opacity-20" />
            <GlassSurface className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-white/60 dark:bg-slate-700/60 border-2 border-white/60 dark:border-white/20 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.avgScore}%</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Avg Score</p>
                </div>
              </div>
            </GlassSurface>
          </div>
        </div>

        <div className="relative">
          <UnderGlow className="opacity-20" />
          <GlassSurface className="p-4">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search firms or investors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 rounded-xl bg-white/50 dark:bg-slate-800/50 border-white/40 dark:border-white/10"
                  data-testid="input-search-matches"
                />
              </div>
              <div className="flex items-center gap-3">
                <SlidersHorizontal className="h-4 w-4 text-slate-500" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40 rounded-xl bg-white/50 dark:bg-slate-800/50" data-testid="select-status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {statusFilters.map((filter) => (
                      <SelectItem key={filter.value} value={filter.value}>
                        {filter.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {filteredMatches.length === 0 ? (
              <div className="flex flex-col items-center py-12">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 mb-4">
                  <Target className="h-8 w-8 text-slate-500 dark:text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  No matches found
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm mb-4 text-center max-w-md">
                  {startups.length === 0
                    ? "Create a startup profile to get AI-powered investor matches"
                    : "Generate matches to discover investors that align with your startup"}
                </p>
                <RainbowButton>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Matches
                </RainbowButton>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMatches.map((match) => {
                  const firm = firmsMap[match.firmId || ""];
                  const investor = investorsMap[match.investorId || ""];
                  const investorName = investor 
                    ? [investor.firstName, investor.lastName].filter(Boolean).join(" ")
                    : null;
                  
                  return (
                    <GlassSurface 
                      key={match.id} 
                      className="overflow-visible"
                      data-testid={`card-match-${match.id}`}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/50 dark:to-pink-900/50 flex items-center justify-center">
                              <Building2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                              <CardTitle className="text-base text-slate-900 dark:text-slate-100">
                                {firm?.name || "Unknown Firm"}
                              </CardTitle>
                              {investorName && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {investorName}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge 
                              className={`text-xs ${
                                (match.matchScore || 0) >= 80 
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                                  : (match.matchScore || 0) >= 60 
                                    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300"
                                    : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                              }`}
                            >
                              {match.matchScore || 0}% match
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          <div>
                            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                              <span>Match Score</span>
                              <span>{match.matchScore || 0}%</span>
                            </div>
                            <Progress value={match.matchScore || 0} className="h-1.5" />
                          </div>

                          {match.matchReasons && match.matchReasons.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {match.matchReasons.slice(0, 3).map((reason, i) => (
                                <Badge 
                                  key={i} 
                                  className="text-xs rounded-full border-white/60 dark:border-white/20 bg-white/70 dark:bg-slate-700/70 text-slate-700 dark:text-slate-300"
                                >
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="flex-1 rounded-xl text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                              onClick={() => handleSaveMatch(match)}
                              disabled={match.status === "saved"}
                              data-testid={`button-save-match-${match.id}`}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="flex-1 rounded-xl text-slate-600 dark:text-slate-400"
                              onClick={() => handlePassMatch(match)}
                              disabled={match.status === "passed"}
                              data-testid={`button-pass-match-${match.id}`}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Pass
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </GlassSurface>
                  );
                })}
              </div>
            )}
          </GlassSurface>
        </div>
      </div>
    </div>
  );
}
