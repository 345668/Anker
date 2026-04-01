import { useState, useEffect, useCallback, useRef } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Circle, FolderOpen, Printer, RefreshCw, Info, ChevronDown, ChevronRight, CheckSquare } from "lucide-react";

// ── Checklist data ─────────────────────────────────────────────────────────

interface ChecklistItem {
  id: string;
  label: string;
  note?: string;
}

interface ChecklistSection {
  id: string;
  title: string;
  icon: string;
  items: ChecklistItem[];
}

const FUND_I_SECTIONS: ChecklistSection[] = [
  {
    id: "story",
    title: "The Fund's Story",
    icon: "📖",
    items: [
      { id: "story-deck", label: "Fund Pitch Deck", note: "Full presentation for LP conversations" },
      { id: "story-memo", label: "Fund Narrative Memo", note: "Written thesis & strategy document" },
    ],
  },
  {
    id: "access",
    title: "The Fund's Access to Great Deals",
    icon: "🤝",
    items: [
      { id: "access-angel", label: "Angel / Scout / Associate Portfolio", note: "Prior investing track record" },
      { id: "access-phantom", label: "Phantom Portfolio", note: "Companies you would have invested in but couldn't" },
      { id: "access-deals", label: "Deals You Passed On Due to Lack of Capital", note: "Validates deal access, not just selection" },
      { id: "access-testimonials", label: "Founder Testimonials", note: "Written or video references from founders" },
      { id: "access-support", label: "Portfolio Company Engagement & Support Strategy", note: "How you add value post-investment" },
    ],
  },
  {
    id: "decisions",
    title: "The Fund's Decision-Making",
    icon: "🧠",
    items: [
      { id: "decisions-process", label: "Fund I Investment Process", note: "IC structure, diligence workflow, timelines" },
      { id: "decisions-dd-checklist", label: "Fund I Diligence Checklist", note: "Internal DD criteria & scoring" },
      { id: "decisions-memo-top", label: "Investment Memo — Top Performer", note: "Best deal memo with thesis rationale" },
      { id: "decisions-memo-lag", label: "Investment Memo — Dissolved / Lagging Company", note: "Transparency builds LP trust" },
    ],
  },
  {
    id: "financials",
    title: "The Fund's Financials",
    icon: "📊",
    items: [
      { id: "fin-model", label: "Fund Financial Model", note: "Deployment schedule, reserve ratios, fee waterfall" },
      { id: "fin-valuation", label: "Valuation Policy", note: "How you mark portfolio companies" },
    ],
  },
  {
    id: "legal",
    title: "The Fund's Legal Structure",
    icon: "⚖️",
    items: [
      { id: "legal-ts", label: "Term Sheet", note: "Standard deal terms" },
      { id: "legal-lpa", label: "LPA (Limited Partnership Agreement)", note: "Full fund governing document" },
      { id: "legal-sub", label: "Subscription Questionnaire", note: "LP onboarding document" },
      { id: "legal-diagram", label: "Fund Entity Diagram", note: "Visual org chart of fund structure" },
      { id: "legal-lp", label: "Fund Entity (the Limited Partnership)", note: "Executed formation docs" },
      { id: "legal-gp", label: "GP Entity", note: "General partner entity docs" },
      { id: "legal-mgmt", label: "Management Company Entity", note: "Mgmt co. formation docs" },
    ],
  },
  {
    id: "comms",
    title: "The Fund's Communication with LPs",
    icon: "📬",
    items: [
      { id: "comms-monthly", label: "Monthly Update Email", note: "Sample LP portfolio update" },
      { id: "comms-verbal", label: "Monthly Email to Verbally Committed LPs", note: "Demonstrates LP relationship quality" },
    ],
  },
];

const FUND_II_SECTIONS: ChecklistSection[] = [
  {
    id: "story",
    title: "The Fund's Story",
    icon: "📖",
    items: [
      { id: "story-deck", label: "Fund Pitch Deck", note: "Updated deck for new fund" },
      { id: "story-memo", label: "Fund Narrative Memo", note: "Thesis evolution & differentiation" },
      { id: "story-different", label: "What's Different?", note: "How this fund differs from prior fund" },
      { id: "story-learned", label: "What Did You Learn from the Prior Fund?", note: "Candid reflection on lessons learned" },
    ],
  },
  {
    id: "access",
    title: "The Fund's Access to Great Deals",
    icon: "🤝",
    items: [
      { id: "access-portfolio", label: "Fund I Portfolio with Valuations", note: "Full portfolio mark schedule" },
      { id: "access-ic-list", label: "List of All Deals Reviewed by IC", note: "Deal flow volume & selection rate" },
      { id: "access-testimonials", label: "Founder Testimonials", note: "References from portfolio founders" },
      { id: "access-support", label: "Portfolio Company Engagement & Support Strategy", note: "Value-add playbook" },
    ],
  },
  {
    id: "decisions",
    title: "The Fund's Decision-Making",
    icon: "🧠",
    items: [
      { id: "decisions-process", label: "Fund Investment Process", note: "IC structure, diligence workflow" },
      { id: "decisions-dd-checklist", label: "Fund Diligence Checklist", note: "Updated internal DD criteria" },
      { id: "decisions-memo-top", label: "Investment Memo — Top Performer", note: "Best deal with outcome data" },
      { id: "decisions-memo-lag", label: "Investment Memo — Dissolved / Lagging Company", note: "Candid post-mortem analysis" },
    ],
  },
  {
    id: "financials",
    title: "The Fund's Financials",
    icon: "📊",
    items: [
      { id: "fin-model", label: "Fund Financial Model", note: "Forward deployment & return projections" },
      { id: "fin-valuation", label: "Valuation Policy", note: "Mark-to-market methodology" },
      { id: "fin-audit", label: "Prior Fund Audit", note: "Audited financials for Fund I (or in process)" },
    ],
  },
  {
    id: "legal",
    title: "The Fund's Legal Structure",
    icon: "⚖️",
    items: [
      { id: "legal-ts", label: "Term Sheet", note: "Standard deal terms" },
      { id: "legal-lpa", label: "LPA (Limited Partnership Agreement)", note: "New fund LPA" },
      { id: "legal-sub", label: "Subscription Questionnaire", note: "LP onboarding document" },
      { id: "legal-diagram", label: "Fund Entity Diagram", note: "Updated entity structure" },
      { id: "legal-lp", label: "Fund Entity (the Limited Partnership)", note: "Formation docs" },
      { id: "legal-gp", label: "GP Entity", note: "General partner entity" },
      { id: "legal-mgmt", label: "Management Company Entity", note: "Management company docs" },
    ],
  },
  {
    id: "comms",
    title: "The Fund's Communication with LPs",
    icon: "📬",
    items: [
      { id: "comms-testimonials", label: "LP Testimonials", note: "Written references from existing LPs" },
      { id: "comms-quarterly", label: "Sample Quarterly LP Update", note: "Demonstrates reporting quality" },
      { id: "comms-annual", label: "Sample Annual LP Update", note: "Year-in-review report" },
      { id: "comms-monthly-3", label: "Sample Monthly LP Emails (3–5 from past 18 months)", note: "Shows consistency of communication" },
    ],
  },
  {
    id: "biz-ops",
    title: "The Fund's Business Ops",
    icon: "🏢",
    items: [
      { id: "ops-org", label: "Fund Personnel / Org Chart + LinkedIn Profiles", note: "Team roster with bios" },
      { id: "ops-tech", label: "Technology Stack Overview", note: "CRM, portfolio management tools, etc." },
      { id: "ops-continuity", label: "Business Continuity / Key Person Risk Management", note: "Succession planning" },
      { id: "ops-disaster", label: "Disaster Recovery Plan", note: "Data & operational continuity" },
      { id: "ops-support", label: "Portfolio Company Engagement & Support Strategy", note: "Repeatable value-add approach" },
    ],
  },
];

// ── Hook ───────────────────────────────────────────────────────────────────

function useChecklistSession(type: string) {
  const [data, setData] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/checklists/${type}`)
      .then((r) => r.json())
      .then((session) => {
        setData(session?.data || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [type]);

  const save = useCallback(
    (newData: Record<string, boolean>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setSaving(true);
        await fetch(`/api/checklists/${type}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: newData }),
        }).catch(() => null);
        setSaving(false);
      }, 800);
    },
    [type]
  );

  const toggle = useCallback(
    (itemId: string) => {
      setData((prev) => {
        const next = { ...prev, [itemId]: !prev[itemId] };
        save(next);
        return next;
      });
    },
    [save]
  );

  const markSectionComplete = useCallback(
    (section: ChecklistSection) => {
      setData((prev) => {
        const next = { ...prev };
        section.items.forEach((item) => { next[item.id] = true; });
        save(next);
        return next;
      });
    },
    [save]
  );

  const reset = useCallback(() => {
    setData({});
    save({});
  }, [save]);

  return { data, loading, saving, toggle, markSectionComplete, reset };
}

// ── Collapsible Section ────────────────────────────────────────────────────

function SectionCard({
  section,
  data,
  onToggle,
  onMarkComplete,
}: {
  section: ChecklistSection;
  data: Record<string, boolean>;
  onToggle: (id: string) => void;
  onMarkComplete: (section: ChecklistSection) => void;
}) {
  const [open, setOpen] = useState(true);
  const checked = section.items.filter((i) => data[i.id]).length;
  const total = section.items.length;
  const pct = Math.round((checked / total) * 100);
  const isComplete = checked === total;

  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setOpen((p) => !p)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <span>{section.icon}</span>
            <CardTitle className="text-base">{section.title}</CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={isComplete ? "default" : pct >= 60 ? "secondary" : "outline"} className="text-xs">
              {checked}/{total}
            </Badge>
            {!isComplete && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={(e) => { e.stopPropagation(); onMarkComplete(section); }}
                data-testid={`button-mark-complete-${section.id}`}
              >
                <CheckSquare className="h-3.5 w-3.5 mr-1" />
                Mark complete
              </Button>
            )}
          </div>
        </div>
        <Progress value={pct} className="h-1.5 mt-2" />
        <p className="text-xs text-muted-foreground">{pct}% complete</p>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3 pt-0">
          {section.items.map((item, idx) => (
            <div key={item.id}>
              {idx > 0 && <Separator className="mb-3" />}
              <div className="flex items-start gap-3">
                <Checkbox
                  id={item.id}
                  checked={!!data[item.id]}
                  onCheckedChange={() => onToggle(item.id)}
                  className="mt-0.5"
                  data-testid={`checkbox-${item.id}`}
                />
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor={item.id}
                    className={`text-sm font-medium cursor-pointer ${data[item.id] ? "line-through text-muted-foreground" : ""}`}
                  >
                    {data[item.id] ? (
                      <CheckCircle2 className="h-3.5 w-3.5 inline mr-1 text-green-600" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 inline mr-1 text-muted-foreground" />
                    )}
                    {item.label}
                  </label>
                  {item.note && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-start gap-1">
                      <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      {item.note}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// ── Print Styles ───────────────────────────────────────────────────────────

const PRINT_STYLE = `
@media print {
  body * { visibility: hidden; }
  #data-room-print, #data-room-print * { visibility: visible; }
  #data-room-print { position: absolute; left: 0; top: 0; width: 100%; }
  button { display: none !important; }
}
`;

// ── Component ──────────────────────────────────────────────────────────────

export default function DataRoomChecklist() {
  const [isFundII, setIsFundII] = useState(false);
  const checklistType = isFundII ? "data-room-fund2" : "data-room-em";
  const sections = isFundII ? FUND_II_SECTIONS : FUND_I_SECTIONS;
  const { data, loading, saving, toggle, markSectionComplete, reset } = useChecklistSession(checklistType);
  const { toast } = useToast();

  const allItems = sections.flatMap((s) => s.items);
  const checkedCount = allItems.filter((i) => data[i.id]).length;
  const progress = allItems.length ? Math.round((checkedCount / allItems.length) * 100) : 0;

  const handleReset = () => {
    reset();
    toast({ title: "Checklist reset", description: "All items cleared." });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <AppLayout>
      <style>{PRINT_STYLE}</style>
      <div id="data-room-print" className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FolderOpen className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">Data Room Checklist</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Ensure your fund data room is complete before LP conversations.
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

        {/* Fund mode toggle */}
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Fund Mode</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isFundII ? "Fund II+ includes prior fund performance, LP testimonials, and business ops." : "Emerging Manager / Fund I checklist — ideal for first-time fund managers."}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Label className={!isFundII ? "font-semibold" : "text-muted-foreground"}>Fund I (EM)</Label>
                <Switch
                  checked={isFundII}
                  onCheckedChange={setIsFundII}
                  data-testid="switch-fund-mode"
                />
                <Label className={isFundII ? "font-semibold" : "text-muted-foreground"}>Fund II+</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overall Progress */}
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Progress</span>
              <div className="flex items-center gap-2">
                {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
                <Badge variant={progress === 100 ? "default" : progress >= 60 ? "secondary" : "outline"}>
                  {checkedCount} / {allItems.length}
                </Badge>
              </div>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1.5">{progress}% complete</p>
          </CardContent>
        </Card>

        {/* Checklist sections */}
        {loading ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">Loading checklist…</CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {sections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                data={data}
                onToggle={toggle}
                onMarkComplete={markSectionComplete}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
