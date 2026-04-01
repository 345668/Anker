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
import { CalendarCheck, Download, RefreshCw } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type FieldType = "checkbox" | "text" | "number" | "textarea" | "select" | "yesno";

interface ReviewField {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: string[];
  hint?: string;
}

interface ReviewSection {
  id: string;
  title: string;
  icon: string;
  description?: string;
  fields: ReviewField[];
}

const STATUS_OPTIONS = ["Not started", "In progress", "Complete", "N/A"];

const REVIEW_SECTIONS: ReviewSection[] = [
  {
    id: "story",
    title: "Story of the Year",
    icon: "📖",
    description: "Capture the narrative that defines this fund year.",
    fields: [
      {
        id: "story-summary",
        label: "1-Paragraph Year Summary",
        type: "textarea",
        placeholder: "Summarise the key themes, wins, and learnings from this fund year…",
        hint: "Use this in your annual LP letter.",
      },
    ],
  },
  {
    id: "portfolio",
    title: "Portfolio Company Updates",
    icon: "📁",
    description: "Ensure all portfolio data is current and validated.",
    fields: [
      { id: "port-updates", label: "Request material updates from all portfolio companies", type: "checkbox" },
      { id: "port-status", label: "Confirm active / inactive status for all portfolio companies", type: "checkbox" },
      { id: "port-valuation-policy", label: "Review fund valuation policy", type: "checkbox" },
      { id: "port-valuation-discuss", label: "Conduct valuation discussions with all active portfolio companies", type: "checkbox" },
    ],
  },
  {
    id: "stats",
    title: "Key Stats",
    icon: "📊",
    description: "Core performance metrics for the year-end LP report.",
    fields: [
      { id: "stats-deals", label: "Number of deals invested this year", type: "number", placeholder: "e.g. 8" },
      { id: "stats-active", label: "Number of active portfolio companies", type: "number", placeholder: "e.g. 22" },
      { id: "stats-inactive", label: "Number of inactive portfolio companies", type: "number", placeholder: "e.g. 3" },
      { id: "stats-markups", label: "Number of markups", type: "number", placeholder: "e.g. 5" },
      { id: "stats-markdowns", label: "Number of markdowns", type: "number", placeholder: "e.g. 2" },
      { id: "stats-nav", label: "NAV ($)", type: "number", placeholder: "e.g. 12500000" },
      { id: "stats-moic", label: "MOIC (×)", type: "number", placeholder: "e.g. 1.8" },
      { id: "stats-tvpi", label: "TVPI (×)", type: "number", placeholder: "e.g. 1.6" },
      { id: "stats-dpi", label: "DPI (×)", type: "number", placeholder: "e.g. 0.2" },
    ],
  },
  {
    id: "pacing",
    title: "Portfolio Model & Pacing",
    icon: "📈",
    description: "Assess deployment pacing and forward planning.",
    fields: [
      { id: "pacing-model", label: "Update fund portfolio model with current actuals", type: "checkbox" },
      { id: "pacing-deals-vs-plan", label: "# of deals this year vs. original expectations", type: "text", placeholder: "e.g. 8 vs planned 10" },
      { id: "pacing-check-size", label: "Average check size this year vs. prior year", type: "text", placeholder: "e.g. $275K vs $250K" },
      { id: "pacing-valuation", label: "Median valuation at time of investment", type: "text", placeholder: "e.g. $8M pre-money" },
      { id: "pacing-on-pace", label: "Fund on pace to deploy capital as planned?", type: "yesno" },
      { id: "pacing-2025-deals", label: "How many deals does remaining cash support in the next 12 months?", type: "number", placeholder: "e.g. 6" },
      { id: "pacing-reserves", label: "Reserve ratio assessment", type: "text", placeholder: "e.g. 40% reserves, adequate for top 5 companies" },
    ],
  },
  {
    id: "docs",
    title: "Document Review",
    icon: "📄",
    description: "Verify all legal and financial records are in order.",
    fields: [
      { id: "docs-executed", label: "Executed version of each deal document collected", type: "checkbox" },
      { id: "docs-admin-shared", label: "All deal docs shared with fund administrator", type: "checkbox" },
      { id: "docs-amounts-match", label: "Investment amounts match deal documents", type: "checkbox" },
      { id: "docs-invoices", label: "Fund admin has all invoices & receipts for the year", type: "checkbox" },
      { id: "docs-mgmt-fee", label: "Management fee calculations reviewed and confirmed correct", type: "checkbox" },
    ],
  },
  {
    id: "service-providers",
    title: "Service Provider Check-ins",
    icon: "🤝",
    description: "Annual touchpoints with each service provider.",
    fields: [
      { id: "sp-audit-status", label: "Audit — Status", type: "select", options: STATUS_OPTIONS },
      { id: "sp-audit-notes", label: "Audit — Notes", type: "text", placeholder: "e.g. Audit scheduled for Feb" },
      { id: "sp-tax-status", label: "Tax — Status", type: "select", options: STATUS_OPTIONS },
      { id: "sp-tax-notes", label: "Tax — Notes", type: "text", placeholder: "e.g. K-1s expected by March" },
      { id: "sp-vcap-status", label: "VCAP Insurance — Status", type: "select", options: STATUS_OPTIONS },
      { id: "sp-vcap-notes", label: "VCAP Insurance — Notes", type: "text", placeholder: "e.g. Renewal in Q1" },
      { id: "sp-banking-status", label: "Banking — Status", type: "select", options: STATUS_OPTIONS },
      { id: "sp-banking-notes", label: "Banking — Notes", type: "text", placeholder: "e.g. Cash sweep optimised" },
      { id: "sp-delaware-status", label: "Delaware / State Filings — Status", type: "select", options: STATUS_OPTIONS },
      { id: "sp-delaware-notes", label: "Delaware — Notes", type: "text", placeholder: "e.g. Annual report filed" },
    ],
  },
];

// ── Hooks ──────────────────────────────────────────────────────────────────

function useEOYSession() {
  const type = "eoy-review";
  const [data, setData] = useState<Record<string, any>>({});
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

  const save = useCallback((newData: Record<string, any>) => {
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

// ── Field Renderer ─────────────────────────────────────────────────────────

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: ReviewField;
  value: any;
  onChange: (v: any) => void;
}) {
  if (field.type === "checkbox") {
    return (
      <div className="flex items-start gap-3">
        <Checkbox
          id={field.id}
          checked={!!value}
          onCheckedChange={(v) => onChange(!!v)}
          className="mt-0.5"
          data-testid={`checkbox-${field.id}`}
        />
        <label
          htmlFor={field.id}
          className={`text-sm cursor-pointer leading-snug ${value ? "line-through text-muted-foreground" : ""}`}
        >
          {field.label}
        </label>
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="space-y-1">
        <Label htmlFor={field.id} className="text-sm">{field.label}</Label>
        {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
        <Textarea
          id={field.id}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className="resize-none"
          data-testid={`textarea-${field.id}`}
        />
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div className="space-y-1">
        <Label htmlFor={field.id} className="text-sm">{field.label}</Label>
        <Input
          id={field.id}
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder={field.placeholder}
          data-testid={`input-${field.id}`}
        />
      </div>
    );
  }

  if (field.type === "text") {
    return (
      <div className="space-y-1">
        <Label htmlFor={field.id} className="text-sm">{field.label}</Label>
        <Input
          id={field.id}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          data-testid={`input-${field.id}`}
        />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="space-y-1">
        <Label className="text-sm">{field.label}</Label>
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger data-testid={`select-${field.id}`}>
            <SelectValue placeholder="Select status…" />
          </SelectTrigger>
          <SelectContent>
            {(field.options || []).map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.type === "yesno") {
    return (
      <div className="space-y-1">
        <Label className="text-sm">{field.label}</Label>
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger data-testid={`select-${field.id}`}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Yes">Yes</SelectItem>
            <SelectItem value="No">No</SelectItem>
            <SelectItem value="Partially">Partially</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  return null;
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function EOYFundHealthReview() {
  const { data, loading, saving, set, reset } = useEOYSession();
  const { toast } = useToast();

  // count checkboxes for progress
  const allCheckboxFields = REVIEW_SECTIONS.flatMap((s) =>
    s.fields.filter((f) => f.type === "checkbox")
  );
  const checkedCount = allCheckboxFields.filter((f) => data[f.id]).length;
  const progress = allCheckboxFields.length
    ? Math.round((checkedCount / allCheckboxFields.length) * 100)
    : 0;

  const handleReset = () => {
    reset();
    toast({ title: "Review reset", description: "All fields cleared." });
  };

  const handleExport = () => {
    const year = new Date().getFullYear();
    const lines: string[] = [`Anker — EOY Fund Health Review ${year}`, ""];
    for (const section of REVIEW_SECTIONS) {
      lines.push(`## ${section.icon} ${section.title}`);
      for (const field of section.fields) {
        const val = data[field.id];
        if (field.type === "checkbox") {
          lines.push(`  [${val ? "x" : " "}] ${field.label}`);
        } else {
          lines.push(`  ${field.label}: ${val ?? "(not filled)"}`);
        }
      }
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eoy-fund-review-${year}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
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
            <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export">
              <Download className="h-4 w-4 mr-1" /> Export
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
              <span className="text-sm font-medium">Checkbox Items Completed</span>
              <div className="flex items-center gap-2">
                {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
                <Badge variant={progress === 100 ? "default" : "outline"}>
                  {checkedCount} / {allCheckboxFields.length}
                </Badge>
              </div>
            </div>
            <Progress value={progress} className="h-2" />
          </CardContent>
        </Card>

        {/* Sections */}
        {loading ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">Loading review…</CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {REVIEW_SECTIONS.map((section) => (
              <Card key={section.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span>{section.icon}</span>
                    {section.title}
                  </CardTitle>
                  {section.description && (
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  {section.fields.map((field, idx) => (
                    <div key={field.id}>
                      {idx > 0 && field.type !== "checkbox" && section.fields[idx - 1]?.type !== "checkbox" && (
                        <Separator className="mb-4" />
                      )}
                      <FieldRenderer
                        field={field}
                        value={data[field.id]}
                        onChange={(v) => set(field.id, v)}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
