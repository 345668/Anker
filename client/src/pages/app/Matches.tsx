import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Loader2, Building2, Mail, Globe,
  CheckCircle2, XCircle, UploadCloud, BarChart3, Target,
  TrendingUp, Zap, Clock, Award, ArrowUpDown,
  Linkedin, ChevronDown, ChevronUp, Star, ThumbsUp, ThumbsDown,
  BookmarkPlus, FileText, Settings2, Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import AppLayout from "@/components/AppLayout";

// ─── Design tokens ──────────────────────────────────────────────────────────
const ACCENT = "#8e84f7";
const GOLD = "#c8aa82";

const TIER_STYLES: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  champion: { label: "Champion",     color: GOLD,      bg: "rgba(200,170,130,0.12)", ring: "rgba(200,170,130,0.40)" },
  A:        { label: "Strong Fit",   color: ACCENT,    bg: "rgba(142,132,247,0.12)", ring: "rgba(142,132,247,0.40)" },
  B:        { label: "Potential Fit",color: "#5dcaa5", bg: "rgba(93,202,165,0.10)",  ring: "rgba(93,202,165,0.35)"  },
  C:        { label: "Exploratory",  color: "#888780", bg: "rgba(136,135,128,0.10)", ring: "rgba(136,135,128,0.30)" },
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface MatchingAlgorithm {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  category?: string;
  isDefault?: boolean;
  features?: {
    useSemanticMatching?: boolean;
    useNicheKeywords?: boolean;
    useDocumentKeywords?: boolean;
    useFeedbackLoop?: boolean;
    useDataRoomContent?: boolean;
  };
}

interface Session {
  id: string;
  startupId: string;
  startupName?: string;
  mode?: string;
  algorithmName?: string;
  usedDataRoomContent?: boolean;
  dataRoomDocumentsUsed?: number;
  totalCandidates?: number;
  matchesReturned?: number;
  tierCounts?: { champion: number; A: number; B: number; C: number };
  durationMs?: number;
  createdAt: string;
}

interface MatchRecord {
  id: string;
  sessionId: string;
  investorId: string;
  investorName?: string;
  investorEmail?: string;
  investorLinkedin?: string;
  firmName?: string;
  firmWebsite?: string;
  score: number;
  tier: string;
  tierLabel?: string;
  factorIndustry?: number;
  factorStage?: number;
  factorGeo?: number;
  factorCheckSize?: number;
  factorInvestorType?: number;
  factorTeamSignal?: number;
  semanticScore?: number;
  nicheScore?: number;
  winProbability?: number;
  decisionSpeed?: string;
  valueAdd?: string[];
  status: string;
  pipelineStatus?: string;
  folkContactId?: string;
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function ScoreBar({ label, value, color = ACCENT }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-white/50">{label}</span>
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%`, background: color }}
        />
      </div>
      <span className="w-6 text-right text-white/60">{Math.round(value ?? 0)}</span>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const s = TIER_STYLES[tier] ?? TIER_STYLES.C;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.ring}` }}
    >
      {tier === "champion" && <Award className="w-3 h-3" />}
      {tier === "A" && <Star className="w-3 h-3" />}
      {s.label}
    </span>
  );
}

const PIPELINE_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "#888780", bg: "rgba(136,135,128,0.10)" },
  accepted: { label: "Accepted", color: "#5dcaa5", bg: "rgba(93,202,165,0.12)" },
  rejected: { label: "Rejected", color: "#e57373", bg: "rgba(229,115,115,0.12)" },
  shortlisted: { label: "Shortlisted", color: "#c8aa82", bg: "rgba(200,170,130,0.12)" },
  contacted: { label: "Contacted", color: "#8e84f7", bg: "rgba(142,132,247,0.12)" },
  meeting_scheduled: { label: "Meeting", color: "#64b5f6", bg: "rgba(100,181,246,0.12)" },
};

function MatchCard({
  match,
  onAddCRM,
  onPipelineAction,
  isPending,
}: {
  match: MatchRecord;
  onAddCRM: () => void;
  onPipelineAction: (action: string) => void;
  isPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const s = TIER_STYLES[match.tier] ?? TIER_STYLES.C;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border transition-all"
      style={{
        background: s.bg,
        borderColor: match.status === "passed" ? "rgba(255,255,255,0.06)" : s.ring,
        opacity: match.status === "passed" ? 0.45 : 1,
      }}
      data-testid={`match-card-${match.id}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <div
          className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold"
          style={{ background: s.ring, color: s.color }}
        >
          {(match.investorName ?? "?")[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white truncate text-sm">{match.investorName ?? "Unknown Investor"}</span>
            <TierBadge tier={match.tier} />
            {match.status === "in_crm" && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> In CRM
              </span>
            )}
            {match.pipelineStatus && match.pipelineStatus !== "pending" && (
              <span 
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ 
                  background: PIPELINE_STYLES[match.pipelineStatus]?.bg ?? PIPELINE_STYLES.pending.bg,
                  color: PIPELINE_STYLES[match.pipelineStatus]?.color ?? PIPELINE_STYLES.pending.color,
                }}
              >
                {PIPELINE_STYLES[match.pipelineStatus]?.label ?? match.pipelineStatus}
              </span>
            )}
          </div>
          {match.firmName && (
            <div className="flex items-center gap-1 text-xs text-white/50 mt-0.5">
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="truncate">{match.firmName}</span>
            </div>
          )}
          {(match.valueAdd?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {match.valueAdd!.map(tag => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/10">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold border-2"
            style={{ color: s.color, borderColor: s.ring }}
          >
            {match.score}
          </div>
          <div className="text-[10px] text-white/40 mt-0.5 text-center">score</div>
        </div>
      </div>

      {/* Signal row */}
      <div className="flex items-center gap-4 px-4 pb-2 text-xs text-white/45">
        {match.winProbability !== undefined && (
          <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />{match.winProbability}% win prob</span>
        )}
        {match.decisionSpeed && (
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{match.decisionSpeed} decision</span>
        )}
      </div>

      {/* Expandable breakdown */}
      <button
        className="w-full flex items-center gap-1 px-4 py-1.5 text-xs text-white/40 hover:text-white/60 transition-colors border-t border-white/5"
        onClick={() => setExpanded(v => !v)}
        data-testid={`expand-score-${match.id}`}
      >
        <BarChart3 className="w-3 h-3" /> Score breakdown
        {expanded ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-1 space-y-1.5">
              <ScoreBar label="Industry"     value={match.factorIndustry ?? 0}     color={s.color} />
              <ScoreBar label="Stage"        value={match.factorStage ?? 0}         color={s.color} />
              <ScoreBar label="Geography"    value={match.factorGeo ?? 0}           color={s.color} />
              <ScoreBar label="Check Size"   value={match.factorCheckSize ?? 0}     color={s.color} />
              <ScoreBar label="Investor Type" value={match.factorInvestorType ?? 0} color={s.color} />
              <ScoreBar label="Team Signal"  value={match.factorTeamSignal ?? 0}    color={s.color} />
              {(match.semanticScore ?? 0) > 0 && (
                <ScoreBar label="Semantic +" value={match.semanticScore ?? 0} color="#c4e3e6" />
              )}
              {(match.nicheScore ?? 0) > 0 && (
                <ScoreBar label="Niche +"    value={match.nicheScore ?? 0}   color="#c4e3e6" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      {match.pipelineStatus !== "rejected" && (
        <div className="flex items-center gap-1.5 px-4 pb-3 pt-1 border-t border-white/5">
          {match.investorLinkedin && (
            <a href={match.investorLinkedin} target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors" title="LinkedIn">
              <Linkedin className="w-3.5 h-3.5" />
            </a>
          )}
          {match.investorEmail && (
            <a href={`mailto:${match.investorEmail}`}
              className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors" title="Email">
              <Mail className="w-3.5 h-3.5" />
            </a>
          )}
          {match.firmWebsite && (
            <a href={match.firmWebsite} target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors" title="Website">
              <Globe className="w-3.5 h-3.5" />
            </a>
          )}
          <div className="flex-1" />
          {/* Pipeline action buttons */}
          {match.pipelineStatus !== "shortlisted" && match.pipelineStatus !== "accepted" && (
            <Button size="sm" variant="ghost" 
              onClick={() => onPipelineAction("shortlist")} 
              disabled={isPending}
              className="h-7 px-2 text-xs text-white/40 hover:text-amber-400 hover:bg-amber-500/10"
              title="Shortlist">
              <BookmarkPlus className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" 
            onClick={() => onPipelineAction("reject")} 
            disabled={isPending}
            className="h-7 px-2 text-xs text-white/40 hover:text-red-400 hover:bg-red-500/10"
            title="Reject">
            <ThumbsDown className="w-3.5 h-3.5" />
          </Button>
          {match.pipelineStatus !== "accepted" && (
            <Button size="sm" 
              onClick={() => onPipelineAction("accept")} 
              disabled={isPending}
              className="h-7 text-xs font-medium"
              style={{ background: "#5dcaa5", color: "#000" }}
              title="Accept">
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5 mr-1" />}
              Accept
            </Button>
          )}
          {match.status !== "in_crm" && match.pipelineStatus === "accepted" && (
            <Button size="sm" onClick={onAddCRM} disabled={isPending}
              className="h-7 text-xs font-medium"
              style={{ background: s.color, color: "#000" }}>
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5 mr-1" />}
              Add to CRM
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}

function SessionCard({ session, onClick, active }: { session: Session; onClick: () => void; active: boolean }) {
  const tc = session.tierCounts ?? { champion: 0, A: 0, B: 0, C: 0 };
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border p-3 transition-all hover:border-white/20",
        active ? "border-[#8e84f7]/50 bg-[#8e84f7]/10" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/5",
      )}
      data-testid={`session-card-${session.id}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-white/45">{new Date(session.createdAt).toLocaleDateString()}</span>
        <span className="text-[11px] text-white/30">{session.matchesReturned ?? 0} matches</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tc.champion > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(200,170,130,0.15)", color: GOLD }}>{tc.champion} Champion</span>}
        {tc.A > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(142,132,247,0.12)", color: ACCENT }}>{tc.A} A</span>}
        {tc.B > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(93,202,165,0.10)", color: "#5dcaa5" }}>{tc.B} B</span>}
        {tc.C > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(136,135,128,0.10)", color: "#888780" }}>{tc.C} C</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-white/25 flex-wrap">
        {session.algorithmName ? (
          <>
            {session.mode?.includes("accelerated") ? <Zap className="w-2.5 h-2.5" /> : 
             session.mode?.includes("semantic") ? <Sparkles className="w-2.5 h-2.5" /> :
             session.mode?.includes("data-room") ? <Database className="w-2.5 h-2.5" /> :
             <Target className="w-2.5 h-2.5" />}
            {session.algorithmName}
          </>
        ) : session.mode && (
          <>
            {session.mode === "accelerated" ? <Zap className="w-2.5 h-2.5" /> : <Target className="w-2.5 h-2.5" />}
            {session.mode}
          </>
        )}
        {session.usedDataRoomContent && (
          <span className="flex items-center gap-0.5 text-[#8e84f7]">
            <FileText className="w-2.5 h-2.5" />{session.dataRoomDocumentsUsed}
          </span>
        )}
        {session.durationMs && <span className="ml-auto">{(session.durationMs / 1000).toFixed(1)}s</span>}
      </div>
    </button>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function MatchesV2Page() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedStartupId, setSelectedStartupId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState("all");
  const [pipelineFilter, setPipelineFilter] = useState("all");
  const [selectedAlgorithmId, setSelectedAlgorithmId] = useState<string | null>(null);
  const [useDataRoomContent, setUseDataRoomContent] = useState(false);
  const [sortBy, setSortBy] = useState<"score" | "name">("score");
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);

  const { data: startups } = useQuery<any[]>({
    queryKey: ["/api/startups"],
    enabled: !!user,
  });
  
  const { data: algorithms = [] } = useQuery<MatchingAlgorithm[]>({
    queryKey: ["/api/matching-algorithms"],
    enabled: !!user,
  });
  
  const defaultAlgorithm = algorithms.find(a => a.isDefault);
  const activeAlgorithmId = selectedAlgorithmId ?? defaultAlgorithm?.id ?? null;
  const activeAlgorithm = algorithms.find(a => a.id === activeAlgorithmId);

  const activeStartupId = selectedStartupId ?? startups?.[0]?.id ?? null;

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ["/api/v2/match/sessions", activeStartupId],
    queryFn: () => fetch(`/api/v2/match/sessions/${activeStartupId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeStartupId,
  });

  const { data: sessionData, isLoading: matchesLoading } = useQuery<{ session: Session; matches: MatchRecord[] }>({
    queryKey: ["/api/v2/match/session", selectedSessionId],
    queryFn: () => fetch(`/api/v2/match/session/${selectedSessionId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedSessionId,
  });

  const matches = sessionData?.matches ?? [];
  const tierCounts = sessionData?.session?.tierCounts ?? { champion: 0, A: 0, B: 0, C: 0 };

  const filteredMatches = useMemo(() => {
    let list = tierFilter === "all" ? matches : matches.filter(m => m.tier === tierFilter);
    if (pipelineFilter !== "all") {
      list = list.filter(m => (m.pipelineStatus ?? "pending") === pipelineFilter);
    }
    return sortBy === "name"
      ? [...list].sort((a, b) => (a.investorName ?? "").localeCompare(b.investorName ?? ""))
      : [...list].sort((a, b) => b.score - a.score);
  }, [matches, tierFilter, pipelineFilter, sortBy]);

  const runMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/v2/match/run", { 
      startupId: activeStartupId, 
      algorithmId: activeAlgorithmId,
      useDataRoomContent,
    }),
    onSuccess: (data: any) => {
      toast({ 
        title: `Found ${data.matchesReturned} matches`, 
        description: `${data.tierCounts?.champion ?? 0} champion partners identified${data.algorithmUsed ? ` using ${data.algorithmUsed}` : ''}` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/v2/match/sessions", activeStartupId] });
      if (data.sessionId) setSelectedSessionId(data.sessionId);
    },
    onError: (err: any) => toast({ title: "Matching failed", description: err?.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ matchId, status }: { matchId: string; status: string }) =>
      apiRequest("PATCH", `/api/v2/match/matches/${matchId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v2/match/session", selectedSessionId] });
      setPendingMatchId(null);
    },
  });
  
  const pipelineMutation = useMutation({
    mutationFn: ({ matchId, action }: { matchId: string; action: string }) =>
      apiRequest("POST", `/api/v2/match/matches/${matchId}/pipeline-action`, { action }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v2/match/session", selectedSessionId] });
      setPendingMatchId(null);
      const actionLabels: Record<string, string> = {
        accept: "accepted",
        reject: "rejected", 
        shortlist: "shortlisted",
      };
      toast({ title: `Investor ${actionLabels[data.newStatus] ?? data.newStatus}` });
    },
    onError: (err: any) => {
      setPendingMatchId(null);
      toast({ title: "Action failed", description: err?.message, variant: "destructive" });
    },
  });

  const crmImportMutation = useMutation({
    mutationFn: ({ sessionId, tiers }: { sessionId: string; tiers?: string[] }) =>
      apiRequest("POST", `/api/v2/match/session/${sessionId}/import-crm`, { tierFilter: tiers }),
    onSuccess: (data: any) => {
      toast({ title: `Imported ${data.imported} contacts to CRM`, description: data.failed > 0 ? `${data.failed} failed` : undefined });
      queryClient.invalidateQueries({ queryKey: ["/api/v2/match/session", selectedSessionId] });
    },
    onError: (err: any) => toast({ title: "CRM import failed", description: err?.message, variant: "destructive" }),
  });

  const handleAddToCRM = (matchId: string) => {
    setPendingMatchId(matchId);
    statusMutation.mutate({ matchId, status: "in_crm" });
  };

  const handlePipelineAction = (matchId: string, action: string) => {
    setPendingMatchId(matchId);
    pipelineMutation.mutate({ matchId, action });
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#0a0a0f] text-white">
        {/* Sticky header */}
        <div className="sticky top-0 z-20 bg-[#0a0a0f]/95 backdrop-blur border-b border-white/[0.08]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: `${ACCENT}22`, border: `1px solid ${ACCENT}44` }}>
                <Target className="w-4 h-4" style={{ color: ACCENT }} />
              </div>
              <div>
                <h1 className="text-base font-semibold leading-tight">Investor Matching</h1>
                <p className="text-[11px] text-white/35">V2 · Deterministic multi-factor scoring</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(startups?.length ?? 0) > 1 && (
                <Select value={activeStartupId ?? ""} onValueChange={setSelectedStartupId}>
                  <SelectTrigger className="h-8 text-xs w-36 bg-white/5 border-white/10">
                    <SelectValue placeholder="Select startup" />
                  </SelectTrigger>
                  <SelectContent>
                    {startups!.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Select value={activeAlgorithmId ?? ""} onValueChange={setSelectedAlgorithmId}>
                <SelectTrigger className="h-8 text-xs w-44 bg-white/5 border-white/10" data-testid="algorithm-select">
                  <Settings2 className="w-3 h-3 mr-1.5 text-white/40" />
                  <SelectValue placeholder="Select algorithm" />
                </SelectTrigger>
                <SelectContent>
                  {algorithms.map((algo) => (
                    <SelectItem key={algo.id} value={algo.id}>
                      <span className="flex items-center gap-1.5">
                        {algo.name.includes("accelerated") && <Zap className="w-3 h-3" />}
                        {algo.name.includes("standard") && <Target className="w-3 h-3" />}
                        {algo.name.includes("semantic") && <Sparkles className="w-3 h-3" />}
                        {algo.name.includes("data-room") && <Database className="w-3 h-3" />}
                        {algo.displayName}
                        {algo.isDefault && <span className="text-[10px] text-white/30 ml-1">(default)</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant={useDataRoomContent ? "default" : "outline"}
                onClick={() => setUseDataRoomContent(!useDataRoomContent)}
                className={cn(
                  "h-8 text-xs",
                  useDataRoomContent 
                    ? "bg-[#8e84f7] text-white" 
                    : "border-white/10 text-white/50 hover:text-white hover:bg-white/5"
                )}
                title="Include data room documents in matching"
              >
                <FileText className="w-3.5 h-3.5 mr-1" />
                Data Room
              </Button>
              <Button
                size="sm"
                onClick={() => runMutation.mutate()}
                disabled={!activeStartupId || runMutation.isPending}
                className="h-8 text-xs font-medium"
                style={{ background: ACCENT, color: "#fff" }}
                data-testid="run-matchmaking-btn"
              >
                {runMutation.isPending
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Running…</>
                  : <><Sparkles className="w-3.5 h-3.5 mr-1.5" />Run Matching</>}
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex gap-5 min-h-[calc(100vh-73px)]">
          {/* Sessions sidebar */}
          <div className="w-52 shrink-0">
            <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium mb-3">Sessions</p>
            {sessionsLoading && (
              <div className="flex items-center gap-2 text-xs text-white/30 py-4">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
              </div>
            )}
            {!sessionsLoading && sessions.length === 0 && (
              <p className="text-xs text-white/25 text-center py-10">No sessions yet</p>
            )}
            <div className="space-y-2">
              {sessions.map(s => (
                <SessionCard key={s.id} session={s} active={selectedSessionId === s.id} onClick={() => setSelectedSessionId(s.id)} />
              ))}
            </div>
          </div>

          {/* Main area */}
          <div className="flex-1 min-w-0">
            {!selectedSessionId ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-center">
                <div className="w-16 h-16 rounded-2xl mb-4 flex items-center justify-center"
                  style={{ background: `${ACCENT}15`, border: `1px solid ${ACCENT}30` }}>
                  <Sparkles className="w-8 h-8" style={{ color: ACCENT }} />
                </div>
                <h2 className="text-xl font-semibold mb-2">Find Your Ideal Investors</h2>
                <p className="text-white/40 text-sm max-w-xs mb-6">
                  Score {">"} 10,000 investors across 6 factors in seconds — no AI calls, pure deterministic precision.
                </p>
                <Button
                  onClick={() => runMutation.mutate()}
                  disabled={!activeStartupId || runMutation.isPending}
                  style={{ background: ACCENT, color: "#fff" }}
                  data-testid="run-matchmaking-empty-btn"
                >
                  {runMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Run Matching Now
                </Button>
              </div>
            ) : (
              <>
                {/* Session toolbar */}
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    {tierCounts.champion > 0 && (
                      <span className="flex items-center gap-1 text-sm font-medium" style={{ color: GOLD }}>
                        <Award className="w-4 h-4" />{tierCounts.champion} Champion{tierCounts.champion !== 1 ? "s" : ""}
                      </span>
                    )}
                    <span className="text-sm text-white/40">{matches.length} total matches</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm"
                      className="h-7 text-xs text-white/40 hover:text-white"
                      onClick={() => setSortBy(s => s === "score" ? "name" : "score")}>
                      <ArrowUpDown className="w-3 h-3 mr-1" />Sort: {sortBy}
                    </Button>
                    <Button variant="outline" size="sm"
                      className="h-7 text-xs border-white/15 hover:bg-white/5"
                      onClick={() => crmImportMutation.mutate({
                        sessionId: selectedSessionId,
                        tiers: tierFilter === "all" ? undefined : [tierFilter],
                      })}
                      disabled={crmImportMutation.isPending}
                      data-testid="bulk-crm-import-btn">
                      {crmImportMutation.isPending
                        ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        : <UploadCloud className="w-3 h-3 mr-1" />}
                      Import to CRM
                    </Button>
                  </div>
                </div>

                {/* Filters row */}
                <div className="flex items-center gap-3 mb-5 flex-wrap">
                  {/* Tier filter */}
                  <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-lg border border-white/[0.08]">
                    {["all", "champion", "A", "B", "C"].map(t => {
                      const ts = t === "all" ? null : TIER_STYLES[t];
                      const cnt = t === "all"
                        ? matches.length
                        : (tierCounts as any)[t] ?? 0;
                      return (
                        <button
                          key={t}
                          onClick={() => setTierFilter(t)}
                          className={cn("px-3 py-1 rounded text-xs font-medium transition-all",
                            tierFilter === t ? "text-white" : "text-white/40 hover:text-white/70")}
                          style={tierFilter === t
                            ? ts ? { background: ts.bg, color: ts.color } : { background: "rgba(255,255,255,0.1)" }
                            : {}}
                          data-testid={`tier-filter-${t}`}
                        >
                          {t === "all" ? "All" : (ts?.label ?? t)}
                          {cnt > 0 && <span className="ml-1 opacity-55">({cnt})</span>}
                        </button>
                      );
                    })}
                  </div>
                  
                  {/* Pipeline status filter */}
                  <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-lg border border-white/[0.08]">
                    {["all", "pending", "shortlisted", "accepted", "rejected"].map(status => {
                      const ps = status === "all" ? null : PIPELINE_STYLES[status];
                      const cnt = status === "all"
                        ? matches.length
                        : matches.filter(m => (m.pipelineStatus ?? "pending") === status).length;
                      return (
                        <button
                          key={status}
                          onClick={() => setPipelineFilter(status)}
                          className={cn("px-2.5 py-1 rounded text-xs font-medium transition-all",
                            pipelineFilter === status ? "text-white" : "text-white/40 hover:text-white/70")}
                          style={pipelineFilter === status
                            ? ps ? { background: ps.bg, color: ps.color } : { background: "rgba(255,255,255,0.1)" }
                            : {}}
                        >
                          {ps?.label ?? "All"}
                          {cnt > 0 && <span className="ml-1 opacity-55">({cnt})</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Grid */}
                {matchesLoading ? (
                  <div className="flex items-center gap-2 py-16 justify-center text-white/40">
                    <Loader2 className="w-5 h-5 animate-spin" /> Loading matches…
                  </div>
                ) : filteredMatches.length === 0 ? (
                  <div className="text-center py-16 text-white/30 text-sm">No matches in this view.</div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredMatches.map(m => (
                      <MatchCard
                        key={m.id}
                        match={m}
                        onAddCRM={() => handleAddToCRM(m.id)}
                        onPipelineAction={(action) => handlePipelineAction(m.id, action)}
                        isPending={pendingMatchId === m.id && (statusMutation.isPending || pipelineMutation.isPending)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
