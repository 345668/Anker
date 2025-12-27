import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Target,
  Loader2,
  Sparkles,
  Search,
  Building2,
  Star,
  Mail,
  CheckCircle2,
  XCircle,
  Filter,
  ArrowRight,
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
import { Progress } from "@/components/ui/progress";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Match, InvestmentFirm, Investor, Startup } from "@shared/schema";
import { useLocation } from "wouter";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";

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
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout
      title="Investor Matches"
      subtitle="AI-powered recommendations based on your startup profile"
      heroHeight="40vh"
      videoUrl={videoBackgrounds.matches}
    >
      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {[
              { icon: Target, label: "Total Matches", value: stats.total, color: "rgb(142,132,247)" },
              { icon: Star, label: "Saved", value: stats.saved, color: "rgb(251,194,213)" },
              { icon: Mail, label: "Contacted", value: stats.contacted, color: "rgb(196,227,230)" },
              { icon: Sparkles, label: "Avg Score", value: `${stats.avgScore}%`, color: "rgb(254,212,92)" },
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
                placeholder="Search firms or investors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                data-testid="input-search-matches"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] h-12 bg-white/5 border-white/10 text-white rounded-xl" data-testid="select-status-filter">
                <Filter className="w-4 h-4 mr-2 text-white/50" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                {statusFilters.map((filter) => (
                  <SelectItem key={filter.value} value={filter.value}>
                    {filter.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              className="h-12 px-6 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
              data-testid="button-generate-matches"
            >
              <Sparkles className="w-5 h-5" />
              Generate Matches
            </button>
          </motion.div>

          {filteredMatches.length === 0 ? (
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
                <Target className="w-10 h-10 text-[rgb(142,132,247)]" />
              </div>
              <h3 className="text-2xl font-light text-white mb-2">
                No matches found
              </h3>
              <p className="text-white/50 font-light mb-8 max-w-md mx-auto">
                {startups.length === 0
                  ? "Create a startup profile to get AI-powered investor matches"
                  : "Generate matches to discover investors that align with your startup"}
              </p>
              <button
                className="h-12 px-8 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium inline-flex items-center gap-2 hover:opacity-90 transition-opacity"
                data-testid="button-generate-first-matches"
              >
                <Sparkles className="w-5 h-5" />
                Generate Matches
              </button>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMatches.map((match, index) => {
                const firm = firmsMap[match.firmId || ""];
                const investor = investorsMap[match.investorId || ""];
                const investorName = investor 
                  ? [investor.firstName, investor.lastName].filter(Boolean).join(" ")
                  : null;
                
                return (
                  <motion.div
                    key={match.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                    className="group p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/[0.08] transition-colors"
                    data-testid={`card-match-${match.id}`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: 'rgba(142, 132, 247, 0.2)' }}
                        >
                          <Building2 className="w-6 h-6 text-[rgb(142,132,247)]" />
                        </div>
                        <div>
                          <h3 className="font-medium text-white">
                            {firm?.name || "Unknown Firm"}
                          </h3>
                          {investorName && (
                            <p className="text-sm text-white/50">
                              {investorName}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge 
                        className={`text-xs border-0 ${
                          (match.matchScore || 0) >= 80 
                            ? "bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)]"
                            : (match.matchScore || 0) >= 60 
                              ? "bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)]"
                              : "bg-white/10 text-white/60"
                        }`}
                      >
                        {match.matchScore || 0}% match
                      </Badge>
                    </div>

                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-white/40 mb-2">
                        <span>Match Score</span>
                        <span>{match.matchScore || 0}%</span>
                      </div>
                      <Progress 
                        value={match.matchScore || 0} 
                        className="h-1.5 bg-white/10"
                      />
                    </div>

                    {match.matchReasons && match.matchReasons.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {match.matchReasons.slice(0, 3).map((reason, i) => (
                          <Badge 
                            key={i} 
                            variant="outline"
                            className="text-xs border-white/20 text-white/60"
                          >
                            {reason}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 pt-4 border-t border-white/10">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 h-10 rounded-xl text-[rgb(196,227,230)] hover:bg-[rgb(196,227,230)]/10"
                        onClick={() => handleSaveMatch(match)}
                        disabled={match.status === "saved"}
                        data-testid={`button-save-match-${match.id}`}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="flex-1 h-10 rounded-xl text-white/50 hover:bg-white/5"
                        onClick={() => handlePassMatch(match)}
                        disabled={match.status === "passed"}
                        data-testid={`button-pass-match-${match.id}`}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Pass
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
