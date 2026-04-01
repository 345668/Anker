import { useState, useEffect, useCallback, useRef } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { CalendarCheck, Printer, RefreshCw, AlertCircle, CheckCircle2, TrendingUp } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface EOYData {
  "story-summary"?: string;
  "port-updates"?: boolean;
  "port-status"?: boolean;
  "port-valuation-policy"?: boolean;
  "port-valuation-discuss"?: boolean;
  "stats-deals"?: number | string;
  "stats-active"?: number | string;
  "stats-inactive"?: number | string;
  "stats-markups"?: number | string;
  "stats-markdowns"?: number | string;
  "stats-nav"?: number | string;
  "stats-moic"?: number | string;
  "stats-tvpi"?: number | string;
  "stats-dpi"?: number | string;
  "pacing-model"?: boolean;
  "pacing-deals-vs-plan"?: string;
  "pacing-check-size"?: string;
  "pacing-valuation"?: string;
  "pacing-on-pace"?: string;
  "pacing-2025-deals"?: number | string;
  "pacing-reserves"?: string;
  "docs-executed"?: boolean;
  "docs-admin-shared"?: boolean;
  "docs-amounts-match"?: boolean;
  "docs-invoices"?: boolean;
  "docs-mgmt-fee"?: boolean;
  [key: string]: any;
}

const SERVICE_PROVIDERS = [
  { key: "audit", label: "Audit" },
  { key: "tax", label: "Tax" },
  { key: "vcap", label: "VCAP Insurance" },
  { key: "banking", label: "Banking" },
  { key: "delaware", label: "Delaware / State Filings" },
];

const STATUS_OPTIONS = ["Not started", "In progress", "Complete", "N/A"];

const PORTFOLIO_CHECKLIST = [
  { id: "port-updates", label: "Request material updates from all portfolio companies" },
  { id: "port-status", label: "Confirm active / inactive status for all portfolio companies" },
  { id: "port-valuation-policy", label: "Review fund valuation policy" },
  { id: "port-valuation-discuss", label: "Conduct valuation discussions with all active portfolio companies" },
];

const DOCS_CHECKLIST = [
  { id: "docs-executed", label: "Executed version of each deal document collected" },
  { id: "docs-admin-shared", label: "All deal docs shared with fund administrator" },
  { id: "docs-amounts-match", label: "Investment amounts match deal documents" },
  { id: "docs-invoices", label: "Fund admin has all invoices & receipts for the year" },
  { id: "docs-mgmt-fee", label: "Management fee calculations reviewed and confirmed correct" },
];

const PACING_CHECKLIST = [
  { id: "pacing-model", label: "Update fund portfolio model with current actuals" },
];

// ── Hook ───────────────────────────────────────────────────────────────────

function useEOYSession() {
  const type = "eoy-review";
  const [data, setData] = useState<EOYData>({});
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
  }, []);

  const save = useCallback((newData: EOYData) => {
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
  }, []);

  const set = useCallback((fieldId: string, value: any) => {
    setData((prev) => {
      const next = { ...prev, [fieldId]: value };
      save(next);
      return next;
    });
  }, [save]);

  const reset = useCallback(() => {
    setData({});
    save({});
  }, [save]);

  return { data, loading, saving, set, reset };
}

// ── Computed pacing insights ───────────────────────────────────────────────

function PacingInsights({ data }: { data: EOYData }) {
  const moic = parseFloat(String(data["stats-moic"] || "0"));
  const dpi = parseFloat(String(data["stats-dpi"] || "0"));
  const tvpi = parseFloat(String(data["stats-tvpi"] || "0"));
  const onPace = data["pacing-on-pace"];
  const dealsNext = parseInt(String(data["pacing-2025-deals"] || "0"), 10);
  const markups = parseInt(String(data["stats-markups"] || "0"), 10);
  const markdowns = parseInt(String(data["stats-markdowns"] || "0"), 10);

  const insights: Array<{ type: "good" | "warn" | "info"; text: string }> = [];

  if (moic > 0) {
    if (moic >= 1.5) insights.push({ type: "good", text: `MOIC of ${moic}× — strong performance above 1.5× threshold.` });
    else if (moic >= 1.0) insights.push({ type: "info", text: `MOIC of ${moic}× — positive but below typical 1.5× target at this stage.` });
    else insights.push({ type: "warn", text: `MOIC of ${moic}× — below par. Review portfolio markdowns and losses.` });
  }

  if (dpi > 0) {
    if (dpi >= 0.5) insights.push({ type: "good", text: `DPI of ${dpi}× — meaningful distributions returned to LPs.` });
    else insights.push({ type: "info", text: `DPI of ${dpi}× — limited distributions so far; normal for early-stage funds.` });
  }

  if (tvpi > 0 && dpi > 0) {
    const unrealizedRatio = ((tvpi - dpi) / tvpi) * 100;
    insights.push({ type: "info", text: `${Math.round(unrealizedRatio)}% of TVPI is unrealized value — important for LP liquidity expectations.` });
  }

  if (onPace === "No") insights.push({ type: "warn", text: "Fund is NOT on pace with deployment plan — review reserve ratios and pipeline." });
  else if (onPace === "Partially") insights.push({ type: "warn", text: "Fund is partially on pace — consider adjusting forward deployment schedule." });
  else if (onPace === "Yes") insights.push({ type: "good", text: "Fund is on pace with deployment plan." });

  if (dealsNext > 0) insights.push({ type: "info", text: `Remaining capital supports approximately ${dealsNext} new deals in the next 12 months.` });

  if (markdowns > markups && (markups + markdowns) > 0) {
    insights.push({ type: "warn", text: `More markdowns (${markdowns}) than markups (${markups}) this year — be prepared for LP questions.` });
  } else if (markups > 0) {
    insights.push({ type: "good", text: `${markups} markup(s) this year — positive portfolio momentum for LP narrative.` });
  }

  if (insights.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Computed Pacing Insights
        </CardTitle>
        <p className="text-xs text-muted-foreground">Auto-generated from your KPI inputs above.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {insights.map((ins, i) => (
          <div key={i} className="flex items-start gap-2.5">
            {ins.type === "good" && <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />}
            {ins.type === "warn" && <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />}
            {ins.type === "info" && <div className="h-4 w-4 rounded-full bg-blue-400/30 border border-blue-400 flex-shrink-0 mt-0.5" />}
            <p className="text-sm">{ins.text}</p>
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
  #eoy-print, #eoy-print * { visibility: visible; }
  #eoy-print { position: absolute; left: 0; top: 0; width: 100%; }
  button { display: none !important; }
}
`;

// ── Main ───────────────────────────────────────────────────────────────────

export default function EOYFundHealthReview() {
  const { data, loading, saving, set, reset } = useEOYSession();
  const { toast } = useToast();

  const allCheckboxIds = [...PORTFOLIO_CHECKLIST.map(f => f.id), ...DOCS_CHECKLIST.map(f => f.id), ...PACING_CHECKLIST.map(f => f.id)];
  const checkedCount = allCheckboxIds.filter((id) => data[id]).length;
  const progress = allCheckboxIds.length ? Math.round((checkedCount / allCheckboxIds.length) * 100) : 0;

  const handleReset = () => {
    reset();
    toast({ title: "Review reset", description: "All fields cleared." });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <AppLayout>
      <style>{PRINT_STYLE}</style>
      <div id="eoy-print" className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarCheck className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">EOY Fund Health Review</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Annual year-end fund review for LP reporting and internal governance.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-export">
              <Printer className="h-4 w-4 mr-1" /> Print / Save PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset} data-testid="button-reset">
              <RefreshCw className="h-4 w-4 mr-1" /> Reset
            </Button>
          </div>
        </div>

        {/* Progress */}
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Checklist Items Completed</span>
              <div className="flex items-center gap-2">
                {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
                <Badge variant={progress === 100 ? "default" : "outline"}>
                  {checkedCount} / {allCheckboxIds.length}
                </Badge>
              </div>
            </div>
            <Progress value={progress} className="h-2" />
          </CardContent>
        </Card>

        {loading ? (
          <Card><CardContent className="pt-6 text-center text-muted-foreground">Loading review…</CardContent></Card>
        ) : (
          <>
            {/* Story of the Year */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">📖 Story of the Year</CardTitle>
                <p className="text-xs text-muted-foreground">Capture the narrative that defines this fund year.</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <Label htmlFor="story-summary" className="text-sm">1-Paragraph Year Summary</Label>
                  <p className="text-xs text-muted-foreground">Use this in your annual LP letter.</p>
                  <Textarea
                    id="story-summary"
                    value={data["story-summary"] || ""}
                    onChange={(e) => set("story-summary", e.target.value)}
                    placeholder="Summarise the key themes, wins, and learnings from this fund year…"
                    rows={4}
                    className="resize-none"
                    data-testid="textarea-story-summary"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Portfolio Company Updates */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">📁 Portfolio Company Updates</CardTitle>
                <p className="text-xs text-muted-foreground">Ensure all portfolio data is current and validated.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {PORTFOLIO_CHECKLIST.map((item, idx) => (
                  <div key={item.id}>
                    {idx > 0 && <Separator className="mb-3" />}
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={item.id}
                        checked={!!data[item.id]}
                        onCheckedChange={(v) => set(item.id, !!v)}
                        data-testid={`checkbox-${item.id}`}
                      />
                      <label
                        htmlFor={item.id}
                        className={`text-sm cursor-pointer ${data[item.id] ? "line-through text-muted-foreground" : ""}`}
                      >
                        {item.label}
                      </label>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Key Stats — KPI Inputs */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">📊 Key Stats</CardTitle>
                <p className="text-xs text-muted-foreground">Core performance metrics for the year-end LP report.</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { id: "stats-deals", label: "# deals invested this year", placeholder: "e.g. 8" },
                    { id: "stats-active", label: "# active portfolio companies", placeholder: "e.g. 22" },
                    { id: "stats-inactive", label: "# inactive portfolio companies", placeholder: "e.g. 3" },
                    { id: "stats-markups", label: "# markups", placeholder: "e.g. 5" },
                    { id: "stats-markdowns", label: "# markdowns", placeholder: "e.g. 2" },
                    { id: "stats-nav", label: "NAV ($)", placeholder: "e.g. 12500000" },
                    { id: "stats-moic", label: "MOIC (×)", placeholder: "e.g. 1.8" },
                    { id: "stats-tvpi", label: "TVPI (×)", placeholder: "e.g. 1.6" },
                    { id: "stats-dpi", label: "DPI (×)", placeholder: "e.g. 0.2" },
                  ].map((field) => (
                    <div key={field.id} className="space-y-1">
                      <Label htmlFor={field.id} className="text-sm">{field.label}</Label>
                      <Input
                        id={field.id}
                        type="number"
                        value={data[field.id] ?? ""}
                        onChange={(e) => set(field.id, e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder={field.placeholder}
                        data-testid={`input-${field.id}`}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Portfolio Model & Pacing */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">📈 Portfolio Model & Pacing</CardTitle>
                <p className="text-xs text-muted-foreground">Assess deployment pacing and forward planning.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {PACING_CHECKLIST.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <Checkbox
                      id={item.id}
                      checked={!!data[item.id]}
                      onCheckedChange={(v) => set(item.id, !!v)}
                      data-testid={`checkbox-${item.id}`}
                    />
                    <label htmlFor={item.id} className={`text-sm cursor-pointer ${data[item.id] ? "line-through text-muted-foreground" : ""}`}>
                      {item.label}
                    </label>
                  </div>
                ))}
                <Separator />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-sm"># of deals this year vs. original expectations</Label>
                    <Input
                      value={data["pacing-deals-vs-plan"] || ""}
                      onChange={(e) => set("pacing-deals-vs-plan", e.target.value)}
                      placeholder="e.g. 8 vs planned 10"
                      data-testid="input-pacing-deals-vs-plan"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Average check size this year vs. prior year</Label>
                    <Input
                      value={data["pacing-check-size"] || ""}
                      onChange={(e) => set("pacing-check-size", e.target.value)}
                      placeholder="e.g. $275K vs $250K"
                      data-testid="input-pacing-check-size"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Median valuation at time of investment</Label>
                    <Input
                      value={data["pacing-valuation"] || ""}
                      onChange={(e) => set("pacing-valuation", e.target.value)}
                      placeholder="e.g. $8M pre-money"
                      data-testid="input-pacing-valuation"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Fund on pace to deploy capital as planned?</Label>
                    <Select value={data["pacing-on-pace"] || ""} onValueChange={(v) => set("pacing-on-pace", v)}>
                      <SelectTrigger data-testid="select-pacing-on-pace">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Yes">Yes</SelectItem>
                        <SelectItem value="No">No</SelectItem>
                        <SelectItem value="Partially">Partially</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Deals remaining cash supports in next 12 months</Label>
                    <Input
                      type="number"
                      value={data["pacing-2025-deals"] ?? ""}
                      onChange={(e) => set("pacing-2025-deals", e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="e.g. 6"
                      data-testid="input-pacing-2025-deals"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Reserve ratio assessment</Label>
                    <Input
                      value={data["pacing-reserves"] || ""}
                      onChange={(e) => set("pacing-reserves", e.target.value)}
                      placeholder="e.g. 40% reserves, adequate for top 5 companies"
                      data-testid="input-pacing-reserves"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Computed Pacing Insights */}
            <PacingInsights data={data} />

            {/* Document Review */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">📄 Document Review</CardTitle>
                <p className="text-xs text-muted-foreground">Verify all legal and financial records are in order.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {DOCS_CHECKLIST.map((item, idx) => (
                  <div key={item.id}>
                    {idx > 0 && <Separator className="mb-3" />}
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={item.id}
                        checked={!!data[item.id]}
                        onCheckedChange={(v) => set(item.id, !!v)}
                        data-testid={`checkbox-${item.id}`}
                      />
                      <label
                        htmlFor={item.id}
                        className={`text-sm cursor-pointer ${data[item.id] ? "line-through text-muted-foreground" : ""}`}
                      >
                        {item.label}
                      </label>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Service Provider Tracker — structured table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">🤝 Service Provider Check-ins</CardTitle>
                <p className="text-xs text-muted-foreground">Annual touchpoints with each service provider.</p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium w-40">Provider</th>
                        <th className="text-left py-2 pr-4 font-medium w-44">Status</th>
                        <th className="text-left py-2 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SERVICE_PROVIDERS.map((sp, idx) => (
                        <tr key={sp.key} className={idx < SERVICE_PROVIDERS.length - 1 ? "border-b" : ""}>
                          <td className="py-3 pr-4 font-medium align-middle">{sp.label}</td>
                          <td className="py-3 pr-4 align-middle">
                            <Select
                              value={data[`sp-${sp.key}-status`] || ""}
                              onValueChange={(v) => set(`sp-${sp.key}-status`, v)}
                            >
                              <SelectTrigger className="h-8 text-xs" data-testid={`select-sp-${sp.key}-status`}>
                                <SelectValue placeholder="Status…" />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map((opt) => (
                                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-3 align-middle">
                            <Input
                              className="h-8 text-xs"
                              value={data[`sp-${sp.key}-notes`] || ""}
                              onChange={(e) => set(`sp-${sp.key}-notes`, e.target.value)}
                              placeholder={`Notes for ${sp.label}…`}
                              data-testid={`input-sp-${sp.key}-notes`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
