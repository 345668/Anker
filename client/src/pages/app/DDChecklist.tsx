import { useState, useEffect, useCallback, useRef } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Download, RefreshCw, CheckCircle2, AlertTriangle, Circle } from "lucide-react";

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

// ── Hook ───────────────────────────────────────────────────────────────────

function useChecklistSession(type: string) {
  const [data, setData] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/checklists/${type}`)
      .then((r) => r.json())
      .then((session) => {
        setData(session?.data || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [type]);

  const save = useCallback((newData: Record<string, boolean>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setSaving(true);
      await fetch(`/api/checklists/${type}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: newData }),
      }).catch(() => null);
      setSaving(false);
    }, 800);
  }, [type]);

  const toggle = useCallback((itemId: string) => {
    setData((prev) => {
      const next = { ...prev, [itemId]: !prev[itemId] };
      save(next);
      return next;
    });
  }, [save]);

  const reset = useCallback(() => {
    setData({});
    save({});
  }, [save]);

  return { data, loading, saving, toggle, reset };
}

// ── Readiness Score ────────────────────────────────────────────────────────

function ReadinessResult({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = maxScore ? Math.round((score / maxScore) * 100) : 0;
  const label = pct >= 80 ? "DD Ready" : pct >= 55 ? "Mostly Ready" : pct >= 35 ? "Needs Work" : "Not Ready";
  const color = pct >= 80 ? "text-green-600" : pct >= 55 ? "text-yellow-600" : "text-red-600";
  const variant = pct >= 80 ? "default" : pct >= 55 ? "secondary" : "destructive";
  return (
    <div className="flex items-center gap-3">
      <div className="text-3xl font-bold tabular-nums">{pct}%</div>
      <div>
        <Badge variant={variant} className="mb-1">{label}</Badge>
        <p className="text-xs text-muted-foreground">
          {score} of {maxScore} weighted points
        </p>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function DDChecklist() {
  const { toast } = useToast();
  const diagSession = useChecklistSession("dd-readiness");
  const fullSession = useChecklistSession("dd-checklist");

  // Compute readiness score
  const diagScore = DIAGNOSTIC_QUESTIONS.reduce((acc, q) => {
    return acc + (diagSession.data[q.id] ? q.weight : 0);
  }, 0);
  const diagMax = DIAGNOSTIC_QUESTIONS.reduce((acc, q) => acc + q.weight, 0);

  // Full checklist stats
  const allDDItems = DD_SECTIONS.flatMap((s) => s.items);
  const ddChecked = allDDItems.filter((i) => fullSession.data[i.id]).length;
  const ddHighItems = allDDItems.filter((i) => i.priority === "high");
  const ddHighChecked = ddHighItems.filter((i) => fullSession.data[i.id]).length;

  const handleExportFull = () => {
    const lines: string[] = ["Anker — Early Stage DD Checklist", ""];
    for (const section of DD_SECTIONS) {
      lines.push(`## ${section.icon} ${section.title}`);
      for (const item of section.items) {
        lines.push(`  [${fullSession.data[item.id] ? "x" : " "}] ${item.label} (${item.priority || "medium"})`);
      }
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dd-checklist.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">Due Diligence Toolkit</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Assess DD readiness and track document collection for early-stage investments.
            </p>
          </div>
        </div>

        <Tabs defaultValue="readiness">
          <TabsList>
            <TabsTrigger value="readiness" data-testid="tab-readiness">DD Readiness Check</TabsTrigger>
            <TabsTrigger value="checklist" data-testid="tab-checklist">Full DD Checklist</TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Readiness ── */}
          <TabsContent value="readiness" className="space-y-4 mt-4">
            {/* Score card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Readiness Score</CardTitle>
              </CardHeader>
              <CardContent>
                <ReadinessResult score={diagScore} maxScore={diagMax} />
                <Progress
                  value={diagMax ? (diagScore / diagMax) * 100 : 0}
                  className="h-2 mt-3"
                />
                {diagSession.saving && (
                  <p className="text-xs text-muted-foreground mt-1">Saving…</p>
                )}
              </CardContent>
            </Card>

            {/* Questions by category */}
            {diagSession.loading ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">Loading…</CardContent>
              </Card>
            ) : (
              CATEGORIES.map((cat) => {
                const qs = DIAGNOSTIC_QUESTIONS.filter((q) => q.category === cat);
                const catScore = qs.reduce((a, q) => a + (diagSession.data[q.id] ? q.weight : 0), 0);
                const catMax = qs.reduce((a, q) => a + q.weight, 0);
                const catPct = catMax ? Math.round((catScore / catMax) * 100) : 0;
                return (
                  <Card key={cat}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">{cat}</CardTitle>
                        <Badge variant={catPct === 100 ? "default" : catPct >= 60 ? "secondary" : "outline"} className="text-xs">
                          {catPct}%
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      {qs.map((q, idx) => (
                        <div key={q.id}>
                          {idx > 0 && <Separator className="mb-3" />}
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={q.id}
                              checked={!!diagSession.data[q.id]}
                              onCheckedChange={() => diagSession.toggle(q.id)}
                              className="mt-0.5"
                              data-testid={`checkbox-${q.id}`}
                            />
                            <div className="flex-1">
                              <label
                                htmlFor={q.id}
                                className={`text-sm cursor-pointer leading-snug ${diagSession.data[q.id] ? "line-through text-muted-foreground" : ""}`}
                              >
                                {diagSession.data[q.id] ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 inline mr-1 text-green-600" />
                                ) : (
                                  <Circle className="h-3.5 w-3.5 inline mr-1 text-muted-foreground" />
                                )}
                                {q.question}
                              </label>
                            </div>
                            <Badge
                              variant="outline"
                              className={`text-xs flex-shrink-0 ${q.weight === 3 ? "border-red-300 text-red-600" : q.weight === 2 ? "border-yellow-300 text-yellow-700" : ""}`}
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
            {/* Header row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant={ddChecked === allDDItems.length ? "default" : "outline"}>
                  {ddChecked} / {allDDItems.length} items
                </Badge>
                <Badge variant={ddHighChecked === ddHighItems.length ? "default" : "destructive"} className="text-xs">
                  {ddHighChecked}/{ddHighItems.length} high-priority
                </Badge>
                {fullSession.saving && <span className="text-xs text-muted-foreground">Saving…</span>}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExportFull} data-testid="button-export-dd">
                  <Download className="h-4 w-4 mr-1" /> Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    fullSession.reset();
                    toast({ title: "Checklist reset" });
                  }}
                  data-testid="button-reset-dd"
                >
                  <RefreshCw className="h-4 w-4 mr-1" /> Reset
                </Button>
              </div>
            </div>

            <Progress
              value={allDDItems.length ? (ddChecked / allDDItems.length) * 100 : 0}
              className="h-2"
            />

            {fullSession.loading ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">Loading checklist…</CardContent>
              </Card>
            ) : (
              DD_SECTIONS.map((section) => {
                const sectionChecked = section.items.filter((i) => fullSession.data[i.id]).length;
                return (
                  <Card key={section.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <span>{section.icon}</span>
                          {section.title}
                        </CardTitle>
                        <Badge variant={sectionChecked === section.items.length ? "default" : "outline"} className="text-xs">
                          {sectionChecked}/{section.items.length}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      {section.items.map((item, idx) => (
                        <div key={item.id}>
                          {idx > 0 && <Separator className="mb-3" />}
                          <div className="flex items-center gap-3">
                            <Checkbox
                              id={item.id}
                              checked={!!fullSession.data[item.id]}
                              onCheckedChange={() => fullSession.toggle(item.id)}
                              data-testid={`checkbox-${item.id}`}
                            />
                            <label
                              htmlFor={item.id}
                              className={`flex-1 text-sm cursor-pointer ${fullSession.data[item.id] ? "line-through text-muted-foreground" : ""}`}
                            >
                              {fullSession.data[item.id] ? (
                                <CheckCircle2 className="h-3.5 w-3.5 inline mr-1 text-green-600" />
                              ) : item.priority === "high" ? (
                                <AlertTriangle className="h-3.5 w-3.5 inline mr-1 text-red-500" />
                              ) : (
                                <Circle className="h-3.5 w-3.5 inline mr-1 text-muted-foreground" />
                              )}
                              {item.label}
                            </label>
                            {item.priority && (
                              <Badge
                                variant="outline"
                                className={`text-xs flex-shrink-0 ${
                                  item.priority === "high"
                                    ? "border-red-300 text-red-600"
                                    : item.priority === "medium"
                                    ? "border-yellow-300 text-yellow-700"
                                    : "border-slate-200 text-slate-500"
                                }`}
                              >
                                {item.priority}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
