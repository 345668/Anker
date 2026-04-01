import { useState, useMemo } from "react";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Calculator,
  TrendingUp,
  PieChart,
  DollarSign,
  BarChart3,
  Shield,
  Globe,
  Copy,
  CheckCircle,
  AlertCircle,
  XCircle,
  ChevronRight,
  Download,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  AreaChart,
  Area,
} from "recharts";

import { useToast } from "@/hooks/use-toast";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCurrency(n: number): string {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  if (!isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

// ─── Copy Results Hook ────────────────────────────────────────────────────────

function useCopyResults() {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast({ title: "Copied to clipboard", description: "Results copied successfully." });
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return { copied, copy };
}

// ─── 1. SAFE Dilution Calculator ─────────────────────────────────────────────
// Conversion logic:
//   Pre-money SAFE: cap price = valCap / preMoneySharesOutstanding; discount price = seriesA_pps * (1 - discount%)
//   Post-money SAFE: cap price = (valCap - amount) / preMoneySharesOutstanding; discount same
//   Conversion price = min(cap price, discount price, series A price)
//   New shares = amount / conversion price
// The pre-money valuation + founder shares drive the Series A implied price per share (series A PPS).
// We derive seriesA PPS from preMoneyValuation / founderShares (price at which Series A is assumed to price).

interface SAFE { id: number; amount: number; valCap: number; discount: number; type: "pre" | "post" }

function SafeDilutionCalc() {
  const [safes, setSafes] = useState<SAFE[]>([{ id: 1, amount: 500000, valCap: 5000000, discount: 20, type: "pre" }]);
  const [preMoneyValuation, setPreMoneyValuation] = useState(8000000);
  const [founderShares, setFounderShares] = useState(1000000);
  const { copied, copy } = useCopyResults();

  const results = useMemo(() => {
    // Series A implied price per share = pre-money valuation / total pre-money shares outstanding
    const seriesAPPS = founderShares > 0 ? preMoneyValuation / founderShares : 0;

    let runningShares = founderShares;
    const details = safes.map(safe => {
      const effectiveValCap = safe.type === "post" ? safe.valCap - safe.amount : safe.valCap;
      // Cap price: valuation cap / shares outstanding at conversion (pre-money shares)
      const capPrice = runningShares > 0 ? effectiveValCap / runningShares : Infinity;
      // Discount price: series A price discounted
      const discountPrice = seriesAPPS * (1 - safe.discount / 100);
      // Conversion price: most favourable to investor (lowest price), capped at series A
      const conversionPrice = Math.max(0.0001, Math.min(capPrice, discountPrice, seriesAPPS));
      const newShares = conversionPrice > 0 ? safe.amount / conversionPrice : 0;
      // Dilution of current shareholders from this SAFE converting
      const dilutionPct = (runningShares + newShares) > 0
        ? (newShares / (runningShares + newShares)) * 100
        : 0;
      runningShares += newShares;
      return { id: safe.id, conversionPrice, newShares, dilutionPct, amount: safe.amount };
    });

    const totalShares = runningShares;
    const founderOwnership = totalShares > 0 ? (founderShares / totalShares) * 100 : 0;
    const totalSAFEShares = details.reduce((s, d) => s + d.newShares, 0);
    const totalDilution = totalShares > 0 ? (totalSAFEShares / totalShares) * 100 : 0;
    return { details, founderOwnership, totalDilution, seriesAPPS };
  }, [safes, preMoneyValuation, founderShares]);

  const addSafe = () => setSafes(prev => [...prev, { id: Date.now(), amount: 250000, valCap: 5000000, discount: 20, type: "pre" }]);
  const removeSafe = (id: number) => setSafes(prev => prev.filter(s => s.id !== id));

  function updateSafeField(id: number, field: "amount" | "valCap" | "discount", value: number): void {
    setSafes(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }
  function updateSafeType(id: number, value: "pre" | "post"): void {
    setSafes(prev => prev.map(s => s.id === id ? { ...s, type: value } : s));
  }

  const copyText = `SAFE Dilution Results\nPre-Money Valuation: ${fmtCurrency(preMoneyValuation)}\nImplied Series A PPS: $${results.seriesAPPS.toFixed(4)}\nFounder Ownership Post-Conversion: ${fmtPct(results.founderOwnership)}\nTotal SAFE Dilution: ${fmtPct(results.totalDilution)}\n${results.details.map((d, i) => `SAFE ${i+1}: Conv Price $${d.conversionPrice.toFixed(4)}, New Shares ${Math.round(d.newShares).toLocaleString()}, Dilution ${fmtPct(d.dilutionPct)}`).join('\n')}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-white/70 text-sm">Pre-Money Valuation at Series A ($)</Label>
          <Input data-testid="input-safe-premoney" type="number" value={preMoneyValuation} onChange={e => setPreMoneyValuation(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
          <p className="text-white/30 text-xs mt-1">Sets the Series A price per share used for conversion</p>
        </div>
        <div>
          <Label className="text-white/70 text-sm">Founder Shares Outstanding (pre-money)</Label>
          <Input data-testid="input-safe-shares" type="number" value={founderShares} onChange={e => setFounderShares(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
      </div>

      <div className="p-3 bg-white/5 rounded-lg text-sm flex items-center justify-between">
        <span className="text-white/50">Implied Series A Price Per Share</span>
        <span className="text-[rgb(142,132,247)] font-medium" data-testid="text-series-a-pps">${results.seriesAPPS.toFixed(4)}</span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-medium">SAFE Instruments</h3>
          <Button size="sm" onClick={addSafe} className="bg-white/10 text-white hover:bg-white/20 border-0" data-testid="button-add-safe">
            <Plus className="w-4 h-4 mr-1" /> Add SAFE
          </Button>
        </div>
        {safes.map((safe, i) => (
          <Card key={safe.id} className="bg-[rgb(25,25,25)] border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/70 text-sm">SAFE #{i + 1}</span>
                {safes.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => removeSafe(safe.id)} className="text-red-400 hover:text-red-300 hover:bg-red-400/10 h-7 w-7 p-0" data-testid={`button-remove-safe-${safe.id}`}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-white/60 text-xs">Amount ($)</Label>
                  <Input data-testid={`input-safe-amount-${safe.id}`} type="number" value={safe.amount} onChange={e => updateSafeField(safe.id, 'amount', +e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-white/60 text-xs">Val Cap ($)</Label>
                  <Input data-testid={`input-safe-cap-${safe.id}`} type="number" value={safe.valCap} onChange={e => updateSafeField(safe.id, 'valCap', +e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-white/60 text-xs">Discount (%)</Label>
                  <Input data-testid={`input-safe-discount-${safe.id}`} type="number" min="0" max="50" value={safe.discount} onChange={e => updateSafeField(safe.id, 'discount', +e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-white/60 text-xs">Type</Label>
                  <Select value={safe.type} onValueChange={(v: "pre" | "post") => updateSafeType(safe.id, v)}>
                    <SelectTrigger className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1 h-8 text-sm" data-testid={`select-safe-type-${safe.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
                      <SelectItem value="pre" className="text-white">Pre-Money</SelectItem>
                      <SelectItem value="post" className="text-white">Post-Money</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-gradient-to-r from-[rgb(142,132,247)]/10 to-[rgb(251,194,213)]/10 border-white/10">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Conversion Results</h3>
            <Button size="sm" onClick={() => copy(copyText)} className="bg-white/10 text-white hover:bg-white/20 border-0" data-testid="button-copy-safe">
              {copied ? <CheckCircle className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />} Copy
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-light text-[rgb(142,132,247)]" data-testid="text-founder-ownership">{fmtPct(results.founderOwnership)}</div>
              <div className="text-white/50 text-xs mt-1">Founder Ownership</div>
            </div>
            <div className="text-center p-3 bg-white/5 rounded-lg">
              <div className="text-2xl font-light text-[rgb(251,194,213)]" data-testid="text-total-dilution">{fmtPct(results.totalDilution)}</div>
              <div className="text-white/50 text-xs mt-1">Total SAFE Dilution</div>
            </div>
          </div>
          <div className="space-y-2">
            {results.details.map((d, i) => (
              <div key={d.id} className="flex justify-between text-sm" data-testid={`text-safe-detail-${i}`}>
                <span className="text-white/60">SAFE #{i + 1} ({fmtCurrency(d.amount)})</span>
                <span className="text-white">Conv @ ${d.conversionPrice.toFixed(4)} → {Math.round(d.newShares).toLocaleString()} shares ({fmtPct(d.dilutionPct)} dilution)</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface Stakeholder {
  id: number;
  name: string;
  shares: number;
  type: "common" | "preferred" | "option" | "safe" | "warrant";
  liquidationPref: number;
  participating: boolean;
}

function CapTableCalc() {
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([
    { id: 1, name: "Founders", shares: 5000000, type: "common", liquidationPref: 0, participating: false },
    { id: 2, name: "Series A", shares: 1500000, type: "preferred", liquidationPref: 1, participating: false },
    { id: 3, name: "ESOP Pool", shares: 500000, type: "option", liquidationPref: 0, participating: false },
  ]);
  const [exitValue, setExitValue] = useState(20000000);
  const { copied, copy } = useCopyResults();

  const totalShares = useMemo(() => stakeholders.reduce((s, st) => s + st.shares, 0), [stakeholders]);

  const waterfall = useMemo(() => {
    if (totalShares === 0) return stakeholders.map(s => ({ id: s.id, name: s.name, payout: 0, ownership: 0 }));

    type WaterfallEntry = { id: number; name: string; payout: number; ownership: number };
    const entries: WaterfallEntry[] = stakeholders.map(s => ({
      id: s.id, name: s.name, payout: 0, ownership: (s.shares / totalShares) * 100,
    }));

    const preferred = stakeholders.filter(s => s.type === "preferred");
    const participating = preferred.filter(s => s.participating);
    const nonParticipating = preferred.filter(s => !s.participating);

    let pool = exitValue;
    const prefAllocated = new Map<number, number>();
    for (const s of [...participating, ...nonParticipating]) {
      const pref = Math.min(s.shares * s.liquidationPref, pool);
      prefAllocated.set(s.id, pref);
      pool -= pref;
    }

    const nonPartConvert = new Set<number>();
    for (const s of nonParticipating) {
      const proRataOfFull = (s.shares / totalShares) * exitValue;
      if (proRataOfFull > (prefAllocated.get(s.id) ?? 0)) {
        nonPartConvert.add(s.id);
      }
    }

    let adjustedPool = exitValue;
    for (const s of participating) adjustedPool -= prefAllocated.get(s.id) ?? 0;
    for (const s of nonParticipating) {
      if (!nonPartConvert.has(s.id)) adjustedPool -= prefAllocated.get(s.id) ?? 0;
    }
    const remainderPool = adjustedPool;

    const eligibleShares = stakeholders.reduce((sum, s) => {
      if (s.type !== "preferred") return sum + s.shares;
      if (s.participating) return sum + s.shares;
      if (nonPartConvert.has(s.id)) return sum + s.shares;
      return sum;
    }, 0);

    for (const s of stakeholders) {
      const entry = entries.find(e => e.id === s.id)!;
      if (s.type === "preferred") {
        if (s.participating) {
          const proRata = eligibleShares > 0 ? (s.shares / eligibleShares) * remainderPool : 0;
          entry.payout = (prefAllocated.get(s.id) ?? 0) + proRata;
        } else if (nonPartConvert.has(s.id)) {
          entry.payout = eligibleShares > 0 ? (s.shares / eligibleShares) * remainderPool : 0;
        } else {
          entry.payout = prefAllocated.get(s.id) ?? 0;
        }
      } else {
        entry.payout = eligibleShares > 0 ? (s.shares / eligibleShares) * remainderPool : 0;
      }
    }

    return entries;
  }, [stakeholders, exitValue, totalShares]);

  const addStakeholder = () => setStakeholders(prev => [...prev, { id: Date.now(), name: "New Stakeholder", shares: 100000, type: "common", liquidationPref: 0, participating: false }]);
  const removeStakeholder = (id: number) => setStakeholders(prev => prev.filter(s => s.id !== id));

  function updateStakeholderName(id: number, value: string): void {
    setStakeholders(prev => prev.map(s => s.id === id ? { ...s, name: value } : s));
  }
  function updateStakeholderShares(id: number, value: number): void {
    setStakeholders(prev => prev.map(s => s.id === id ? { ...s, shares: value } : s));
  }
  function updateStakeholderType(id: number, value: Stakeholder["type"]): void {
    setStakeholders(prev => prev.map(s => s.id === id ? { ...s, type: value } : s));
  }
  function updateStakeholderLiqPref(id: number, value: number): void {
    setStakeholders(prev => prev.map(s => s.id === id ? { ...s, liquidationPref: value } : s));
  }
  function updateStakeholderParticipating(id: number, value: boolean): void {
    setStakeholders(prev => prev.map(s => s.id === id ? { ...s, participating: value } : s));
  }

  const downloadCsv = () => {
    const rows: (string | number)[][] = [
      ["Cap Table & Exit Waterfall", `Exit Value: ${fmtCurrency(exitValue)}`],
      [],
      ["Stakeholder", "Shares", "Ownership %", "Type", "Liq Pref (x)", "Participating", "Exit Payout"],
      ...stakeholders.map(s => {
        const w = waterfall.find(w => w.id === s.id);
        return [s.name, s.shares, fmtPct((s.shares / totalShares) * 100), s.type, s.type === "preferred" ? s.liquidationPref : "—", s.type === "preferred" ? (s.participating ? "Yes" : "No") : "—", fmtCurrency(w?.payout ?? 0)];
      }),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "cap-table-waterfall.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const copyText = waterfall.map(w => `${w.name}: ${fmtCurrency(w.payout)} (${fmtPct(w.ownership)})`).join('\n');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex-1 max-w-xs">
          <Label className="text-white/70 text-sm">Exit Valuation ($)</Label>
          <Input data-testid="input-exit-value" type="number" value={exitValue} onChange={e => setExitValue(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={addStakeholder} className="bg-white/10 text-white hover:bg-white/20 border-0" data-testid="button-add-stakeholder">
            <Plus className="w-4 h-4 mr-1" /> Add Stakeholder
          </Button>
          <Button size="sm" onClick={downloadCsv} className="bg-white/10 text-white hover:bg-white/20 border-0" data-testid="button-download-captable">
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left text-white/50 pb-2 font-normal">Name</th>
              <th className="text-right text-white/50 pb-2 font-normal">Shares</th>
              <th className="text-right text-white/50 pb-2 font-normal">%</th>
              <th className="text-left text-white/50 pb-2 font-normal">Type</th>
              <th className="text-right text-white/50 pb-2 font-normal">Liq Pref (x)</th>
              <th className="text-center text-white/50 pb-2 font-normal">Part.</th>
              <th className="text-right text-white/50 pb-2 font-normal">Exit Payout</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {stakeholders.map((s) => {
              const w = waterfall.find(w => w.id === s.id);
              return (
                <tr key={s.id} className="border-b border-white/5" data-testid={`row-stakeholder-${s.id}`}>
                  <td className="py-2 pr-2">
                    <Input value={s.name} onChange={e => updateStakeholderName(s.id, e.target.value)} className="bg-transparent border-0 text-white p-0 h-auto focus-visible:ring-0" />
                  </td>
                  <td className="py-2 pr-2">
                    <Input type="number" value={s.shares} onChange={e => updateStakeholderShares(s.id, +e.target.value)} className="bg-transparent border-0 text-white text-right p-0 h-auto focus-visible:ring-0" />
                  </td>
                  <td className="py-2 pr-2 text-right text-white/60">{totalShares > 0 ? fmtPct((s.shares / totalShares) * 100) : "—"}</td>
                  <td className="py-2 pr-2">
                    <Select value={s.type} onValueChange={(v: Stakeholder["type"]) => updateStakeholderType(s.id, v)}>
                      <SelectTrigger className="bg-[rgb(30,30,30)] border-white/10 text-white h-7 text-xs" data-testid={`select-stakeholder-type-${s.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
                        <SelectItem value="common" className="text-white text-xs">Common</SelectItem>
                        <SelectItem value="preferred" className="text-white text-xs">Preferred</SelectItem>
                        <SelectItem value="option" className="text-white text-xs">Options</SelectItem>
                        <SelectItem value="safe" className="text-white text-xs">SAFE</SelectItem>
                        <SelectItem value="warrant" className="text-white text-xs">Warrant</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-2 pr-2">
                    {s.type === "preferred" ? (
                      <Input type="number" step="0.5" value={s.liquidationPref} onChange={e => updateStakeholderLiqPref(s.id, +e.target.value)} className="bg-transparent border-0 text-white text-right p-0 h-auto focus-visible:ring-0 w-16" />
                    ) : <span className="text-white/30 text-right block">—</span>}
                  </td>
                  <td className="py-2 text-center">
                    {s.type === "preferred" && (
                      <Switch checked={s.participating} onCheckedChange={v => updateStakeholderParticipating(s.id, v)} data-testid={`switch-participating-${s.id}`} />
                    )}
                  </td>
                  <td className="py-2 text-right text-[rgb(142,132,247)] font-medium" data-testid={`text-payout-${s.id}`}>{fmtCurrency(w?.payout ?? 0)}</td>
                  <td className="py-2 pl-2">
                    {stakeholders.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => removeStakeholder(s.id)} className="text-red-400 hover:text-red-300 h-6 w-6 p-0" data-testid={`button-remove-stakeholder-${s.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/20">
              <td className="pt-2 text-white font-medium">Total</td>
              <td className="pt-2 text-right text-white">{totalShares.toLocaleString()}</td>
              <td className="pt-2 text-right text-white">100%</td>
              <td colSpan={3}></td>
              <td className="pt-2 text-right text-white font-medium" data-testid="text-total-payout">{fmtCurrency(exitValue)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={waterfall.map(w => ({ name: w.name, payout: Math.round(w.payout) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
            <YAxis tickFormatter={(v: number) => fmtCurrency(v)} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
            <Tooltip formatter={(v: number) => fmtCurrency(v)} contentStyle={{ background: 'rgb(30,30,30)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }} />
            <Bar dataKey="payout" fill="rgb(142,132,247)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => copy(copyText)} className="bg-white/10 text-white hover:bg-white/20 border-0" data-testid="button-copy-captable">
          {copied ? <CheckCircle className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />} Copy Results
        </Button>
      </div>
    </div>
  );
}

// ─── 3. VC Method Valuation Calculator ───────────────────────────────────────

interface Scenarios { base: number; upside: number; downside: number }

function VCMethodCalc() {
  const [investment, setInvestment] = useState(2000000);
  const [targetOwnership, setTargetOwnership] = useState(20);
  const [holdingYears, setHoldingYears] = useState(5);
  const [scenarios, setScenarios] = useState<Scenarios>({ base: 30000000, upside: 60000000, downside: 15000000 });
  const { copied, copy } = useCopyResults();

  const results = useMemo(() => {
    const ownershipFrac = targetOwnership / 100;
    const preMoneyAtEntry = ownershipFrac > 0 ? investment / ownershipFrac - investment : 0;
    const postMoneyAtEntry = preMoneyAtEntry + investment;

    const calc = (exitVal: number) => {
      const proceeds = exitVal * ownershipFrac;
      const moic = investment > 0 ? proceeds / investment : 0;
      const irr = holdingYears > 0 && moic > 0 ? (Math.pow(moic, 1 / holdingYears) - 1) * 100 : 0;
      return { exitVal, proceeds, moic, irr };
    };

    return {
      preMoneyAtEntry,
      postMoneyAtEntry,
      base: calc(scenarios.base),
      upside: calc(scenarios.upside),
      downside: calc(scenarios.downside),
    };
  }, [investment, targetOwnership, holdingYears, scenarios]);

  const chartData = Array.from({ length: 6 }, (_, i) => {
    const year = i + 1;
    return {
      year: `Y${year}`,
      base: +(investment * Math.pow(Math.max(0, results.base.moic), year / holdingYears) / 1_000_000).toFixed(2),
      upside: +(investment * Math.pow(Math.max(0, results.upside.moic), year / holdingYears) / 1_000_000).toFixed(2),
      downside: +(investment * Math.pow(Math.max(0, results.downside.moic), year / holdingYears) / 1_000_000).toFixed(2),
    };
  });

  const copyText = `VC Method Valuation\nPre-Money at Entry: ${fmtCurrency(results.preMoneyAtEntry)}\nPost-Money at Entry: ${fmtCurrency(results.postMoneyAtEntry)}\nBase: ${fmt(results.base.moic)}x MOIC, ${fmtPct(results.base.irr)} IRR\nUpside: ${fmt(results.upside.moic)}x MOIC, ${fmtPct(results.upside.irr)} IRR\nDownside: ${fmt(results.downside.moic)}x MOIC, ${fmtPct(results.downside.irr)} IRR`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <Label className="text-white/70 text-sm">Investment Amount ($)</Label>
          <Input data-testid="input-vc-investment" type="number" value={investment} onChange={e => setInvestment(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Target Ownership (%)</Label>
          <Input data-testid="input-vc-ownership" type="number" value={targetOwnership} onChange={e => setTargetOwnership(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Holding Period (years)</Label>
          <Input data-testid="input-vc-holding" type="number" value={holdingYears} onChange={e => setHoldingYears(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Base Exit ($)</Label>
          <Input data-testid="input-vc-base" type="number" value={scenarios.base} onChange={e => setScenarios(s => ({ ...s, base: +e.target.value }))} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Upside Exit ($)</Label>
          <Input data-testid="input-vc-upside" type="number" value={scenarios.upside} onChange={e => setScenarios(s => ({ ...s, upside: +e.target.value }))} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Downside Exit ($)</Label>
          <Input data-testid="input-vc-downside" type="number" value={scenarios.downside} onChange={e => setScenarios(s => ({ ...s, downside: +e.target.value }))} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pre-Money", value: fmtCurrency(results.preMoneyAtEntry), color: "text-white" },
          { label: "Post-Money", value: fmtCurrency(results.postMoneyAtEntry), color: "text-white" },
          { label: "Base MOIC", value: `${fmt(results.base.moic)}x`, color: "text-[rgb(142,132,247)]" },
          { label: "Base IRR", value: fmtPct(results.base.irr), color: "text-[rgb(142,132,247)]" },
        ].map((m, i) => (
          <div key={i} className="p-3 bg-white/5 rounded-lg text-center">
            <div className={`text-xl font-light ${m.color}`} data-testid={`text-vc-metric-${i}`}>{m.value}</div>
            <div className="text-white/40 text-xs mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Downside", data: results.downside, color: "text-red-400" },
          { label: "Base", data: results.base, color: "text-[rgb(142,132,247)]" },
          { label: "Upside", data: results.upside, color: "text-green-400" },
        ].map((s, i) => (
          <Card key={i} className="bg-[rgb(25,25,25)] border-white/10">
            <CardContent className="p-4">
              <div className={`text-sm font-medium mb-3 ${s.color}`}>{s.label}</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-white/50">Exit</span><span className="text-white" data-testid={`text-vc-${s.label.toLowerCase()}-exit`}>{fmtCurrency(s.data.exitVal)}</span></div>
                <div className="flex justify-between"><span className="text-white/50">Proceeds</span><span className="text-white">{fmtCurrency(s.data.proceeds)}</span></div>
                <div className="flex justify-between"><span className="text-white/50">MOIC</span><span className={s.color}>{fmt(s.data.moic)}x</span></div>
                <div className="flex justify-between"><span className="text-white/50">IRR</span><span className={s.color}>{fmtPct(s.data.irr)}</span></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="year" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
            <YAxis tickFormatter={(v: number) => `$${v}M`} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
            <Tooltip formatter={(v: number) => `$${v}M`} contentStyle={{ background: 'rgb(30,30,30)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }} />
            <Legend />
            <Line type="monotone" dataKey="upside" stroke="#4ade80" strokeWidth={2} dot={false} name="Upside" />
            <Line type="monotone" dataKey="base" stroke="rgb(142,132,247)" strokeWidth={2} dot={false} name="Base" />
            <Line type="monotone" dataKey="downside" stroke="#f87171" strokeWidth={2} dot={false} name="Downside" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => copy(copyText)} className="bg-white/10 text-white hover:bg-white/20 border-0" data-testid="button-copy-vc">
          {copied ? <CheckCircle className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />} Copy Results
        </Button>
      </div>
    </div>
  );
}

// ─── 4. IRR & MOIC Return Modeller ───────────────────────────────────────────

function IRRMOICCalc() {
  const [entryValuation, setEntryValuation] = useState(10000000);
  const [investment, setInvestment] = useState(2000000);
  const [dilutionPerRound, setDilutionPerRound] = useState(20);
  const [numRounds, setNumRounds] = useState(2);
  const [exitYear, setExitYear] = useState(7);
  const [exitMultiple, setExitMultiple] = useState(5);
  const { copied, copy } = useCopyResults();

  const results = useMemo(() => {
    const ownershipAtEntry = entryValuation > 0 ? investment / entryValuation : 0;
    const dilutionFactor = Math.pow(Math.max(0, 1 - dilutionPerRound / 100), numRounds);
    const ownershipAtExit = ownershipAtEntry * dilutionFactor;
    const exitValuation = entryValuation * exitMultiple;
    const exitProceeds = exitValuation * ownershipAtExit;
    const moic = investment > 0 ? exitProceeds / investment : 0;
    const irr = exitYear > 0 && moic > 0 ? (Math.pow(moic, 1 / exitYear) - 1) * 100 : 0;

    const curve = Array.from({ length: exitYear + 1 }, (_, yr) => {
      const val = investment * Math.pow(Math.max(0, moic), yr / exitYear);
      return { year: `Y${yr}`, value: +(val / 1_000_000).toFixed(2), moic: +(val / investment).toFixed(2) };
    });

    return { ownershipAtEntry: ownershipAtEntry * 100, ownershipAtExit: ownershipAtExit * 100, exitValuation, exitProceeds, moic, irr, curve };
  }, [entryValuation, investment, dilutionPerRound, numRounds, exitYear, exitMultiple]);

  const copyText = `IRR & MOIC Return Model\nEntry Ownership: ${fmtPct(results.ownershipAtEntry)}\nExit Ownership (post-dilution): ${fmtPct(results.ownershipAtExit)}\nExit Valuation: ${fmtCurrency(results.exitValuation)}\nExit Proceeds: ${fmtCurrency(results.exitProceeds)}\nMOIC: ${fmt(results.moic)}x\nIRR: ${fmtPct(results.irr)}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <Label className="text-white/70 text-sm">Entry Valuation ($)</Label>
          <Input data-testid="input-irr-entry" type="number" value={entryValuation} onChange={e => setEntryValuation(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Investment ($)</Label>
          <Input data-testid="input-irr-investment" type="number" value={investment} onChange={e => setInvestment(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Dilution per Follow-on Round (%)</Label>
          <Input data-testid="input-irr-dilution" type="number" value={dilutionPerRound} onChange={e => setDilutionPerRound(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Follow-on Rounds</Label>
          <Input data-testid="input-irr-rounds" type="number" value={numRounds} onChange={e => setNumRounds(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Exit Year</Label>
          <Input data-testid="input-irr-exit-year" type="number" value={exitYear} onChange={e => setExitYear(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Exit Multiple (vs Entry)</Label>
          <Input data-testid="input-irr-multiple" type="number" value={exitMultiple} onChange={e => setExitMultiple(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Entry Ownership", value: fmtPct(results.ownershipAtEntry) },
          { label: "Exit Ownership", value: fmtPct(results.ownershipAtExit) },
          { label: "MOIC", value: `${fmt(results.moic)}x`, accent: true },
          { label: "IRR", value: fmtPct(results.irr), accent: true },
        ].map((m, i) => (
          <div key={i} className="p-3 bg-white/5 rounded-lg text-center">
            <div className={`text-xl font-light ${m.accent ? 'text-[rgb(142,132,247)]' : 'text-white'}`} data-testid={`text-irr-metric-${i}`}>{m.value}</div>
            <div className="text-white/40 text-xs mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={results.curve}>
            <defs>
              <linearGradient id="irrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="rgb(142,132,247)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="rgb(142,132,247)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="year" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
            <YAxis tickFormatter={(v: number) => `$${v}M`} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
            <Tooltip formatter={(v: number, name: string) => name === 'value' ? `$${v}M` : `${v}x`} contentStyle={{ background: 'rgb(30,30,30)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }} />
            <Area type="monotone" dataKey="value" stroke="rgb(142,132,247)" fill="url(#irrGrad)" strokeWidth={2} name="Portfolio Value" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => copy(copyText)} className="bg-white/10 text-white hover:bg-white/20 border-0" data-testid="button-copy-irr">
          {copied ? <CheckCircle className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />} Copy Results
        </Button>
      </div>
    </div>
  );
}

// ─── 5. SAFE & Convertible Note Comparison ───────────────────────────────────
// Conversion price logic:
//   Series A price: user-provided (the new round price per share)
//   Cap price: valCap / preMoneySharesOutstanding
//     preMoneySharesOutstanding = preMoneyValuation / seriesAPPS
//   Discount price: seriesAPPS * (1 - discount%)
//   Conversion price = min(capPrice, discountPrice, seriesAPPS)
//   For conv notes: accruedInterest = principal * rate * (months/12); converts on principal + accrued

interface ConvInstrument {
  id: number;
  name: string;
  kind: "safe" | "note";
  amount: number;
  valCap: number;
  discount: number;
  rate: number;
  maturityMonths: number;
}

function SAFEConvertibleComparison() {
  const [instruments, setInstruments] = useState<ConvInstrument[]>([
    { id: 1, name: "SAFE A", kind: "safe", amount: 500000, valCap: 8000000, discount: 20, rate: 0, maturityMonths: 0 },
    { id: 2, name: "Conv Note", kind: "note", amount: 500000, valCap: 8000000, discount: 20, rate: 8, maturityMonths: 18 },
  ]);
  const [seriesAPPS, setSeriesAPPS] = useState(2);
  const [preMoneySharesOutstanding, setPreMoneySharesOutstanding] = useState(5000000);
  const { copied, copy } = useCopyResults();

  const results = useMemo(() => instruments.map(inst => {
    // Cap price: how much per share the investor gets under the cap
    const capPrice = preMoneySharesOutstanding > 0 ? inst.valCap / preMoneySharesOutstanding : Infinity;
    // Discount price: series A price less the negotiated discount
    const discountPrice = seriesAPPS * (1 - inst.discount / 100);
    // Effective conversion price: lowest of the three (most favourable to investor)
    const conversionPrice = Math.max(0.0001, Math.min(capPrice, discountPrice, seriesAPPS));
    // Accrued interest for convertible notes
    const accrued = inst.kind === "note" ? inst.amount * (inst.rate / 100) * (inst.maturityMonths / 12) : 0;
    // Total principal converted (note: principal + accrued interest; SAFE: just principal)
    const principalConverted = inst.amount + accrued;
    const sharesReceived = principalConverted / conversionPrice;
    return { ...inst, conversionPrice, sharesReceived, accrued, principalConverted };
  }), [instruments, seriesAPPS, preMoneySharesOutstanding]);

  const addInstrument = () => setInstruments(prev => [...prev, { id: Date.now(), name: `Instrument ${prev.length + 1}`, kind: "safe", amount: 250000, valCap: 6000000, discount: 15, rate: 0, maturityMonths: 0 }]);
  const removeInstrument = (id: number) => setInstruments(prev => prev.filter(i => i.id !== id));

  function updateInstrumentName(id: number, value: string): void {
    setInstruments(prev => prev.map(i => i.id === id ? { ...i, name: value } : i));
  }
  function updateInstrumentKind(id: number, value: "safe" | "note"): void {
    setInstruments(prev => prev.map(i => i.id === id ? { ...i, kind: value } : i));
  }
  function updateInstrumentNumber(id: number, field: "amount" | "valCap" | "discount" | "rate" | "maturityMonths", value: number): void {
    setInstruments(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  }

  const copyText = results.map(r => `${r.name} (${r.kind.toUpperCase()}): Conv Price $${r.conversionPrice.toFixed(4)}, Shares ${Math.round(r.sharesReceived).toLocaleString()}`).join('\n');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-white/70 text-sm">Series A Price Per Share ($)</Label>
          <Input data-testid="input-conv-series-a-price" type="number" step="0.01" value={seriesAPPS} onChange={e => setSeriesAPPS(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Pre-Money Shares Outstanding</Label>
          <Input data-testid="input-conv-pre-shares" type="number" value={preMoneySharesOutstanding} onChange={e => setPreMoneySharesOutstanding(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
          <p className="text-white/30 text-xs mt-1">Used to derive the cap price per share</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={addInstrument} className="bg-white/10 text-white hover:bg-white/20 border-0" data-testid="button-add-instrument">
          <Plus className="w-4 h-4 mr-1" /> Add Instrument
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {instruments.map((inst, i) => (
          <Card key={inst.id} className="bg-[rgb(25,25,25)] border-white/10" data-testid={`card-instrument-${inst.id}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Input value={inst.name} onChange={e => updateInstrumentName(inst.id, e.target.value)} className="bg-transparent border-0 text-white font-medium p-0 h-auto focus-visible:ring-0 w-36" />
                <div className="flex items-center gap-2">
                  <Select value={inst.kind} onValueChange={(v: "safe" | "note") => updateInstrumentKind(inst.id, v)}>
                    <SelectTrigger className="bg-[rgb(30,30,30)] border-white/10 text-white h-7 text-xs w-28" data-testid={`select-conv-kind-${inst.id}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
                      <SelectItem value="safe" className="text-white text-xs">SAFE</SelectItem>
                      <SelectItem value="note" className="text-white text-xs">Conv. Note</SelectItem>
                    </SelectContent>
                  </Select>
                  {instruments.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => removeInstrument(inst.id)} className="text-red-400 h-7 w-7 p-0" data-testid={`button-remove-instrument-${inst.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <Label className="text-white/50 text-xs">Amount ($)</Label>
                  <Input type="number" value={inst.amount} onChange={e => updateInstrumentNumber(inst.id, 'amount', +e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white h-8 text-sm mt-1" data-testid={`input-conv-amount-${inst.id}`} />
                </div>
                <div>
                  <Label className="text-white/50 text-xs">Val Cap ($)</Label>
                  <Input type="number" value={inst.valCap} onChange={e => updateInstrumentNumber(inst.id, 'valCap', +e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white h-8 text-sm mt-1" data-testid={`input-conv-cap-${inst.id}`} />
                </div>
                <div>
                  <Label className="text-white/50 text-xs">Discount (%)</Label>
                  <Input type="number" value={inst.discount} onChange={e => updateInstrumentNumber(inst.id, 'discount', +e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white h-8 text-sm mt-1" data-testid={`input-conv-discount-${inst.id}`} />
                </div>
                {inst.kind === "note" && (
                  <>
                    <div>
                      <Label className="text-white/50 text-xs">Interest Rate (%/yr)</Label>
                      <Input type="number" value={inst.rate} onChange={e => updateInstrumentNumber(inst.id, 'rate', +e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white h-8 text-sm mt-1" data-testid={`input-conv-rate-${inst.id}`} />
                    </div>
                    <div>
                      <Label className="text-white/50 text-xs">Maturity (months)</Label>
                      <Input type="number" value={inst.maturityMonths} onChange={e => updateInstrumentNumber(inst.id, 'maturityMonths', +e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white h-8 text-sm mt-1" data-testid={`input-conv-maturity-${inst.id}`} />
                    </div>
                  </>
                )}
              </div>
              <div className="pt-2 border-t border-white/10 space-y-1 text-sm">
                {results[i] && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-white/50">Conversion Price</span>
                      <span className="text-[rgb(142,132,247)] font-medium" data-testid={`text-conv-price-${inst.id}`}>${results[i].conversionPrice.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">Shares Received</span>
                      <span className="text-white">{Math.round(results[i].sharesReceived).toLocaleString()}</span>
                    </div>
                    {inst.kind === "note" && (
                      <div className="flex justify-between">
                        <span className="text-white/50">Accrued Interest</span>
                        <span className="text-white">{fmtCurrency(results[i].accrued)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => copy(copyText)} className="bg-white/10 text-white hover:bg-white/20 border-0" data-testid="button-copy-conv">
          {copied ? <CheckCircle className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />} Copy Results
        </Button>
      </div>
    </div>
  );
}

// ─── 6. Unit Economics Health Check ──────────────────────────────────────────

type TrafficLight = "green" | "yellow" | "red";

function getTrafficLight(value: number, greenThreshold: number, yellowThreshold: number, higherIsBetter: boolean): TrafficLight {
  if (higherIsBetter) {
    if (value >= greenThreshold) return "green";
    if (value >= yellowThreshold) return "yellow";
    return "red";
  } else {
    if (value <= greenThreshold) return "green";
    if (value <= yellowThreshold) return "yellow";
    return "red";
  }
}

function TrafficBadge({ status, label }: { status: TrafficLight; label: string }) {
  const colors: Record<TrafficLight, string> = {
    green: "bg-green-500/20 text-green-400 border-green-500/30",
    yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    red: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const icons: Record<TrafficLight, typeof CheckCircle> = { green: CheckCircle, yellow: AlertCircle, red: XCircle };
  const Icon = icons[status];
  return (
    <Badge className={`${colors[status]} border flex items-center gap-1`} data-testid={`badge-traffic-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <Icon className="w-3 h-3" /> {label}
    </Badge>
  );
}

function UnitEconomicsCalc() {
  const [ltv, setLtv] = useState(12000);
  const [cac, setCac] = useState(2000);
  const [grossMargin, setGrossMargin] = useState(70);
  const [acv, setAcv] = useState(6000);
  const [newMRR, setNewMRR] = useState(50000);
  const [salesMarketingSpend, setSalesMarketingSpend] = useState(100000);
  const { copied, copy } = useCopyResults();

  const results = useMemo(() => {
    const ltvCacRatio = cac > 0 ? ltv / cac : 0;
    const monthlyGrossProfit = acv > 0 && grossMargin > 0 ? (acv * (grossMargin / 100)) / 12 : 0;
    const paybackMonths = monthlyGrossProfit > 0 ? cac / monthlyGrossProfit : Infinity;
    const magicNumber = salesMarketingSpend > 0 ? (newMRR * 4) / salesMarketingSpend : 0;

    return {
      ltvCacRatio,
      paybackMonths,
      magicNumber,
      ltvLight: getTrafficLight(ltvCacRatio, 3, 2, true),
      paybackLight: getTrafficLight(paybackMonths, 12, 18, false),
      magicLight: getTrafficLight(magicNumber, 0.75, 0.5, true),
      marginLight: getTrafficLight(grossMargin, 70, 50, true),
    };
  }, [ltv, cac, grossMargin, acv, newMRR, salesMarketingSpend]);

  const copyText = `Unit Economics Health Check\nLTV: $${ltv}\nCAC: $${cac}\nLTV:CAC Ratio: ${fmt(results.ltvCacRatio)}x\nPayback Period: ${isFinite(results.paybackMonths) ? `${fmt(results.paybackMonths, 1)} months` : "∞"}\nMagic Number: ${fmt(results.magicNumber)}\nGross Margin: ${fmtPct(grossMargin)}`;

  const statusLabel = (light: TrafficLight, good: string, mid: string, bad: string) =>
    light === 'green' ? good : light === 'yellow' ? mid : bad;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <Label className="text-white/70 text-sm">LTV ($)</Label>
          <Input data-testid="input-ue-ltv" type="number" value={ltv} onChange={e => setLtv(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">CAC ($)</Label>
          <Input data-testid="input-ue-cac" type="number" value={cac} onChange={e => setCac(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Gross Margin (%)</Label>
          <Input data-testid="input-ue-margin" type="number" value={grossMargin} onChange={e => setGrossMargin(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">ACV ($)</Label>
          <Input data-testid="input-ue-acv" type="number" value={acv} onChange={e => setAcv(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">New MRR Added ($)</Label>
          <Input data-testid="input-ue-mrr" type="number" value={newMRR} onChange={e => setNewMRR(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">S&M Spend ($)</Label>
          <Input data-testid="input-ue-sm" type="number" value={salesMarketingSpend} onChange={e => setSalesMarketingSpend(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-[rgb(25,25,25)] border-white/10">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-light text-[rgb(142,132,247)] mb-1" data-testid="text-ltv-cac">{fmt(results.ltvCacRatio)}x</div>
            <div className="text-white/40 text-xs mb-2">LTV:CAC Ratio</div>
            <TrafficBadge status={results.ltvLight} label={statusLabel(results.ltvLight, 'Healthy', 'Borderline', 'Unhealthy')} />
            <div className="text-white/30 text-xs mt-2">Target: 3x+</div>
          </CardContent>
        </Card>
        <Card className="bg-[rgb(25,25,25)] border-white/10">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-light text-[rgb(251,194,213)] mb-1" data-testid="text-payback">{isFinite(results.paybackMonths) ? `${fmt(results.paybackMonths, 1)} mo` : "∞"}</div>
            <div className="text-white/40 text-xs mb-2">CAC Payback</div>
            <TrafficBadge status={results.paybackLight} label={statusLabel(results.paybackLight, 'Efficient', 'Moderate', 'Slow')} />
            <div className="text-white/30 text-xs mt-2">Target: &lt;12 mo</div>
          </CardContent>
        </Card>
        <Card className="bg-[rgb(25,25,25)] border-white/10">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-light text-white mb-1" data-testid="text-magic-number">{fmt(results.magicNumber)}</div>
            <div className="text-white/40 text-xs mb-2">Magic Number</div>
            <TrafficBadge status={results.magicLight} label={statusLabel(results.magicLight, 'Efficient', 'Moderate', 'Inefficient')} />
            <div className="text-white/30 text-xs mt-2">Target: 0.75+</div>
          </CardContent>
        </Card>
        <Card className="bg-[rgb(25,25,25)] border-white/10">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-light text-white mb-1" data-testid="text-gross-margin">{fmtPct(grossMargin)}</div>
            <div className="text-white/40 text-xs mb-2">Gross Margin</div>
            <TrafficBadge status={results.marginLight} label={statusLabel(results.marginLight, 'Strong', 'Acceptable', 'Weak')} />
            <div className="text-white/30 text-xs mt-2">Target: 70%+</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => copy(copyText)} className="bg-white/10 text-white hover:bg-white/20 border-0" data-testid="button-copy-ue">
          {copied ? <CheckCircle className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />} Copy Results
        </Button>
      </div>
    </div>
  );
}

// ─── 7. CAC Payback Calculator ────────────────────────────────────────────────

function CACPaybackCalc() {
  const [cac, setCac] = useState(3000);
  const [acv, setAcv] = useState(8400);
  const [grossMargin, setGrossMargin] = useState(75);
  const { copied, copy } = useCopyResults();

  const results = useMemo(() => {
    const monthlyRevenue = acv / 12;
    const monthlyGrossProfit = monthlyRevenue * (grossMargin / 100);
    const paybackMonths = monthlyGrossProfit > 0 ? cac / monthlyGrossProfit : Infinity;

    const timeline = Array.from({ length: 36 }, (_, mo) => ({
      month: `M${mo + 1}`,
      cumulativeGP: +((mo + 1) * monthlyGrossProfit).toFixed(0),
      cac: cac,
    }));

    return { paybackMonths, monthlyRevenue, monthlyGrossProfit, timeline };
  }, [cac, acv, grossMargin]);

  const copyText = `CAC Payback\nCAC: $${cac}\nACV: $${acv}\nGross Margin: ${grossMargin}%\nPayback Period: ${isFinite(results.paybackMonths) ? `${fmt(results.paybackMonths, 1)} months` : "∞"}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label className="text-white/70 text-sm">CAC ($)</Label>
          <Input data-testid="input-cac-cac" type="number" value={cac} onChange={e => setCac(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">ACV ($)</Label>
          <Input data-testid="input-cac-acv" type="number" value={acv} onChange={e => setAcv(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Gross Margin (%)</Label>
          <Input data-testid="input-cac-margin" type="number" value={grossMargin} onChange={e => setGrossMargin(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <div className="text-2xl font-light text-[rgb(142,132,247)]" data-testid="text-cac-payback">{isFinite(results.paybackMonths) ? `${fmt(results.paybackMonths, 1)} mo` : "∞"}</div>
          <div className="text-white/40 text-xs mt-1">Payback Period</div>
        </div>
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <div className="text-2xl font-light text-white">{fmtCurrency(results.monthlyRevenue)}</div>
          <div className="text-white/40 text-xs mt-1">Monthly Revenue</div>
        </div>
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <div className="text-2xl font-light text-white">{fmtCurrency(results.monthlyGrossProfit)}</div>
          <div className="text-white/40 text-xs mt-1">Monthly Gross Profit</div>
        </div>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={results.timeline}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} interval={5} />
            <YAxis tickFormatter={(v: number) => `$${v.toLocaleString()}`} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
            <Tooltip formatter={(v: number) => `$${(+v).toLocaleString()}`} contentStyle={{ background: 'rgb(30,30,30)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }} />
            <Legend />
            <Line type="monotone" dataKey="cumulativeGP" stroke="rgb(142,132,247)" strokeWidth={2} dot={false} name="Cumulative Gross Profit" />
            <Line type="monotone" dataKey="cac" stroke="rgb(251,194,213)" strokeWidth={2} strokeDasharray="5 5" dot={false} name="CAC" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => copy(copyText)} className="bg-white/10 text-white hover:bg-white/20 border-0" data-testid="button-copy-cac">
          {copied ? <CheckCircle className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />} Copy Results
        </Button>
      </div>
    </div>
  );
}

// ─── 8. Runway & Burn Calculator ─────────────────────────────────────────────

interface RunwayToggles { hiring: boolean; cuts: boolean; revenueBoost: boolean }

function RunwayBurnCalc() {
  const [cashBalance, setCashBalance] = useState(2000000);
  const [monthlyBurn, setMonthlyBurn] = useState(150000);
  const [monthlyRevenue, setMonthlyRevenue] = useState(40000);
  const [toggles, setToggles] = useState<RunwayToggles>({ hiring: false, cuts: false, revenueBoost: false });
  const [hiringCost, setHiringCost] = useState(30000);
  const [cutAmount, setCutAmount] = useState(20000);
  const [revenueBoostPct, setRevenueBoostPct] = useState(20);
  const { copied, copy } = useCopyResults();

  const results = useMemo(() => {
    let adjustedBurn = monthlyBurn;
    let adjustedRevenue = monthlyRevenue;
    if (toggles.hiring) adjustedBurn += hiringCost;
    if (toggles.cuts) adjustedBurn = Math.max(0, adjustedBurn - cutAmount);
    if (toggles.revenueBoost) adjustedRevenue = adjustedRevenue * (1 + revenueBoostPct / 100);
    const netBurn = Math.max(0, adjustedBurn - adjustedRevenue);
    const runwayMonths = netBurn > 0 ? cashBalance / netBurn : Infinity;

    const baseNetBurn = Math.max(0, monthlyBurn - monthlyRevenue);
    const months = Math.min(isFinite(runwayMonths) ? Math.ceil(runwayMonths) + 3 : 24, 36);
    const timeline = Array.from({ length: months }, (_, i) => ({
      month: `M${i + 1}`,
      cash: Math.max(0, cashBalance - netBurn * (i + 1)),
      base: Math.max(0, cashBalance - baseNetBurn * (i + 1)),
    }));

    return { adjustedBurn, adjustedRevenue, netBurn, runwayMonths, timeline };
  }, [cashBalance, monthlyBurn, monthlyRevenue, toggles, hiringCost, cutAmount, revenueBoostPct]);

  const copyText = `Runway & Burn\nCash Balance: ${fmtCurrency(cashBalance)}\nAdjusted Monthly Burn: ${fmtCurrency(results.adjustedBurn)}\nAdjusted Monthly Revenue: ${fmtCurrency(results.adjustedRevenue)}\nNet Burn: ${fmtCurrency(results.netBurn)}\nRunway: ${isFinite(results.runwayMonths) ? `${fmt(results.runwayMonths, 1)} months` : 'Cash-flow positive'}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label className="text-white/70 text-sm">Cash Balance ($)</Label>
          <Input data-testid="input-runway-cash" type="number" value={cashBalance} onChange={e => setCashBalance(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Monthly Burn ($)</Label>
          <Input data-testid="input-runway-burn" type="number" value={monthlyBurn} onChange={e => setMonthlyBurn(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Monthly Revenue ($)</Label>
          <Input data-testid="input-runway-revenue" type="number" value={monthlyRevenue} onChange={e => setMonthlyRevenue(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
      </div>

      <Card className="bg-[rgb(25,25,25)] border-white/10">
        <CardContent className="p-4">
          <h3 className="text-white/70 text-sm mb-3 font-medium">"What If" Toggles</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch checked={toggles.hiring} onCheckedChange={v => setToggles(t => ({ ...t, hiring: v }))} data-testid="switch-hiring" />
                <span className="text-white text-sm">New Hire (+)</span>
              </div>
              {toggles.hiring && (
                <Input data-testid="input-hiring-cost" type="number" value={hiringCost} onChange={e => setHiringCost(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white h-8 text-sm w-36" placeholder="Monthly cost" />
              )}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch checked={toggles.cuts} onCheckedChange={v => setToggles(t => ({ ...t, cuts: v }))} data-testid="switch-cuts" />
                <span className="text-white text-sm">Cost Cuts (−)</span>
              </div>
              {toggles.cuts && (
                <Input data-testid="input-cut-amount" type="number" value={cutAmount} onChange={e => setCutAmount(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white h-8 text-sm w-36" placeholder="Monthly savings" />
              )}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch checked={toggles.revenueBoost} onCheckedChange={v => setToggles(t => ({ ...t, revenueBoost: v }))} data-testid="switch-revenue-boost" />
                <span className="text-white text-sm">Revenue Boost (+%)</span>
              </div>
              {toggles.revenueBoost && (
                <Input data-testid="input-revenue-boost" type="number" value={revenueBoostPct} onChange={e => setRevenueBoostPct(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white h-8 text-sm w-36" placeholder="% increase" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <div className={`text-2xl font-light ${!isFinite(results.runwayMonths) ? 'text-green-400' : results.runwayMonths < 6 ? 'text-red-400' : results.runwayMonths < 12 ? 'text-yellow-400' : 'text-[rgb(142,132,247)]'}`} data-testid="text-runway-months">
            {isFinite(results.runwayMonths) ? `${fmt(results.runwayMonths, 1)} mo` : "Cash+ ∞"}
          </div>
          <div className="text-white/40 text-xs mt-1">Runway</div>
        </div>
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <div className="text-2xl font-light text-[rgb(251,194,213)]">{fmtCurrency(results.netBurn)}</div>
          <div className="text-white/40 text-xs mt-1">Net Burn / Month</div>
        </div>
        <div className="p-4 bg-white/5 rounded-lg text-center">
          <div className="text-2xl font-light text-white">{fmtCurrency(results.adjustedRevenue)}</div>
          <div className="text-white/40 text-xs mt-1">Adj. Monthly Revenue</div>
        </div>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={results.timeline}>
            <defs>
              <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="rgb(142,132,247)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="rgb(142,132,247)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} interval={4} />
            <YAxis tickFormatter={(v: number) => fmtCurrency(v)} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} />
            <Tooltip formatter={(v: number) => fmtCurrency(v)} contentStyle={{ background: 'rgb(30,30,30)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }} />
            <Legend />
            <Area type="monotone" dataKey="cash" stroke="rgb(142,132,247)" fill="url(#cashGrad)" strokeWidth={2} name="Adjusted Scenario" />
            <Area type="monotone" dataKey="base" stroke="rgb(251,194,213)" fill="none" strokeWidth={1.5} strokeDasharray="4 4" name="Base Case" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => copy(copyText)} className="bg-white/10 text-white hover:bg-white/20 border-0" data-testid="button-copy-runway">
          {copied ? <CheckCircle className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />} Copy Results
        </Button>
      </div>
    </div>
  );
}

// ─── 9. Scenario Fundraising Planner ─────────────────────────────────────────

function FundraisingPlannerCalc() {
  const [currentCash, setCurrentCash] = useState(500000);
  const [monthlyBurn, setMonthlyBurn] = useState(120000);
  const [monthlyRevenue, setMonthlyRevenue] = useState(30000);
  const [preMoneyVal, setPreMoneyVal] = useState(8000000);
  const { copied, copy } = useCopyResults();

  const scenarios = useMemo(() => {
    const netBurn = Math.max(0, monthlyBurn - monthlyRevenue);
    return [500000, 1000000, 1500000, 2000000, 3000000, 5000000].map(raise => {
      const totalCash = currentCash + raise;
      const runwayMonths = netBurn > 0 ? totalCash / netBurn : 999;
      const dilution = preMoneyVal > 0 ? (raise / (preMoneyVal + raise)) * 100 : 0;
      const sufficient = runwayMonths >= 18;
      return { raise, runwayMonths, dilution, sufficient };
    });
  }, [currentCash, monthlyBurn, monthlyRevenue, preMoneyVal]);

  const optimal = scenarios.find(s => s.sufficient);

  const copyText = `Fundraising Planner\n${scenarios.map(s => `Raise ${fmtCurrency(s.raise)}: ${fmt(s.runwayMonths, 1)} mo runway, ${fmtPct(s.dilution)} dilution`).join('\n')}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <Label className="text-white/70 text-sm">Current Cash ($)</Label>
          <Input data-testid="input-fp-cash" type="number" value={currentCash} onChange={e => setCurrentCash(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Monthly Burn ($)</Label>
          <Input data-testid="input-fp-burn" type="number" value={monthlyBurn} onChange={e => setMonthlyBurn(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Monthly Revenue ($)</Label>
          <Input data-testid="input-fp-revenue" type="number" value={monthlyRevenue} onChange={e => setMonthlyRevenue(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
        <div>
          <Label className="text-white/70 text-sm">Pre-Money Valuation ($)</Label>
          <Input data-testid="input-fp-premoney" type="number" value={preMoneyVal} onChange={e => setPreMoneyVal(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
        </div>
      </div>

      {optimal && (
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-300" data-testid="text-fp-optimal">
          ✓ Minimum raise for 18+ month runway: <strong>{fmtCurrency(optimal.raise)}</strong> ({fmtPct(optimal.dilution)} dilution, {fmt(optimal.runwayMonths, 1)} months)
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left text-white/50 pb-2 font-normal">Raise Amount</th>
              <th className="text-right text-white/50 pb-2 font-normal">Runway</th>
              <th className="text-right text-white/50 pb-2 font-normal">Dilution</th>
              <th className="text-right text-white/50 pb-2 font-normal">Post-Money</th>
              <th className="text-center text-white/50 pb-2 font-normal">18+ Months?</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s, i) => (
              <tr key={i} className={`border-b border-white/5 ${s === optimal ? 'bg-green-500/5' : ''}`} data-testid={`row-fp-scenario-${i}`}>
                <td className="py-2 text-white font-medium">{fmtCurrency(s.raise)}</td>
                <td className={`py-2 text-right ${s.runwayMonths < 12 ? 'text-red-400' : s.runwayMonths < 18 ? 'text-yellow-400' : 'text-green-400'}`}>{fmt(s.runwayMonths, 1)} mo</td>
                <td className="py-2 text-right text-white">{fmtPct(s.dilution)}</td>
                <td className="py-2 text-right text-white/70">{fmtCurrency(preMoneyVal + s.raise)}</td>
                <td className="py-2 text-center">{s.sufficient ? <CheckCircle className="w-4 h-4 text-green-400 mx-auto" /> : <XCircle className="w-4 h-4 text-red-400 mx-auto" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={scenarios.map(s => ({ raise: fmtCurrency(s.raise), runway: parseFloat(fmt(s.runwayMonths, 1)), dilution: parseFloat(fmtPct(s.dilution)) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="raise" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} />
            <YAxis yAxisId="left" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} label={{ value: 'Months', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} label={{ value: 'Dilution %', angle: 90, position: 'insideRight', fill: 'rgba(255,255,255,0.3)', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: 'rgb(30,30,30)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }} />
            <Legend />
            <Bar yAxisId="left" dataKey="runway" fill="rgb(142,132,247)" radius={[4, 4, 0, 0]} name="Runway (months)" />
            <Bar yAxisId="right" dataKey="dilution" fill="rgb(251,194,213)" radius={[4, 4, 0, 0]} name="Dilution %" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => copy(copyText)} className="bg-white/10 text-white hover:bg-white/20 border-0" data-testid="button-copy-fp">
          {copied ? <CheckCircle className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />} Copy Results
        </Button>
      </div>
    </div>
  );
}

// ─── 10. QSBS Eligibility Calculator ─────────────────────────────────────────

function QSBSCalc() {
  const [isCCorp, setIsCCorp] = useState(true);
  const [grossAssets, setGrossAssets] = useState(30000000);
  const [isActiveBusiness, setIsActiveBusiness] = useState(true);
  const [holdingYears, setHoldingYears] = useState(6);
  const [investmentAmount, setInvestmentAmount] = useState(500000);
  const [acquiredAfter2010, setAcquiredAfter2010] = useState(true);
  const { copied, copy } = useCopyResults();

  const results = useMemo(() => {
    const checks = {
      cCorp: isCCorp,
      grossAssets: grossAssets <= 50_000_000,
      activeBusiness: isActiveBusiness,
      holdingPeriod: holdingYears >= 5,
      acquisitionDate: acquiredAfter2010,
    };
    const allPass = Object.values(checks).every(Boolean);
    // 100% exclusion for stock acquired after 9/27/2010 held 5+ years
    // 50% exclusion for stock acquired between 2/18/2009 and 9/27/2010
    const exclusionRate = acquiredAfter2010 ? 1.0 : holdingYears >= 5 ? 0.5 : 0;
    // Gain excluded: greater of 10x investment or $10M, multiplied by exclusion rate
    const maxExcludableGain = Math.max(investmentAmount * 10, 10_000_000);
    const excludableGain = allPass ? maxExcludableGain * exclusionRate : 0;
    // Federal tax savings: 20% capital gains + 3.8% NIIT = 23.8%
    const taxSavings = excludableGain * 0.238;

    return { checks, allPass, excludableGain, taxSavings, maxExcludableGain };
  }, [isCCorp, grossAssets, isActiveBusiness, holdingYears, investmentAmount, acquiredAfter2010]);

  const copyText = `QSBS Eligibility\nEligible: ${results.allPass ? 'YES' : 'NO'}\nMax Excludable Gain: ${fmtCurrency(results.maxExcludableGain)}\nActual Excludable Gain: ${fmtCurrency(results.excludableGain)}\nEstimated Tax Savings: ${fmtCurrency(results.taxSavings)}`;

  const CheckRow = ({ label, pass }: { label: string; pass: boolean }) => (
    <div className="flex items-center justify-between py-2 border-b border-white/5">
      <span className="text-white/70 text-sm">{label}</span>
      {pass ? <CheckCircle className="w-5 h-5 text-green-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-white/70 text-sm">C-Corp Status</Label>
            <Switch checked={isCCorp} onCheckedChange={setIsCCorp} data-testid="switch-qsbs-ccorp" />
          </div>
          <div>
            <Label className="text-white/70 text-sm">Gross Assets at Time of Issuance ($)</Label>
            <Input data-testid="input-qsbs-assets" type="number" value={grossAssets} onChange={e => setGrossAssets(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
            <p className="text-white/30 text-xs mt-1">Must be under $50M for QSBS eligibility</p>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-white/70 text-sm">Active Business (non-professional services)</Label>
            <Switch checked={isActiveBusiness} onCheckedChange={setIsActiveBusiness} data-testid="switch-qsbs-active" />
          </div>
          <div>
            <Label className="text-white/70 text-sm">Holding Period (years)</Label>
            <Input data-testid="input-qsbs-holding" type="number" value={holdingYears} onChange={e => setHoldingYears(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
            <p className="text-white/30 text-xs mt-1">Must hold 5+ years for full exclusion</p>
          </div>
          <div>
            <Label className="text-white/70 text-sm">Investment Amount ($)</Label>
            <Input data-testid="input-qsbs-investment" type="number" value={investmentAmount} onChange={e => setInvestmentAmount(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-white/70 text-sm">Stock Acquired After 9/27/2010</Label>
            <Switch checked={acquiredAfter2010} onCheckedChange={setAcquiredAfter2010} data-testid="switch-qsbs-2010" />
          </div>
        </div>

        <div className="space-y-4">
          <Card className={`border ${results.allPass ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                {results.allPass ? <CheckCircle className="w-5 h-5 text-green-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
                <span className={`font-semibold ${results.allPass ? 'text-green-400' : 'text-red-400'}`} data-testid="text-qsbs-eligible">
                  {results.allPass ? 'QSBS Eligible' : 'Not Eligible'}
                </span>
              </div>
              <CheckRow label="C-Corporation" pass={results.checks.cCorp} />
              <CheckRow label="Gross Assets ≤ $50M at Issuance" pass={results.checks.grossAssets} />
              <CheckRow label="Active Business" pass={results.checks.activeBusiness} />
              <CheckRow label="5+ Year Holding Period" pass={results.checks.holdingPeriod} />
              <CheckRow label="Acquired After 9/27/2010" pass={results.checks.acquisitionDate} />
            </CardContent>
          </Card>

          {results.allPass && (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-white/5 rounded-lg text-center">
                <div className="text-xl font-light text-green-400" data-testid="text-qsbs-gain">{fmtCurrency(results.excludableGain)}</div>
                <div className="text-white/40 text-xs mt-1">Excludable Gain</div>
              </div>
              <div className="p-4 bg-white/5 rounded-lg text-center">
                <div className="text-xl font-light text-[rgb(142,132,247)]" data-testid="text-qsbs-savings">{fmtCurrency(results.taxSavings)}</div>
                <div className="text-white/40 text-xs mt-1">Est. Tax Savings (23.8%)</div>
              </div>
            </div>
          )}

          <p className="text-white/30 text-xs">Disclaimer: Simplified eligibility check only. Consult a tax attorney for Section 1202 QSBS advice.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => copy(copyText)} className="bg-white/10 text-white hover:bg-white/20 border-0" data-testid="button-copy-qsbs">
          {copied ? <CheckCircle className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />} Copy Results
        </Button>
      </div>
    </div>
  );
}

// ─── 11. TAM/SAM/SOM Calculator ──────────────────────────────────────────────

type MarketSizingMode = "topdown" | "bottomup";

function TAMSAMSOMCalc() {
  const [mode, setMode] = useState<MarketSizingMode>("topdown");
  const [tam, setTam] = useState(50_000_000_000);
  const [samPct, setSamPct] = useState(10);
  const [somPct, setSomPct] = useState(2);
  const [targetCustomers, setTargetCustomers] = useState(10000);
  const [avgRevPerCustomer, setAvgRevPerCustomer] = useState(1200);
  const [marketPenetration, setMarketPenetration] = useState(5);
  const { copied, copy } = useCopyResults();

  const results = useMemo(() => {
    if (mode === "topdown") {
      const sam = tam * (samPct / 100);
      const som = sam * (somPct / 100);
      return { tam, sam, som };
    } else {
      const sam = targetCustomers * avgRevPerCustomer;
      const som = sam * (marketPenetration / 100);
      const impliedTam = sam * 10;
      return { tam: impliedTam, sam, som };
    }
  }, [mode, tam, samPct, somPct, targetCustomers, avgRevPerCustomer, marketPenetration]);

  const summaryParagraph = `Our Total Addressable Market (TAM) is ${fmtCurrency(results.tam)}, representing the full market opportunity. Our Serviceable Addressable Market (SAM) of ${fmtCurrency(results.sam)} reflects the segment we can realistically reach with our current product and channels. In Year 1-3, we are targeting a Serviceable Obtainable Market (SOM) of ${fmtCurrency(results.som)}, which represents our realistic capture based on ${mode === 'topdown' ? `${somPct}% penetration of our SAM` : `${marketPenetration}% penetration of ${targetCustomers.toLocaleString()} target customers at ${fmtCurrency(avgRevPerCustomer)} ACV`}.`;

  const copyText = `TAM/SAM/SOM Market Sizing\nTAM: ${fmtCurrency(results.tam)}\nSAM: ${fmtCurrency(results.sam)}\nSOM: ${fmtCurrency(results.som)}\n\n${summaryParagraph}`;

  const tamRadius = 120;
  const samRadius = results.tam > 0 ? tamRadius * Math.sqrt(Math.min(results.sam / results.tam, 1)) : 0;
  const somRadius = results.tam > 0 ? tamRadius * Math.sqrt(Math.min(results.som / results.tam, 1)) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-2">
        <span className="text-white/60 text-sm">Mode:</span>
        <Button size="sm" onClick={() => setMode("topdown")} className={`border-0 text-sm ${mode === 'topdown' ? 'bg-[rgb(142,132,247)] text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`} data-testid="button-mode-topdown">Top-Down</Button>
        <Button size="sm" onClick={() => setMode("bottomup")} className={`border-0 text-sm ${mode === 'bottomup' ? 'bg-[rgb(142,132,247)] text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`} data-testid="button-mode-bottomup">Bottom-Up</Button>
      </div>

      {mode === "topdown" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-white/70 text-sm">TAM ($)</Label>
            <Input data-testid="input-tam-total" type="number" value={tam} onChange={e => setTam(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
          </div>
          <div>
            <Label className="text-white/70 text-sm">SAM (% of TAM)</Label>
            <Input data-testid="input-tam-sam-pct" type="number" value={samPct} onChange={e => setSamPct(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
          </div>
          <div>
            <Label className="text-white/70 text-sm">SOM (% of SAM)</Label>
            <Input data-testid="input-tam-som-pct" type="number" value={somPct} onChange={e => setSomPct(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-white/70 text-sm">Target Customers</Label>
            <Input data-testid="input-tam-customers" type="number" value={targetCustomers} onChange={e => setTargetCustomers(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
          </div>
          <div>
            <Label className="text-white/70 text-sm">Avg Revenue / Customer ($)</Label>
            <Input data-testid="input-tam-arpu" type="number" value={avgRevPerCustomer} onChange={e => setAvgRevPerCustomer(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
          </div>
          <div>
            <Label className="text-white/70 text-sm">Market Penetration (%)</Label>
            <Input data-testid="input-tam-penetration" type="number" value={marketPenetration} onChange={e => setMarketPenetration(+e.target.value)} className="bg-[rgb(30,30,30)] border-white/10 text-white mt-1" />
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row items-center gap-6">
        <svg viewBox="0 0 260 260" className="w-48 h-48 flex-shrink-0" aria-label="TAM SAM SOM concentric circles">
          <circle cx="130" cy="130" r={tamRadius} fill="rgba(142,132,247,0.15)" stroke="rgb(142,132,247)" strokeWidth="1.5" />
          <circle cx="130" cy="130" r={Math.max(samRadius, 4)} fill="rgba(251,194,213,0.2)" stroke="rgb(251,194,213)" strokeWidth="1.5" />
          <circle cx="130" cy="130" r={Math.max(somRadius, 4)} fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
          <text x="130" y="40" textAnchor="middle" fill="rgb(142,132,247)" fontSize="10" fontWeight="500">TAM</text>
          <text x="130" y="52" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="9">{fmtCurrency(results.tam)}</text>
        </svg>
        <div className="flex-1 space-y-3">
          {([
            { label: "TAM", val: results.tam, color: "text-[rgb(142,132,247)]", desc: "Total Addressable Market" },
            { label: "SAM", val: results.sam, color: "text-[rgb(251,194,213)]", desc: "Serviceable Addressable Market" },
            { label: "SOM", val: results.som, color: "text-white", desc: "Serviceable Obtainable Market" },
          ] as const).map((m, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
              <div>
                <div className="text-white/50 text-xs">{m.desc}</div>
                <div className={`text-lg font-light ${m.color}`} data-testid={`text-tam-${m.label.toLowerCase()}`}>{fmtCurrency(m.val)}</div>
              </div>
              <Badge className="bg-white/10 text-white/50 border-0 text-xs">{m.label}</Badge>
            </div>
          ))}
        </div>
      </div>

      <Card className="bg-[rgb(25,25,25)] border-white/10">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-white/70 text-sm font-medium">Pitch-Ready Summary</h3>
            <Button size="sm" onClick={() => copy(copyText)} className="bg-white/10 text-white hover:bg-white/20 border-0" data-testid="button-copy-tam">
              {copied ? <CheckCircle className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />} Copy
            </Button>
          </div>
          <p className="text-white/60 text-sm leading-relaxed" data-testid="text-tam-summary">{summaryParagraph}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const CALCULATORS = [
  { id: "safe", label: "SAFE Dilution", icon: Shield, description: "Model SAFE conversion & founder dilution", component: SafeDilutionCalc },
  { id: "captable", label: "Cap Table & Waterfall", icon: Users, description: "Stakeholder table, exit waterfall & CSV", component: CapTableCalc },
  { id: "vc-method", label: "VC Method Valuation", icon: TrendingUp, description: "Pre/post money, MOIC & IRR by scenario", component: VCMethodCalc },
  { id: "irr-moic", label: "IRR & MOIC Modeller", icon: BarChart3, description: "Return curves with dilution modelling", component: IRRMOICCalc },
  { id: "conv-compare", label: "SAFE vs Conv Note", icon: DollarSign, description: "Side-by-side conversion comparison", component: SAFEConvertibleComparison },
  { id: "unit-econ", label: "Unit Economics", icon: PieChart, description: "LTV:CAC, Magic Number, payback scoring", component: UnitEconomicsCalc },
  { id: "cac-payback", label: "CAC Payback", icon: Calculator, description: "Break-even timeline & payback chart", component: CACPaybackCalc },
  { id: "runway", label: "Runway & Burn", icon: TrendingUp, description: "Real-time runway with what-if toggles", component: RunwayBurnCalc },
  { id: "fundraising", label: "Fundraising Planner", icon: DollarSign, description: "Optimal raise size vs dilution vs runway", component: FundraisingPlannerCalc },
  { id: "qsbs", label: "QSBS Eligibility", icon: Shield, description: "Section 1202 tax exclusion calculator", component: QSBSCalc },
  { id: "tam", label: "TAM/SAM/SOM", icon: Globe, description: "Market sizing with visual breakdown", component: TAMSAMSOMCalc },
] as const;

type CalcId = typeof CALCULATORS[number]["id"];

export default function FinancialTools() {
  const [activeCalc, setActiveCalc] = useState<CalcId>("safe");
  const active = CALCULATORS.find(c => c.id === activeCalc)!;
  const ActiveComponent = active.component;

  return (
    <AppLayout
      title="Financial Tools"
      subtitle="11 essential calculators for founders and investors"
      showHero={true}
      heroHeight="40vh"
      videoUrl={videoBackgrounds.lpFunds}
    >
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-6">
          <aside className="lg:w-64 flex-shrink-0">
            <div className="sticky top-24 space-y-1">
              {CALCULATORS.map(calc => {
                const Icon = calc.icon;
                const isActive = activeCalc === calc.id;
                return (
                  <button
                    key={calc.id}
                    onClick={() => setActiveCalc(calc.id)}
                    data-testid={`button-calc-${calc.id}`}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all ${
                      isActive
                        ? 'bg-[rgb(142,132,247)]/15 border border-[rgb(142,132,247)]/30 text-white'
                        : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isActive ? 'text-[rgb(142,132,247)]' : ''}`} />
                    <div>
                      <div className={`text-sm font-medium leading-tight ${isActive ? 'text-white' : ''}`}>{calc.label}</div>
                      <div className="text-xs text-white/30 mt-0.5 leading-tight">{calc.description}</div>
                    </div>
                    {isActive && <ChevronRight className="w-4 h-4 text-[rgb(142,132,247)] ml-auto flex-shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="flex-1 min-w-0">
            <Card className="bg-[rgb(22,22,22)] border-white/10">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[rgb(142,132,247)]/15">
                    <active.icon className="w-5 h-5 text-[rgb(142,132,247)]" />
                  </div>
                  <div>
                    <CardTitle className="text-white text-lg font-light" data-testid="text-calc-title">{active.label}</CardTitle>
                    <CardDescription className="text-white/40 text-sm">{active.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ActiveComponent />
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    </AppLayout>
  );
}
