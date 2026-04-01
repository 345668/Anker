import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Target,
  ChevronRight,
  ChevronDown,
  Building2,
  User,
  CheckCircle2,
  XCircle,
  UserPlus,
  Calendar,
  Layers,
  Search,
  TrendingUp,
  Clock,
  ArrowLeft,
  Sparkles,
  Loader2,
  BarChart3,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SessionSummary {
  id: string;
  startupId: string;
  startupName: string;
  label: string | null;
  totalMatches: number;
  source: string;
  createdAt: string;
  statusSummary: Record<string, number>;
}

interface EnrichedMatch {
  id: string;
  matchScore: number | null;
  matchReasons: string[];
  status: string;
  firmId: string | null;
  investorId: string | null;
  metadata: Record<string, any>;
  firm: {
    id: string;
    name: string;
    type: string | null;
    location: string | null;
    aum: string | null;
    sectors: string[] | null;
    stages: string[] | null;
    website: string | null;
  } | null;
  investor: {
    id: string;
    firstName: string;
    lastName: string | null;
    title: string | null;
    location: string | null;
    sectors: string[] | null;
    stages: string[] | null;
  } | null;
}

interface SessionDetail {
  session: SessionSummary;
  matches: EnrichedMatch[];
}

const SOURCE_LABELS: Record<string, string> = {
  standard: "Standard",
  enhanced: "Enhanced",
  accelerated: "Accelerated",
};

const SOURCE_COLORS: Record<string, string> = {
  standard: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  enhanced: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  accelerated: "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

const STATUS_STYLES: Record<string, string> = {
  suggested: "bg-white/10 text-white/60",
  saved: "bg-blue-500/20 text-blue-300",
  contacted: "bg-purple-500/20 text-purple-300",
  passed: "bg-red-500/20 text-red-300",
  converted: "bg-green-500/20 text-green-300",
};

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color = score >= 70 ? "text-green-400" : score >= 50 ? "text-yellow-400" : "text-white/50";
  return (
    <div className="flex flex-col items-center">
      <span className={`text-2xl font-bold ${color}`}>{score}</span>
      <span className="text-xs text-white/40">score</span>
    </div>
  );
}

function MatchRow({
  match,
  onAddToCRM,
  onPass,
  isActioning,
}: {
  match: EnrichedMatch;
  onAddToCRM: (matchId: string) => void;
  onPass: (matchId: string) => void;
  isActioning: boolean;
}) {
  const name = match.firm?.name || (match.investor ? `${match.investor.firstName} ${match.investor.lastName || ""}`.trim() : "Unknown");
  const type = match.firm?.type || match.investor?.title || null;
  const location = match.firm?.location || match.investor?.location || null;
  const sectors = match.firm?.sectors || match.investor?.sectors || [];
  const isFirm = !!match.firm;

  const isPassed = match.status === "passed";
  const isConverted = match.status === "converted";
  const isSaved = match.status === "saved" || match.status === "contacted";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isPassed ? 0.45 : 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
        isPassed
          ? "border-white/5 bg-white/2"
          : isConverted
          ? "border-green-500/20 bg-green-500/5"
          : "border-white/10 bg-white/5 hover:bg-white/8"
      }`}
      data-testid={`match-row-${match.id}`}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: "rgba(142,132,247,0.15)" }}>
        {isFirm ? (
          <Building2 className="w-5 h-5 text-[rgb(142,132,247)]" />
        ) : (
          <User className="w-5 h-5 text-[rgb(251,194,213)]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-white text-sm">{name}</span>
          {type && <span className="text-white/40 text-xs">{type}</span>}
          <Badge variant="outline" className={`text-xs ${STATUS_STYLES[match.status] || "bg-white/10 text-white/60"}`}>
            {match.status}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {location && (
            <span className="flex items-center gap-1 text-xs text-white/40">
              <MapPin className="w-3 h-3" /> {location}
            </span>
          )}
          {sectors?.slice(0, 3).map((s) => (
            <Badge key={s} variant="outline" className="text-xs border-white/10 text-white/40 px-1.5 py-0">
              {s}
            </Badge>
          ))}
        </div>
        {match.matchReasons?.length > 0 && (
          <p className="text-xs text-white/30 mt-1 truncate">
            {match.matchReasons.slice(0, 2).join(" · ")}
          </p>
        )}
      </div>

      <ScoreBadge score={match.matchScore} />

      <div className="flex items-center gap-2 shrink-0">
        {!isPassed && !isConverted && !isSaved && (
          <>
            <Button
              size="sm"
              className="bg-[rgb(142,132,247)]/20 hover:bg-[rgb(142,132,247)]/40 text-white border border-[rgb(142,132,247)]/30 h-8"
              onClick={() => onAddToCRM(match.id)}
              disabled={isActioning}
              data-testid={`button-add-crm-${match.id}`}
            >
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              Add to CRM
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white/40 hover:text-red-400 hover:bg-red-500/10 h-8"
              onClick={() => onPass(match.id)}
              disabled={isActioning}
              data-testid={`button-pass-${match.id}`}
            >
              <XCircle className="w-3.5 h-3.5 mr-1.5" />
              Pass
            </Button>
          </>
        )}
        {isSaved && (
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
            <CheckCircle2 className="w-3 h-3 mr-1" /> In CRM
          </Badge>
        )}
        {isConverted && (
          <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Converted
          </Badge>
        )}
        {isPassed && (
          <Badge className="bg-red-500/20 text-red-300 border-red-500/30">
            <XCircle className="w-3 h-3 mr-1" /> Passed
          </Badge>
        )}
      </div>
    </motion.div>
  );
}

function SessionCard({
  session,
  isSelected,
  onClick,
}: {
  session: SessionSummary;
  isSelected: boolean;
  onClick: () => void;
}) {
  const total = session.totalMatches || 0;
  const added = (session.statusSummary?.saved || 0) + (session.statusSummary?.contacted || 0) + (session.statusSummary?.converted || 0);
  const passed = session.statusSummary?.passed || 0;
  const pending = total - added - passed;

  return (
    <motion.div
      layout
      onClick={onClick}
      className={`p-4 rounded-xl border cursor-pointer transition-all ${
        isSelected
          ? "border-[rgb(142,132,247)]/50 bg-[rgb(142,132,247)]/10"
          : "border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20"
      }`}
      data-testid={`session-card-${session.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-medium text-white text-sm truncate">
              {session.label || `Session ${new Date(session.createdAt).toLocaleDateString()}`}
            </span>
            <Badge variant="outline" className={`text-xs border ${SOURCE_COLORS[session.source] || "bg-white/10 text-white/60"}`}>
              {SOURCE_LABELS[session.source] || session.source}
            </Badge>
          </div>
          <p className="text-xs text-white/50 mb-3">
            <span className="text-[rgb(142,132,247)]">{session.startupName}</span>
            {" · "}
            <Calendar className="w-3 h-3 inline-block mr-0.5" />
            {new Date(session.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>

          <div className="flex items-center gap-4 text-xs">
            <span className="text-white/60"><strong className="text-white">{total}</strong> matches</span>
            {added > 0 && <span className="text-blue-400"><strong>{added}</strong> in CRM</span>}
            {passed > 0 && <span className="text-red-400"><strong>{passed}</strong> passed</span>}
            {pending > 0 && <span className="text-white/40"><strong>{pending}</strong> pending</span>}
          </div>

          {total > 0 && (
            <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden flex gap-0.5">
              {added > 0 && (
                <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${(added / total) * 100}%` }} />
              )}
              {passed > 0 && (
                <div className="h-full rounded-full bg-red-400 transition-all" style={{ width: `${(passed / total) * 100}%` }} />
              )}
            </div>
          )}
        </div>
        <div className={`transition-transform ${isSelected ? "rotate-90" : ""}`}>
          <ChevronRight className="w-4 h-4 text-white/40" />
        </div>
      </div>
    </motion.div>
  );
}

export default function MatchingLogs() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();

  const { data: sessions = [], isLoading: loadingSessions } = useQuery<SessionSummary[]>({
    queryKey: ["/api/match-sessions"],
  });

  const { data: sessionDetail, isLoading: loadingDetail } = useQuery<SessionDetail>({
    queryKey: ["/api/match-sessions", selectedSessionId],
    enabled: !!selectedSessionId,
  });

  const addToCRMMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const res = await apiRequest("POST", `/api/contacts/from-match`, { matchId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/match-sessions", selectedSessionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Added to CRM", description: "Contact created from match" });
    },
    onError: () => {
      toast({ title: "Failed to add to CRM", variant: "destructive" });
    },
  });

  const passMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const res = await apiRequest("PATCH", `/api/matches/${matchId}`, { status: "passed" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/match-sessions", selectedSessionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/match-sessions"] });
      toast({ title: "Marked as passed" });
    },
    onError: () => {
      toast({ title: "Failed to update match", variant: "destructive" });
    },
  });

  const filteredSessions = sessions.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (s.label || "").toLowerCase().includes(q) || s.startupName.toLowerCase().includes(q);
  });

  const filteredMatches = (sessionDetail?.matches || []).filter(m => {
    if (statusFilter === "all") return true;
    return m.status === statusFilter;
  });

  const selectedSession = sessions.find(s => s.id === selectedSessionId);

  const statusCounts = (sessionDetail?.matches || []).reduce((acc, m) => {
    acc[m.status] = (acc[m.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <AppLayout
      title="Matching Logs"
      subtitle="Review past matchmaking sessions and take action on each match"
      videoUrl={videoBackgrounds.dashboard}
    >
      <div className="py-8 bg-[rgb(18,18,18)]">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="flex gap-6">
            {/* Sessions sidebar */}
            <div className="w-[380px] shrink-0 space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <Input
                    placeholder="Search sessions..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40 h-9"
                    data-testid="input-session-search"
                  />
                </div>
                <Badge variant="outline" className="border-white/20 text-white/60 shrink-0">
                  {filteredSessions.length} sessions
                </Badge>
              </div>

              {loadingSessions ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-white/40" />
                </div>
              ) : filteredSessions.length === 0 ? (
                <Card className="bg-white/5 border-white/10">
                  <CardContent className="py-12 text-center">
                    <Target className="w-10 h-10 text-white/20 mx-auto mb-3" />
                    <p className="text-white/50 text-sm">No matching sessions yet</p>
                    <p className="text-white/30 text-xs mt-1">Run matchmaking to see logs here</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
                  <AnimatePresence>
                    {filteredSessions.map(session => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        isSelected={selectedSessionId === session.id}
                        onClick={() => setSelectedSessionId(
                          selectedSessionId === session.id ? null : session.id
                        )}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Session detail panel */}
            <div className="flex-1 min-w-0">
              {!selectedSessionId ? (
                <div className="flex items-center justify-center h-full min-h-[400px] rounded-2xl border border-dashed border-white/10">
                  <div className="text-center">
                    <Layers className="w-12 h-12 text-white/20 mx-auto mb-4" />
                    <p className="text-white/50">Select a session to view matches</p>
                    <p className="text-white/30 text-sm mt-1">Each card shows all investors and firms matched in that run</p>
                  </div>
                </div>
              ) : loadingDetail ? (
                <div className="flex items-center justify-center h-full min-h-[400px]">
                  <Loader2 className="w-8 h-8 animate-spin text-white/40" />
                </div>
              ) : sessionDetail ? (
                <div className="space-y-4">
                  {/* Session header */}
                  <div className="p-5 rounded-2xl border border-white/10 bg-white/5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-medium text-white">
                          {selectedSession?.label || "Matching Session"}
                        </h2>
                        <p className="text-white/50 text-sm mt-0.5">
                          {selectedSession?.startupName} ·{" "}
                          {new Date(sessionDetail.session.createdAt).toLocaleDateString("en-US", {
                            weekday: "long", month: "long", day: "numeric", year: "numeric",
                          })}
                        </p>
                      </div>
                      <Badge variant="outline" className={`border ${SOURCE_COLORS[selectedSession?.source || "standard"]}`}>
                        <Sparkles className="w-3 h-3 mr-1" />
                        {SOURCE_LABELS[selectedSession?.source || "standard"]}
                      </Badge>
                    </div>

                    {/* Status bar */}
                    <div className="flex items-center gap-6 mt-4 flex-wrap">
                      {[
                        { label: "Total", count: sessionDetail.matches.length, color: "text-white" },
                        { label: "Pending", count: statusCounts.suggested || 0, color: "text-white/50" },
                        { label: "In CRM", count: (statusCounts.saved || 0) + (statusCounts.contacted || 0) + (statusCounts.converted || 0), color: "text-blue-400" },
                        { label: "Passed", count: statusCounts.passed || 0, color: "text-red-400" },
                      ].map(stat => (
                        <div key={stat.label} className="flex flex-col items-center gap-0.5">
                          <span className={`text-xl font-bold ${stat.color}`}>{stat.count}</span>
                          <span className="text-xs text-white/40">{stat.label}</span>
                        </div>
                      ))}

                      <div className="ml-auto">
                        {sessionDetail.matches.length > 0 && (
                          <Progress
                            value={((statusCounts.saved || 0) + (statusCounts.contacted || 0) + (statusCounts.converted || 0)) / sessionDetail.matches.length * 100}
                            className="w-32 h-1.5 bg-white/10"
                          />
                        )}
                        <p className="text-xs text-white/30 mt-1 text-right">CRM coverage</p>
                      </div>
                    </div>
                  </div>

                  {/* Filter tabs */}
                  <div className="flex items-center gap-2">
                    {[
                      { value: "all", label: "All" },
                      { value: "suggested", label: "Pending" },
                      { value: "saved", label: "In CRM" },
                      { value: "passed", label: "Passed" },
                    ].map(tab => (
                      <button
                        key={tab.value}
                        onClick={() => setStatusFilter(tab.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                          statusFilter === tab.value
                            ? "bg-[rgb(142,132,247)]/20 text-white border border-[rgb(142,132,247)]/40"
                            : "text-white/50 hover:text-white hover:bg-white/5"
                        }`}
                        data-testid={`filter-${tab.value}`}
                      >
                        {tab.label}
                        {tab.value !== "all" && (
                          <span className="ml-1.5 text-xs opacity-60">
                            {tab.value === "suggested" ? (statusCounts.suggested || 0) : 
                             tab.value === "passed" ? (statusCounts.passed || 0) :
                             (statusCounts.saved || 0) + (statusCounts.contacted || 0) + (statusCounts.converted || 0)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Match list */}
                  <div className="space-y-2 max-h-[calc(100vh-380px)] overflow-y-auto pr-1">
                    <AnimatePresence>
                      {filteredMatches.length === 0 ? (
                        <div className="py-12 text-center rounded-xl border border-dashed border-white/10">
                          <p className="text-white/40 text-sm">No matches in this category</p>
                        </div>
                      ) : (
                        filteredMatches.map(match => (
                          <MatchRow
                            key={match.id}
                            match={match}
                            onAddToCRM={(id) => addToCRMMutation.mutate(id)}
                            onPass={(id) => passMutation.mutate(id)}
                            isActioning={addToCRMMutation.isPending || passMutation.isPending}
                          />
                        ))
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
