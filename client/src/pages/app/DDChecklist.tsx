import { useState, useEffect, useCallback, useRef } from "react";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Printer, RefreshCw, CheckCircle2, AlertTriangle, Circle, Building2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

// ── Startup type ────────────────────────────────────────────────────────────

interface Startup {
  id: string;
  name: string;
}

// ── DD Readiness Diagnostic (17 questions, 5 categories) ──────────────────

interface DiagnosticQ {
  id: string;
  category: string;
  question: string;
  weight: number; // 1-3
}

const DIAGNOSTIC_QUESTIONS: DiagnosticQ[] = [
  // Legal
  { id: "d-legal-1", category: "Legal", question: "Has the company completed a Delaware C-Corp or equivalent incorporation?", weight: 2 },
  { id: "d-legal-2", category: "Legal", question: "Are all co-founder agreements, IP assignments, and vesting schedules signed?", weight: 3 },
  { id: "d-legal-3", category: "Legal", question: "Is the cap table clean with no unresolved convertible instruments or option grants?", weight: 3 },
  { id: "d-legal-4", category: "Legal", question: "Are there any pending lawsuits, claims, or regulatory issues?", weight: 2 },
  // Financial
  { id: "d-fin-1", category: "Financial", question: "Does the company have audited or reviewed financials for the last 2 fiscal years?", weight: 2 },
  { id: "d-fin-2", category: "Financial", question: "Is there a current financial model with 24-month projections?", weight: 3 },
  { id: "d-fin-3", category: "Financial", question: "Are unit economics (CAC, LTV, payback) calculated and documented?", weight: 2 },
  { id: "d-fin-4", category: "Financial", question: "Is the burn rate and runway clearly communicated and supported by bank statements?", weight: 2 },
  // Team
  { id: "d-team-1", category: "Team", question: "Have all key team members been background-checked?", weight: 1 },
  { id: "d-team-2", category: "Team", question: "Are there signed employment agreements or contractor agreements for all team members?", weight: 2 },
  { id: "d-team-3", category: "Team", question: "Is the equity split among founders clearly documented and vested?", weight: 3 },
  // Product
  { id: "d-prod-1", category: "Product", question: "Is there a working product or prototype available for investor demo?", weight: 2 },
  { id: "d-prod-2", category: "Product", question: "Has the company filed or applied for relevant IP (patents, trademarks)?", weight: 1 },
  { id: "d-prod-3", category: "Product", question: "Are customer contracts, LOIs, or MoUs available for review?", weight: 3 },
  // Market
  { id: "d-mkt-1", category: "Market", question: "Is there a credible TAM/SAM/SOM analysis with third-party data sources?", weight: 2 },
  { id: "d-mkt-2", category: "Market", question: "Has competitive landscape been mapped with differentiation clearly articulated?", weight: 2 },
  { id: "d-mkt-3", category: "Market", question: "Are there reference customers or pilot users available to speak with?", weight: 3 },
];

const CATEGORIES = ["Legal", "Financial", "Team", "Product", "Market"];

// ── Full 39-Item DD Checklist (9 sections) ────────────────────────────────

type DDStatus = "Not Started" | "In Progress" | "Complete" | "N/A";

interface DDItem {
  id: string;
  label: string;
  priority?: "high" | "medium" | "low";
}

interface DDSection {
  id: string;
  title: string;
  icon: string;
  items: DDItem[];
}

const DD_SECTIONS: DDSection[] = [
  {
    id: "corp-structure",
    title: "Corporate Structure & Authority",
    icon: "🏛️",
    items: [
      { id: "cs-1", label: "Certificate of Incorporation (Delaware)", priority: "high" },
      { id: "cs-2", label: "Bylaws (current version)", priority: "high" },
      { id: "cs-3", label: "Good standing certificate (all states of qualification)", priority: "medium" },
      { id: "cs-4", label: "Foreign qualification certificates (if applicable)", priority: "medium" },
      { id: "cs-5", label: "Board of Directors composition and consents", priority: "high" },
    ],
  },
  {
    id: "founder-stock",
    title: "Founder Stock & Vesting",
    icon: "👥",
    items: [
      { id: "fs-1", label: "Founder stock purchase agreements (all founders)", priority: "high" },
      { id: "fs-2", label: "Vesting schedules and cliff terms for each founder", priority: "high" },
      { id: "fs-3", label: "83(b) elections filed (and IRS acknowledgment)", priority: "high" },
      { id: "fs-4", label: "Restricted stock agreements", priority: "medium" },
    ],
  },
  {
    id: "equity-plan",
    title: "Employee Equity & Option Plan",
    icon: "📋",
    items: [
      { id: "eq-1", label: "Equity Incentive Plan (EIP) / Stock Option Plan", priority: "high" },
      { id: "eq-2", label: "Board resolutions authorizing the plan", priority: "high" },
      { id: "eq-3", label: "Option grant agreements for all current holders", priority: "high" },
      { id: "eq-4", label: "409A valuation (most recent)", priority: "high" },
      { id: "eq-5", label: "Option exercise notices (if any exercised)", priority: "medium" },
    ],
  },
  {
    id: "cap-table",
    title: "Cap Table Integrity",
    icon: "📊",
    items: [
      { id: "ct-1", label: "Fully diluted cap table (Excel / Carta export)", priority: "high" },
      { id: "ct-2", label: "All convertible instruments listed (SAFEs, notes, warrants)", priority: "high" },
      { id: "ct-3", label: "Pre-money / post-money calculations verified", priority: "high" },
      { id: "ct-4", label: "Side letters (if any) disclosed", priority: "medium" },
    ],
  },
  {
    id: "board-consents",
    title: "Board & Stockholder Consents",
    icon: "✅",
    items: [
      { id: "bc-1", label: "Written consents for all equity grants", priority: "high" },
      { id: "bc-2", label: "Board minutes for all major company decisions", priority: "medium" },
      { id: "bc-3", label: "Stockholder approval for any charter amendments", priority: "medium" },
      { id: "bc-4", label: "Investor rights agreements (if prior preferred rounds)", priority: "high" },
    ],
  },
  {
    id: "litigation",
    title: "Litigation & Regulatory",
    icon: "⚖️",
    items: [
      { id: "lit-1", label: "Disclosure of any pending or threatened litigation", priority: "high" },
      { id: "lit-2", label: "Regulatory correspondence or investigations", priority: "high" },
      { id: "lit-3", label: "Tax filings and any IRS or state notices", priority: "medium" },
      { id: "lit-4", label: "Insurance policies (D&O, E&O, Cyber)", priority: "medium" },
    ],
  },
  {
    id: "securities",
    title: "Securities Law Compliance",
    icon: "🔒",
    items: [
      { id: "sec-1", label: "Form D filings (for all prior equity rounds)", priority: "high" },
      { id: "sec-2", label: "State Blue Sky filings (where required)", priority: "medium" },
      { id: "sec-3", label: "Accredited investor certifications for all investors", priority: "high" },
      { id: "sec-4", label: "No general solicitation violations", priority: "high" },
    ],
  },
  {
    id: "ip",
    title: "IP Assignment & Patents",
    icon: "💡",
    items: [
      { id: "ip-1", label: "IP assignment agreements (all founders and employees)", priority: "high" },
      { id: "ip-2", label: "Contractor/consultant IP assignment agreements", priority: "high" },
      { id: "ip-3", label: "Patent filings or applications (provisional or full)", priority: "medium" },
      { id: "ip-4", label: "Trademark registrations or applications", priority: "low" },
      { id: "ip-5", label: "Open source software usage policy", priority: "low" },
    ],
  },
  {
    id: "contracts",
    title: "Contracts & Key Agreements",
    icon: "📝",
    items: [
      { id: "con-1", label: "Customer contracts (top 5 by ARR)", priority: "high" },
      { id: "con-2", label: "Revenue share or referral agreements", priority: "medium" },
      { id: "con-3", label: "Vendor and supplier agreements (material)", priority: "medium" },
      { id: "con-4", label: "Office lease or sublease agreements", priority: "low" },
      { id: "con-5", label: "Non-disclosure agreements with key partners", priority: "medium" },
    ],
  },
];

const DD_STATUSES: DDStatus[] = ["Not Started", "In Progress", "Complete", "N/A"];

// ── Checklist data shapes ──────────────────────────────────────────────────

interface DDItemData {
  status: DDStatus;
  notes: string;
  priority: boolean; // flagged
}

interface DDFullData {
  items: Record<string, DDItemData>;
}

interface DiagnosticData {
  answers: Record<string, boolean>;
}

// ── Hook ───────────────────────────────────────────────────────────────────

function useGenericSession<T extends Record<string, any>>(type: string, startupId?: string, defaultVal?: T) {
  const [data, setData] = useState<T>(defaultVal ?? ({} as T));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    const url = startupId ? `/api/checklists/${type}?startupId=${startupId}` : `/api/checklists/${type}`;
    fetch(url)
      .then((r) => r.json())
      .then((session) => {
        setData(session?.data ?? defaultVal ?? ({} as T));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [type, startupId]);

  const save = useCallback((newData: T) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setSaving(true);
      await fetch(`/api/checklists/${type}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: newData, startupId }),
      }).catch(() => null);
      setSaving(false);
    }, 800);
  }, [type, startupId]);

  const update = useCallback((newData: T) => {
    setData(newData);
    save(newData);
  }, [save]);

  const reset = useCallback(() => {
    const empty = defaultVal ?? ({} as T);
    setData(empty);
    save(empty);
  }, [save, defaultVal]);

  return { data, loading, saving, update, reset };
}

// ── Readiness Score ────────────────────────────────────────────────────────

function ReadinessResult({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = maxScore ? Math.round((score / maxScore) * 100) : 0;
  const label = pct >= 80 ? "DD Ready" : pct >= 55 ? "Mostly Ready" : pct >= 35 ? "Needs Work" : "Not Ready";
  const color = pct >= 80 ? "text-[rgb(196,227,230)]" : pct >= 55 ? "text-[rgb(254,212,92)]" : pct >= 35 ? "text-orange-400" : "text-red-400";
  const badgeClass = pct >= 80 ? "bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)] border-[rgb(196,227,230)]/30"
    : pct >= 55 ? "bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)] border-[rgb(254,212,92)]/30"
    : pct >= 35 ? "bg-orange-400/20 text-orange-300 border-orange-400/30"
    : "bg-red-400/20 text-red-300 border-red-400/30";
  return (
    <div className="flex items-center gap-4">
      <div className={`text-4xl font-bold tabular-nums ${color}`}>{pct}%</div>
      <div>
        <Badge variant="outline" className={`mb-1 ${badgeClass}`}>{label}</Badge>
        <p className="text-xs text-white/40">
          {score} of {maxScore} weighted points
        </p>
      </div>
    </div>
  );
}

// ── Gap Analysis ───────────────────────────────────────────────────────────

function GapAnalysis({ diagAnswers }: { diagAnswers: Record<string, boolean> }) {
  const gaps = DIAGNOSTIC_QUESTIONS
    .filter((q) => !diagAnswers[q.id])
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  if (gaps.length === 0) {
    return (
      <Card className="bg-[rgb(196,227,230)]/10 border-[rgb(196,227,230)]/20">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center gap-2 text-[rgb(196,227,230)]">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">All diagnostic questions answered — no critical gaps detected.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base">Top 3 Gaps to Address</CardTitle>
        <p className="text-xs text-white/40">Highest-weighted unanswered items from your diagnostic.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {gaps.map((q, i) => (
          <div key={q.id} className="flex items-start gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-400/20 text-red-300 text-xs font-bold flex-shrink-0 mt-0.5">
              {i + 1}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{q.question}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs border-white/20 text-white/50">{q.category}</Badge>
                <Badge
                  variant="outline"
                  className={`text-xs ${q.weight === 3 ? "border-red-400/40 text-red-400" : q.weight === 2 ? "border-yellow-400/40 text-yellow-400" : "border-white/20 text-white/50"}`}
                >
                  {q.weight === 3 ? "Critical" : q.weight === 2 ? "Important" : "Nice to have"}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Print Styles ───────────────────────────────────────────────────────────

const PRINT_STYLE = `
@media print {
  body * { visibility: hidden; }
  #dd-print, #dd-print * { visibility: visible; }
  #dd-print { position: absolute; left: 0; top: 0; width: 100%; }
  button, select, textarea { display: none !important; }
}
`;

// ── Main ───────────────────────────────────────────────────────────────────

export default function DDChecklist() {
  const { toast } = useToast();
  const GENERAL_SENTINEL = "__general__";
  const [selectedStartupId, setSelectedStartupId] = useState<string>(GENERAL_SENTINEL);

  const { data: startups = [] } = useQuery<Startup[]>({
    queryKey: ["/api/startups/mine"],
  });

  // Diagnostic session — not startup-specific (investor-level)
  const diagSession = useGenericSession<{ answers: Record<string, boolean> }>(
    "dd-readiness",
    undefined,
    { answers: {} }
  );

  // Map sentinel to undefined for API (no startup selected)
  const resolvedStartupId = selectedStartupId === GENERAL_SENTINEL ? undefined : selectedStartupId;

  // Full DD checklist — startup-specific
  const fullSession = useGenericSession<{ items: Record<string, DDItemData> }>(
    "dd-checklist",
    resolvedStartupId,
    { items: {} }
  );

  // Diagnostic computed values
  const diagAnswers = diagSession.data.answers || {};
  const diagScore = DIAGNOSTIC_QUESTIONS.reduce((acc, q) => acc + (diagAnswers[q.id] ? q.weight : 0), 0);
  const diagMax = DIAGNOSTIC_QUESTIONS.reduce((acc, q) => acc + q.weight, 0);

  const toggleDiag = useCallback((qId: string) => {
    const next = { ...diagAnswers, [qId]: !diagAnswers[qId] };
    diagSession.update({ answers: next });
  }, [diagAnswers, diagSession]);

  // Full checklist helpers
  const ddItems = fullSession.data.items || {};

  const updateItem = useCallback((itemId: string, patch: Partial<DDItemData>) => {
    const current: DDItemData = ddItems[itemId] ?? { status: "Not Started", notes: "", priority: false };
    const next = { ...ddItems, [itemId]: { ...current, ...patch } };
    fullSession.update({ items: next });
  }, [ddItems, fullSession]);

  const allDDItems = DD_SECTIONS.flatMap((s) => s.items);
  const completeCount = allDDItems.filter((i) => ddItems[i.id]?.status === "Complete").length;
  const highItems = allDDItems.filter((i) => i.priority === "high");
  const highComplete = highItems.filter((i) => ddItems[i.id]?.status === "Complete").length;

  const handlePrint = () => window.print();

  return (
    <AppLayout
      title="Due Diligence Toolkit"
      subtitle="Assess DD readiness and track document collection for early-stage investments"
      videoUrl={videoBackgrounds.dashboard}
    >
      <style>{PRINT_STYLE}</style>
      <div className="py-8 bg-[rgb(18,18,18)]">
      <div id="dd-print" className="max-w-5xl mx-auto px-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[rgb(142,132,247)]" />
            <Button variant="outline" size="sm" onClick={handlePrint}
              className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
              data-testid="button-print">
              <Printer className="h-4 w-4 mr-1" /> Print / Save PDF
            </Button>
          </div>
        </div>

        <Tabs defaultValue="readiness">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="readiness" data-testid="tab-readiness"
              className="data-[state=active]:bg-[rgb(142,132,247)]/30 data-[state=active]:text-white text-white/50">
              DD Readiness Check
            </TabsTrigger>
            <TabsTrigger value="checklist" data-testid="tab-checklist"
              className="data-[state=active]:bg-[rgb(142,132,247)]/30 data-[state=active]:text-white text-white/50">
              Full DD Checklist (39 items)
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Readiness ── */}
          <TabsContent value="readiness" className="space-y-4 mt-4">
            {/* Score card */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base">Readiness Score</CardTitle>
              </CardHeader>
              <CardContent>
                <ReadinessResult score={diagScore} maxScore={diagMax} />
                <Progress
                  value={diagMax ? (diagScore / diagMax) * 100 : 0}
                  className="h-2 mt-4 bg-white/10"
                />
                {diagSession.saving && (
                  <p className="text-xs text-white/40 mt-1">Saving…</p>
                )}
              </CardContent>
            </Card>

            {/* Gap Analysis */}
            <GapAnalysis diagAnswers={diagAnswers} />

            {/* Per-category header */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm">Category Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {CATEGORIES.map((cat) => {
                  const qs = DIAGNOSTIC_QUESTIONS.filter((q) => q.category === cat);
                  const catScore = qs.reduce((a, q) => a + (diagAnswers[q.id] ? q.weight : 0), 0);
                  const catMax = qs.reduce((a, q) => a + q.weight, 0);
                  const catPct = catMax ? Math.round((catScore / catMax) * 100) : 0;
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-white/80">{cat}</span>
                        <Badge variant="outline" className={`text-xs ${catPct === 100 ? "border-[rgb(196,227,230)]/40 text-[rgb(196,227,230)]" : catPct >= 60 ? "border-[rgb(254,212,92)]/40 text-[rgb(254,212,92)]" : "border-white/20 text-white/50"}`}>
                          {catPct}%
                        </Badge>
                      </div>
                      <Progress value={catPct} className="h-1.5 bg-white/10" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Questions by category */}
            {diagSession.loading ? (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="pt-6 text-center text-white/50">Loading…</CardContent>
              </Card>
            ) : (
              CATEGORIES.map((cat) => {
                const qs = DIAGNOSTIC_QUESTIONS.filter((q) => q.category === cat);
                const catScore = qs.reduce((a, q) => a + (diagAnswers[q.id] ? q.weight : 0), 0);
                const catMax = qs.reduce((a, q) => a + q.weight, 0);
                const catPct = catMax ? Math.round((catScore / catMax) * 100) : 0;
                return (
                  <Card key={cat} className="bg-white/5 border-white/10">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm font-semibold">{cat}</CardTitle>
                        <Badge variant="outline" className={`text-xs ${catPct === 100 ? "border-[rgb(196,227,230)]/40 text-[rgb(196,227,230)]" : catPct >= 60 ? "border-[rgb(254,212,92)]/40 text-[rgb(254,212,92)]" : "border-white/20 text-white/50"}`}>
                          {catPct}%
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      {qs.map((q, idx) => (
                        <div key={q.id}>
                          {idx > 0 && <Separator className="mb-3 bg-white/10" />}
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={q.id}
                              checked={!!diagAnswers[q.id]}
                              onCheckedChange={() => toggleDiag(q.id)}
                              className="mt-0.5 border-white/30 data-[state=checked]:bg-[rgb(142,132,247)] data-[state=checked]:border-[rgb(142,132,247)]"
                              data-testid={`checkbox-${q.id}`}
                            />
                            <div className="flex-1">
                              <label
                                htmlFor={q.id}
                                className={`text-sm cursor-pointer leading-snug ${diagAnswers[q.id] ? "line-through text-white/30" : "text-white/80"}`}
                              >
                                {diagAnswers[q.id] ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 inline mr-1 text-[rgb(196,227,230)]" />
                                ) : (
                                  <Circle className="h-3.5 w-3.5 inline mr-1 text-white/30" />
                                )}
                                {q.question}
                              </label>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-xs flex-shrink-0 ${q.weight === 3 ? "border-red-400/40 text-red-400" : q.weight === 2 ? "border-yellow-400/40 text-yellow-400" : "border-white/20 text-white/40"}`}
                            >
                              {q.weight === 3 ? "Critical" : q.weight === 2 ? "Important" : "Nice"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* ── Tab 2: Full DD Checklist ── */}
          <TabsContent value="checklist" className="space-y-4 mt-4">
            {/* Startup selector */}
            <Card className="bg-white/5 border-white/10">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <Building2 className="h-5 w-5 text-white/40 flex-shrink-0" />
                  <div className="flex-1">
                    <Label className="text-sm font-medium text-white">Link to Startup</Label>
                    <p className="text-xs text-white/40">DD checklist progress is saved per startup.</p>
                  </div>
                  <Select
                    value={selectedStartupId}
                    onValueChange={setSelectedStartupId}
                  >
                    <SelectTrigger className="w-56 bg-white/5 border-white/10 text-white" data-testid="select-startup">
                      <SelectValue placeholder="Select a startup…" />
                    </SelectTrigger>
                    <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                      <SelectItem value={GENERAL_SENTINEL}>No startup (general)</SelectItem>
                      {startups.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Dashboard card */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-base">Overall Progress</CardTitle>
                  <div className="flex items-center gap-2">
                    {fullSession.saving && <span className="text-xs text-white/40">Saving…</span>}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        fullSession.reset();
                        toast({ title: "Checklist reset" });
                      }}
                      className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
                      data-testid="button-reset-dd"
                    >
                      <RefreshCw className="h-4 w-4 mr-1" /> Reset
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-5 flex-wrap">
                  <div>
                    <div className="text-3xl font-bold tabular-nums text-[rgb(142,132,247)]">
                      {allDDItems.length ? Math.round((completeCount / allDDItems.length) * 100) : 0}%
                    </div>
                    <p className="text-xs text-white/40">Overall complete</p>
                  </div>
                  <Separator orientation="vertical" className="h-10 bg-white/10" />
                  <Badge variant="outline" className={`border-white/20 text-white/70 ${completeCount === allDDItems.length ? "border-[rgb(196,227,230)]/40 text-[rgb(196,227,230)]" : ""}`}>
                    {completeCount} / {allDDItems.length} items
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs ${highComplete === highItems.length ? "border-[rgb(196,227,230)]/40 text-[rgb(196,227,230)]" : "border-red-400/40 text-red-400"}`}
                  >
                    {highComplete}/{highItems.length} high-priority
                  </Badge>
                </div>
                <Progress
                  value={allDDItems.length ? (completeCount / allDDItems.length) * 100 : 0}
                  className="h-2 bg-white/10"
                />

                {/* Section-by-section completion bars */}
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-medium text-white/40 uppercase tracking-wide">Section Breakdown</p>
                  {DD_SECTIONS.map((section) => {
                    const sectionComplete = section.items.filter((i) => ddItems[i.id]?.status === "Complete").length;
                    const sectionPct = section.items.length ? Math.round((sectionComplete / section.items.length) * 100) : 0;
                    return (
                      <div key={section.id}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-white/70">{section.icon} {section.title}</span>
                          <span className="text-xs text-white/40">{sectionComplete}/{section.items.length}</span>
                        </div>
                        <Progress value={sectionPct} className="h-1 bg-white/10" />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {fullSession.loading ? (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="pt-6 text-center text-white/50">Loading checklist…</CardContent>
              </Card>
            ) : (
              DD_SECTIONS.map((section) => {
                const sectionComplete = section.items.filter((i) => ddItems[i.id]?.status === "Complete").length;
                const sectionPct = section.items.length ? Math.round((sectionComplete / section.items.length) * 100) : 0;
                return (
                  <Card key={section.id} className="bg-white/5 border-white/10">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-sm font-semibold flex items-center gap-2">
                          <span>{section.icon}</span>
                          {section.title}
                        </CardTitle>
                        <Badge variant="outline" className={`text-xs ${sectionPct === 100 ? "border-[rgb(196,227,230)]/40 text-[rgb(196,227,230)]" : "border-white/20 text-white/50"}`}>
                          {sectionComplete}/{section.items.length}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-0">
                      {section.items.map((item, idx) => {
                        const itemData: DDItemData = ddItems[item.id] ?? { status: "Not Started", notes: "", priority: false };
                        return (
                          <div key={item.id}>
                            {idx > 0 && <Separator className="mb-4 bg-white/10" />}
                            <div className="space-y-2">
                              <div className="flex items-start gap-3">
                                {/* Status indicator */}
                                <div className="mt-0.5 flex-shrink-0">
                                  {itemData.status === "Complete" ? (
                                    <CheckCircle2 className="h-4 w-4 text-[rgb(196,227,230)]" />
                                  ) : item.priority === "high" && itemData.status === "Not Started" ? (
                                    <AlertTriangle className="h-4 w-4 text-red-400" />
                                  ) : (
                                    <Circle className="h-4 w-4 text-white/30" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-sm font-medium ${itemData.status === "Complete" ? "line-through text-white/30" : "text-white/80"}`}>
                                      {item.label}
                                    </span>
                                    {item.priority && (
                                      <Badge
                                        variant="outline"
                                        className={`text-xs flex-shrink-0 ${
                                          item.priority === "high"
                                            ? "border-red-400/40 text-red-400"
                                            : item.priority === "medium"
                                            ? "border-yellow-400/40 text-yellow-400"
                                            : "border-white/20 text-white/40"
                                        }`}
                                      >
                                        {item.priority}
                                      </Badge>
                                    )}
                                    {itemData.priority && (
                                      <Badge variant="outline" className="text-xs border-orange-400/40 text-orange-400">
                                        flagged
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {/* Priority flag toggle */}
                                  <button
                                    onClick={() => updateItem(item.id, { priority: !itemData.priority })}
                                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                                      itemData.priority
                                        ? "border-orange-400/60 text-orange-400 bg-orange-400/10"
                                        : "border-white/20 text-white/40 hover:border-orange-400/40 hover:text-orange-400"
                                    }`}
                                    data-testid={`button-flag-${item.id}`}
                                    title="Flag as priority"
                                  >
                                    ⚑
                                  </button>
                                  {/* Status select */}
                                  <Select
                                    value={itemData.status}
                                    onValueChange={(v) => updateItem(item.id, { status: v as DDStatus })}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-32 bg-white/5 border-white/10 text-white" data-testid={`select-status-${item.id}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                                      {DD_STATUSES.map((s) => (
                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              {/* Notes field */}
                              <div className="ml-7">
                                <Textarea
                                  value={itemData.notes}
                                  onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                                  placeholder="Add notes…"
                                  rows={1}
                                  className="text-xs resize-none min-h-0 py-1.5 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                                  data-testid={`textarea-notes-${item.id}`}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </div>
      </div>
    </AppLayout>
  );
}
