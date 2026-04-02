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
import { Printer, RefreshCw, AlertCircle, CheckCircle2, TrendingUp, Info } from "lucide-react";

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
    <Card className="bg-white/5 border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[rgb(142,132,247)]" />
          Computed Pacing Insights
        </CardTitle>
        <p className="text-xs text-white/40">Auto-generated from your KPI inputs above.</p>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {insights.map((ins, i) => (
          <div key={i} className={`flex items-start gap-2.5 p-3 rounded-lg ${ins.type === "good" ? "bg-[rgb(196,227,230)]/5" : ins.type === "warn" ? "bg-[rgb(254,212,92)]/5" : "bg-white/5"}`}>
            {ins.type === "good" && <CheckCircle2 className="h-4 w-4 text-[rgb(196,227,230)] mt-0.5 flex-shrink-0" />}
            {ins.type === "warn" && <AlertCircle className="h-4 w-4 text-[rgb(254,212,92)] mt-0.5 flex-shrink-0" />}
            {ins.type === "info" && <Info className="h-4 w-4 text-white/40 mt-0.5 flex-shrink-0" />}
            <p className={`text-sm ${ins.type === "good" ? "text-white/80" : ins.type === "warn" ? "text-white/80" : "text-white/60"}`}>{ins.text}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Shared styled checkbox row ─────────────────────────────────────────────

function CheckRow({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(!!v)}
        className="border-white/30 data-[state=checked]:bg-[rgb(142,132,247)] data-[state=checked]:border-[rgb(142,132,247)]"
        data-testid={`checkbox-${id}`}
      />
      <label
        htmlFor={id}
        className={`text-sm cursor-pointer ${checked ? "line-through text-white/30" : "text-white/80"}`}
      >
        {checked && <CheckCircle2 className="h-3.5 w-3.5 inline mr-1 text-[rgb(196,227,230)]" />}
        {label}
      </label>
    </div>
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

  return (
    <AppLayout
      title="EOY Fund Health Review"
      subtitle="Annual year-end fund review for LP reporting and internal governance."
    >
      <style>{PRINT_STYLE}</style>
      <div id="eoy-print" className="max-w-4xl mx-auto p-6 space-y-5">

        {/* Top actions + progress bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="text-2xl font-bold text-[rgb(142,132,247)] tabular-nums">{progress}%</div>
            <div className="flex-1 max-w-xs">
              <Progress value={progress} className="h-2 bg-white/10" />
              <p className="text-xs text-white/40 mt-1">
                {checkedCount}/{allCheckboxIds.length} checklist items
                {saving && " · Saving…"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
              data-testid="button-export"
            >
              <Printer className="h-4 w-4 mr-1.5" /> Print / PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white"
              data-testid="button-reset"
            >
              <RefreshCw className="h-4 w-4 mr-1.5" /> Reset
            </Button>
          </div>
        </div>

        {loading ? (
          <Card className="bg-white/5 border-white/10">
            <CardContent className="pt-6 text-center text-white/40">Loading review…</CardContent>
          </Card>
        ) : (
          <>
            {/* Story of the Year */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base flex items-center gap-2">📖 Story of the Year</CardTitle>
                <p className="text-xs text-white/40">Capture the narrative that defines this fund year — use this in your annual LP letter.</p>
              </CardHeader>
              <CardContent>
                <Textarea
                  id="story-summary"
                  value={data["story-summary"] || ""}
                  onChange={(e) => set("story-summary", e.target.value)}
                  placeholder="Summarise the key themes, wins, and learnings from this fund year…"
                  rows={5}
                  className="resize-none bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)]/50"
                  data-testid="textarea-story-summary"
                />
              </CardContent>
            </Card>

            {/* Portfolio Company Updates */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base flex items-center gap-2">📁 Portfolio Company Updates</CardTitle>
                <p className="text-xs text-white/40">Ensure all portfolio data is current and validated.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {PORTFOLIO_CHECKLIST.map((item, idx) => (
                  <div key={item.id}>
                    {idx > 0 && <Separator className="mb-3 bg-white/10" />}
                    <CheckRow
                      id={item.id}
                      label={item.label}
                      checked={!!data[item.id]}
                      onChange={(v) => set(item.id, v)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Key Stats */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base flex items-center gap-2">📊 Key Stats</CardTitle>
                <p className="text-xs text-white/40">Core performance metrics for the year-end LP report.</p>
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
                    <div key={field.id} className="space-y-1.5">
                      <Label htmlFor={field.id} className="text-sm text-white/70">{field.label}</Label>
                      <Input
                        id={field.id}
                        type="number"
                        value={data[field.id] ?? ""}
                        onChange={(e) => set(field.id, e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder={field.placeholder}
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)]/50"
                        data-testid={`input-${field.id}`}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Portfolio Model & Pacing */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base flex items-center gap-2">📈 Portfolio Model & Pacing</CardTitle>
                <p className="text-xs text-white/40">Assess deployment pacing and forward planning.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {PACING_CHECKLIST.map((item) => (
                  <CheckRow
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    checked={!!data[item.id]}
                    onChange={(v) => set(item.id, v)}
                  />
                ))}
                <Separator className="bg-white/10" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm text-white/70"># of deals this year vs. original expectations</Label>
                    <Input
                      value={data["pacing-deals-vs-plan"] || ""}
                      onChange={(e) => set("pacing-deals-vs-plan", e.target.value)}
                      placeholder="e.g. 8 vs planned 10"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)]/50"
                      data-testid="input-pacing-deals-vs-plan"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm text-white/70">Average check size this year vs. prior year</Label>
                    <Input
                      value={data["pacing-check-size"] || ""}
                      onChange={(e) => set("pacing-check-size", e.target.value)}
                      placeholder="e.g. $275K vs $250K"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)]/50"
                      data-testid="input-pacing-check-size"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm text-white/70">Median valuation at time of investment</Label>
                    <Input
                      value={data["pacing-valuation"] || ""}
                      onChange={(e) => set("pacing-valuation", e.target.value)}
                      placeholder="e.g. $8M pre-money"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)]/50"
                      data-testid="input-pacing-valuation"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm text-white/70">Fund on pace to deploy capital as planned?</Label>
                    <Select value={data["pacing-on-pace"] || ""} onValueChange={(v) => set("pacing-on-pace", v)}>
                      <SelectTrigger
                        className="bg-white/5 border-white/10 text-white"
                        data-testid="select-pacing-on-pace"
                      >
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                        <SelectItem value="Yes">Yes</SelectItem>
                        <SelectItem value="No">No</SelectItem>
                        <SelectItem value="Partially">Partially</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm text-white/70">Deals remaining cash supports in next 12 months</Label>
                    <Input
                      type="number"
                      value={data["pacing-2025-deals"] ?? ""}
                      onChange={(e) => set("pacing-2025-deals", e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="e.g. 6"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)]/50"
                      data-testid="input-pacing-2025-deals"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm text-white/70">Reserve ratio assessment</Label>
                    <Input
                      value={data["pacing-reserves"] || ""}
                      onChange={(e) => set("pacing-reserves", e.target.value)}
                      placeholder="e.g. 40% reserves, adequate for top 5 companies"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)]/50"
                      data-testid="input-pacing-reserves"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Computed Pacing Insights */}
            <PacingInsights data={data} />

            {/* Document Review */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base flex items-center gap-2">📄 Document Review</CardTitle>
                <p className="text-xs text-white/40">Verify all legal and financial records are in order.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {DOCS_CHECKLIST.map((item, idx) => (
                  <div key={item.id}>
                    {idx > 0 && <Separator className="mb-3 bg-white/10" />}
                    <CheckRow
                      id={item.id}
                      label={item.label}
                      checked={!!data[item.id]}
                      onChange={(v) => set(item.id, v)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Service Provider Tracker */}
            <Card className="bg-white/5 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base flex items-center gap-2">🤝 Service Provider Check-ins</CardTitle>
                <p className="text-xs text-white/40">Annual touchpoints with each service provider.</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {SERVICE_PROVIDERS.map((sp, idx) => (
                    <div key={sp.key}>
                      {idx > 0 && <Separator className="mb-3 bg-white/10" />}
                      <div className="grid grid-cols-1 sm:grid-cols-[160px_180px_1fr] gap-3 items-start">
                        <div className="flex items-center h-9">
                          <span className="text-sm font-medium text-white/80">{sp.label}</span>
                        </div>
                        <Select
                          value={data[`sp-${sp.key}-status`] || ""}
                          onValueChange={(v) => set(`sp-${sp.key}-status`, v)}
                        >
                          <SelectTrigger
                            className="h-9 text-xs bg-white/5 border-white/10 text-white"
                            data-testid={`select-sp-${sp.key}-status`}
                          >
                            <SelectValue placeholder="Status…" />
                          </SelectTrigger>
                          <SelectContent className="bg-[rgb(28,28,28)] border-white/10">
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={data[`sp-${sp.key}-notes`] || ""}
                          onChange={(e) => set(`sp-${sp.key}-notes`, e.target.value)}
                          placeholder="Notes…"
                          className="h-9 text-xs bg-white/5 border-white/10 text-white placeholder:text-white/30"
                          data-testid={`input-sp-${sp.key}-notes`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
