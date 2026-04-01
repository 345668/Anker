import { useState, useMemo } from "react";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp, BarChart3, DollarSign, Building2, Layers,
  Plus, Trash2, Copy, ChevronRight, Users, Briefcase, Globe,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from "recharts";
import { useToast } from "@/hooks/use-toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number, d = 2): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtC(n: number): string {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtPct(n: number): string {
  if (!isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}
function irr(cashflows: number[], guess = 0.1): number {
  for (let i = 0; i < 100; i++) {
    const pv = cashflows.reduce((s, c, t) => s + c / Math.pow(1 + guess, t), 0);
    const dpv = cashflows.reduce((s, c, t) => s - (t * c) / Math.pow(1 + guess, t + 1), 0);
    const next = guess - pv / dpv;
    if (Math.abs(next - guess) < 1e-6) return next;
    guess = next;
  }
  return guess;
}
const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#8b5cf6", "#14b8a6"];

// ─── Types ────────────────────────────────────────────────────────────────────
interface PortfolioCompany {
  id: number;
  name: string;
  invested: number;
  currentValue: number;
  stage: string;
  sector: string;
  date: string;
}
interface LPCommitment {
  id: number;
  name: string;
  commitment: number;
  quarter: string;
}
interface SubFund {
  id: number;
  name: string;
  committedCapital: number;
  nav: number;
  dpi: number;
}

// ─── SECTION 1: VC Portfolio KPI Dashboard ───────────────────────────────────
function VCPortfolioDashboard() {
  const [companies, setCompanies] = useState<PortfolioCompany[]>([
    { id: 1, name: "AlphaTech", invested: 500000, currentValue: 1800000, stage: "Series A", sector: "SaaS", date: "2022-03" },
    { id: 2, name: "BetaHealth", invested: 250000, currentValue: 900000, stage: "Seed", sector: "HealthTech", date: "2021-08" },
    { id: 3, name: "GammaAI", invested: 750000, currentValue: 400000, stage: "Seed", sector: "AI/ML", date: "2023-01" },
  ]);
  const [fundSize, setFundSize] = useState(10000000);
  const { toast } = useToast();

  const addCompany = () => setCompanies(p => [...p, { id: Date.now(), name: "", invested: 0, currentValue: 0, stage: "Seed", sector: "", date: new Date().toISOString().slice(0,7) }]);
  const del = (id: number) => setCompanies(p => p.filter(c => c.id !== id));
  const upd = (id: number, k: keyof PortfolioCompany, v: string | number) =>
    setCompanies(p => p.map(c => c.id === id ? { ...c, [k]: v } : c));

  const totalInvested = useMemo(() => companies.reduce((s, c) => s + c.invested, 0), [companies]);
  const totalNav = useMemo(() => companies.reduce((s, c) => s + c.currentValue, 0), [companies]);
  const moic = totalInvested > 0 ? totalNav / totalInvested : 0;
  const tvpi = totalInvested > 0 ? totalNav / totalInvested : 0;
  const dpi = 0;
  const deployed = fundSize > 0 ? (totalInvested / fundSize) * 100 : 0;
  const reserveRatio = fundSize > 0 ? ((fundSize - totalInvested) / fundSize) * 100 : 0;

  const cashflows = useMemo(() => {
    const byYear: Record<number, number> = { 0: -totalInvested };
    const currentYear = new Date().getFullYear();
    byYear[currentYear - 2020] = (byYear[currentYear - 2020] || 0) + totalNav;
    return Object.keys(byYear).sort((a, b) => Number(a) - Number(b)).map(y => byYear[Number(y)]);
  }, [totalInvested, totalNav]);
  const irrVal = cashflows.length > 1 ? irr(cashflows) * 100 : 0;

  const sectorData = useMemo(() => {
    const map: Record<string, number> = {};
    companies.forEach(c => { map[c.sector || "Other"] = (map[c.sector || "Other"] || 0) + c.currentValue; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [companies]);

  const copy = () => {
    const txt = `NAV: ${fmtC(totalNav)} | MOIC: ${fmt(moic)}x | TVPI: ${fmt(tvpi)}x | DPI: ${fmt(dpi)}x | IRR: ${fmtPct(irrVal)}`;
    navigator.clipboard.writeText(txt);
    toast({ title: "Copied", description: txt });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">VC Portfolio KPI Dashboard</h2>
          <p className="text-sm text-white/50 mt-1">Enter portfolio companies and track fund performance metrics</p>
        </div>
        <Button variant="outline" size="sm" onClick={copy} className="gap-2 border-white/20 text-white/70 hover:text-white">
          <Copy className="h-4 w-4" /> Copy KPIs
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "NAV", value: fmtC(totalNav), sub: `${companies.length} companies` },
          { label: "MOIC", value: `${fmt(moic)}x`, sub: `${fmtC(totalInvested)} invested` },
          { label: "TVPI", value: `${fmt(tvpi)}x`, sub: "Total Value / Paid-In" },
          { label: "DPI", value: `${fmt(dpi)}x`, sub: "Distributions / Paid-In" },
          { label: "IRR (est.)", value: fmtPct(irrVal), sub: "Annualized return" },
        ].map(m => (
          <Card key={m.label} className="bg-white/5 border-white/10">
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-white/50 mb-1">{m.label}</div>
              <div className="text-2xl font-bold text-white">{m.value}</div>
              <div className="text-xs text-white/40 mt-1">{m.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-white/70">Fund Size ($)</Label>
            <Input value={fundSize} type="number" onChange={e => setFundSize(Number(e.target.value))}
              className="w-36 text-right bg-white/5 border-white/20 text-white" />
          </div>
          <div className="text-xs text-white/50">Deployed: {fmtPct(deployed)} | Reserve: {fmtPct(reserveRatio)}</div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${Math.min(deployed, 100)}%` }} />
          </div>
        </div>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4">
            <div className="text-xs text-white/50 mb-2">Portfolio by Sector (NAV)</div>
            <ResponsiveContainer width="100%" height={100}>
              <PieChart>
                <Pie data={sectorData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={40}>
                  {sectorData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtC(v)} contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 text-xs text-white/40 px-1 pb-1 border-b border-white/10">
          {["Company", "Invested", "Current Value", "MOIC", "Stage", "Sector", "Date", ""].map(h => (
            <div key={h} className={h === "Company" ? "col-span-2" : h === "" ? "col-span-1" : "col-span-1"}>{h}</div>
          ))}
        </div>
        {companies.map(c => (
          <div key={c.id} className="grid grid-cols-12 gap-2 items-center">
            <Input value={c.name} onChange={e => upd(c.id, "name", e.target.value)}
              placeholder="Company" className="col-span-2 h-8 text-sm bg-white/5 border-white/20 text-white" />
            <Input value={c.invested} type="number" onChange={e => upd(c.id, "invested", Number(e.target.value))}
              className="col-span-1 h-8 text-sm bg-white/5 border-white/20 text-white" />
            <Input value={c.currentValue} type="number" onChange={e => upd(c.id, "currentValue", Number(e.target.value))}
              className="col-span-1 h-8 text-sm bg-white/5 border-white/20 text-white" />
            <div className="col-span-1 text-sm text-center font-mono text-indigo-400">
              {c.invested > 0 ? fmt(c.currentValue / c.invested) : "—"}x
            </div>
            <Select value={c.stage} onValueChange={v => upd(c.id, "stage", v)}>
              <SelectTrigger className="col-span-2 h-8 text-xs bg-white/5 border-white/20 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1e1e2e] border-white/20">
                {["Pre-Seed","Seed","Series A","Series B","Series C","Growth"].map(s => (
                  <SelectItem key={s} value={s} className="text-white text-xs">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={c.sector} onChange={e => upd(c.id, "sector", e.target.value)}
              placeholder="Sector" className="col-span-2 h-8 text-sm bg-white/5 border-white/20 text-white" />
            <Input value={c.date} onChange={e => upd(c.id, "date", e.target.value)}
              type="month" className="col-span-1 h-8 text-xs bg-white/5 border-white/20 text-white" />
            <Button variant="ghost" size="icon" onClick={() => del(c.id)} className="col-span-1 h-8 text-white/30 hover:text-red-400">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addCompany} className="border-white/20 text-white/60 hover:text-white gap-2 mt-2">
          <Plus className="h-4 w-4" /> Add Company
        </Button>
      </div>
    </div>
  );
}

// ─── SECTION 2: Fund Forecast Scenarios ──────────────────────────────────────
function FundForecastScenarios() {
  const [fundSize, setFundSize] = useState(20000000);
  const [vintageYear, setVintageYear] = useState(2023);
  const [fundLife, setFundLife] = useState(10);
  const [deploymentYears, setDeploymentYears] = useState(4);
  const [conservativeMoic, setConservativeMoic] = useState(1.5);
  const [baseMoic, setBaseMoic] = useState(2.5);
  const [optimisticMoic, setOptimisticMoic] = useState(4.0);
  const { toast } = useToast();

  const chartData = useMemo(() => {
    const years = Array.from({ length: fundLife + 1 }, (_, i) => vintageYear + i);
    return years.map(y => {
      const t = y - vintageYear;
      const deployFactor = Math.min(t / deploymentYears, 1);
      const returnFactor = t < deploymentYears ? 0 : (t - deploymentYears) / (fundLife - deploymentYears);
      const nav = (v: number) => fundSize * deployFactor * (1 + (v - 1) * returnFactor);
      return {
        year: y.toString(),
        Conservative: Math.round(nav(conservativeMoic) / 1e6 * 10) / 10,
        Base: Math.round(nav(baseMoic) / 1e6 * 10) / 10,
        Optimistic: Math.round(nav(optimisticMoic) / 1e6 * 10) / 10,
      };
    });
  }, [fundSize, vintageYear, fundLife, deploymentYears, conservativeMoic, baseMoic, optimisticMoic]);

  const finalYear = chartData[chartData.length - 1];
  const copy = () => {
    const txt = `Fund Forecast — Size: ${fmtC(fundSize)} | Conservative: ${fmtC(finalYear.Conservative * 1e6)} (${conservativeMoic}x) | Base: ${fmtC(finalYear.Base * 1e6)} (${baseMoic}x) | Optimistic: ${fmtC(finalYear.Optimistic * 1e6)} (${optimisticMoic}x)`;
    navigator.clipboard.writeText(txt);
    toast({ title: "Copied", description: txt });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Fund Forecast — Scenario Modeller</h2>
          <p className="text-sm text-white/50 mt-1">Project NAV across conservative, base, and optimistic outcomes</p>
        </div>
        <Button variant="outline" size="sm" onClick={copy} className="gap-2 border-white/20 text-white/70 hover:text-white">
          <Copy className="h-4 w-4" /> Copy
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Fund Size ($)", value: fundSize, set: setFundSize },
          { label: "Vintage Year", value: vintageYear, set: setVintageYear },
          { label: "Fund Life (yrs)", value: fundLife, set: setFundLife },
          { label: "Deployment Period (yrs)", value: deploymentYears, set: setDeploymentYears },
        ].map(f => (
          <div key={f.label} className="space-y-1">
            <Label className="text-white/60 text-xs">{f.label}</Label>
            <Input value={f.value} type="number" onChange={e => f.set(Number(e.target.value))}
              className="bg-white/5 border-white/20 text-white" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Conservative MOIC", value: conservativeMoic, set: setConservativeMoic, color: "text-amber-400" },
          { label: "Base MOIC", value: baseMoic, set: setBaseMoic, color: "text-indigo-400" },
          { label: "Optimistic MOIC", value: optimisticMoic, set: setOptimisticMoic, color: "text-emerald-400" },
        ].map(f => (
          <Card key={f.label} className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <Label className="text-white/60 text-xs">{f.label}</Label>
              <Input value={f.value} type="number" step="0.1" onChange={e => f.set(Number(e.target.value))}
                className="mt-1 bg-white/5 border-white/20 text-white" />
              <div className={`mt-2 text-xl font-bold ${f.color}`}>{fmtC(f.value * fundSize)}</div>
              <div className="text-xs text-white/40">Terminal NAV</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="year" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
          <YAxis tickFormatter={v => `$${v}M`} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
          <Tooltip formatter={(v: number) => `$${v}M`} contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)" }} />
          <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }} />
          <Area type="monotone" dataKey="Optimistic" stroke="#10b981" fill="#10b98120" strokeWidth={2} />
          <Area type="monotone" dataKey="Base" stroke="#6366f1" fill="#6366f120" strokeWidth={2} />
          <Area type="monotone" dataKey="Conservative" stroke="#f59e0b" fill="#f59e0b20" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── SECTION 3: Rolling Fund Model ───────────────────────────────────────────
function RollingFundModel() {
  const [quarters, setQuarters] = useState(8);
  const [avgCommitment, setAvgCommitment] = useState(50000);
  const [lpsPerQuarter, setLpsPerQuarter] = useState(20);
  const [managementFee, setManagementFee] = useState(2.0);
  const [carry, setCarry] = useState(20);
  const { toast } = useToast();

  const data = useMemo(() => {
    return Array.from({ length: quarters }, (_, i) => {
      const q = i + 1;
      const cumLPs = q * lpsPerQuarter;
      const cumCapital = cumLPs * avgCommitment;
      const annualFee = cumCapital * (managementFee / 100);
      const quarterlyFee = annualFee / 4;
      return {
        quarter: `Q${q}`,
        "New LPs": lpsPerQuarter,
        "Cumulative LPs": cumLPs,
        "Committed ($K)": Math.round(cumCapital / 1000),
        "Mgmt Fee ($K)": Math.round(quarterlyFee / 1000),
      };
    });
  }, [quarters, avgCommitment, lpsPerQuarter, managementFee]);

  const lastRow = data[data.length - 1] || { "Committed ($K)": 0, "Mgmt Fee ($K)": 0, "Cumulative LPs": 0 };
  const copy = () => {
    const txt = `Rolling Fund — ${lastRow["Cumulative LPs"]} LPs | ${fmtC(lastRow["Committed ($K)"] * 1000)} committed | ${fmtC(lastRow["Mgmt Fee ($K)"] * 1000 * 4)}/yr fees`;
    navigator.clipboard.writeText(txt);
    toast({ title: "Copied", description: txt });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Rolling Fund Model</h2>
          <p className="text-sm text-white/50 mt-1">Model subscription-based LP commitments with quarterly closes</p>
        </div>
        <Button variant="outline" size="sm" onClick={copy} className="gap-2 border-white/20 text-white/70 hover:text-white">
          <Copy className="h-4 w-4" /> Copy
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Quarters to model", value: quarters, set: setQuarters, step: 1 },
          { label: "Avg LP commitment ($)", value: avgCommitment, set: setAvgCommitment, step: 5000 },
          { label: "New LPs / quarter", value: lpsPerQuarter, set: setLpsPerQuarter, step: 1 },
          { label: "Mgmt fee (%)", value: managementFee, set: setManagementFee, step: 0.1 },
          { label: "Carry (%)", value: carry, set: setCarry, step: 1 },
        ].map(f => (
          <div key={f.label} className="space-y-1">
            <Label className="text-xs text-white/60">{f.label}</Label>
            <Input value={f.value} type="number" step={f.step} onChange={e => f.set(Number(e.target.value))}
              className="bg-white/5 border-white/20 text-white" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4">
            <div className="text-xs text-white/50">Total Committed</div>
            <div className="text-2xl font-bold text-white mt-1">{fmtC(lastRow["Committed ($K)"] * 1000)}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4">
            <div className="text-xs text-white/50">Total LPs</div>
            <div className="text-2xl font-bold text-white mt-1">{lastRow["Cumulative LPs"]}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4">
            <div className="text-xs text-white/50">Annual Mgmt Fee</div>
            <div className="text-2xl font-bold text-white mt-1">{fmtC(lastRow["Mgmt Fee ($K)"] * 1000 * 4)}</div>
          </CardContent>
        </Card>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="quarter" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
          <YAxis tickFormatter={v => `$${v}K`} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
          <Tooltip formatter={(v: number) => `$${v}K`} contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)" }} />
          <Bar dataKey="Committed ($K)" fill="#6366f1" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── SECTION 4: Fund of Funds Model ──────────────────────────────────────────
function FundOfFundsModel() {
  const [funds, setFunds] = useState<SubFund[]>([
    { id: 1, name: "Alpha Seed Fund I", committedCapital: 5000000, nav: 7500000, dpi: 0.2 },
    { id: 2, name: "Beta Growth Fund II", committedCapital: 10000000, nav: 18000000, dpi: 0.5 },
    { id: 3, name: "Gamma Venture III", committedCapital: 8000000, nav: 9600000, dpi: 0.1 },
  ]);
  const { toast } = useToast();

  const add = () => setFunds(p => [...p, { id: Date.now(), name: "", committedCapital: 0, nav: 0, dpi: 0 }]);
  const del = (id: number) => setFunds(p => p.filter(f => f.id !== id));
  const upd = (id: number, k: keyof SubFund, v: string | number) =>
    setFunds(p => p.map(f => f.id === id ? { ...f, [k]: v } : f));

  const totalCommitted = useMemo(() => funds.reduce((s, f) => s + f.committedCapital, 0), [funds]);
  const totalNav = useMemo(() => funds.reduce((s, f) => s + f.nav, 0), [funds]);
  const weightedDpi = useMemo(() =>
    totalCommitted > 0 ? funds.reduce((s, f) => s + f.dpi * f.committedCapital, 0) / totalCommitted : 0,
    [funds, totalCommitted]);
  const tvpi = totalCommitted > 0 ? totalNav / totalCommitted : 0;

  const chartData = funds.map(f => ({
    name: f.name || "—",
    "NAV ($M)": Math.round(f.nav / 1e6 * 10) / 10,
    "Committed ($M)": Math.round(f.committedCapital / 1e6 * 10) / 10,
  }));

  const copy = () => {
    navigator.clipboard.writeText(`FoF: ${fmtC(totalCommitted)} committed | NAV ${fmtC(totalNav)} | TVPI ${fmt(tvpi)}x | DPI ${fmt(weightedDpi)}x`);
    toast({ title: "Copied" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Fund of Funds Model</h2>
          <p className="text-sm text-white/50 mt-1">Aggregate performance across underlying fund investments</p>
        </div>
        <Button variant="outline" size="sm" onClick={copy} className="gap-2 border-white/20 text-white/70 hover:text-white">
          <Copy className="h-4 w-4" /> Copy
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Committed", value: fmtC(totalCommitted) },
          { label: "Portfolio NAV", value: fmtC(totalNav) },
          { label: "TVPI", value: `${fmt(tvpi)}x` },
          { label: "Wt. Avg DPI", value: `${fmt(weightedDpi)}x` },
        ].map(m => (
          <Card key={m.label} className="bg-white/5 border-white/10">
            <CardContent className="pt-4">
              <div className="text-xs text-white/50">{m.label}</div>
              <div className="text-xl font-bold text-white mt-1">{m.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 text-xs text-white/40 px-1 pb-1 border-b border-white/10">
          {["Fund Name", "Committed ($)", "NAV ($)", "DPI", "MOIC", ""].map((h, i) => (
            <div key={i} className={i === 0 ? "col-span-4" : i === 5 ? "col-span-1" : "col-span-2"}>{h}</div>
          ))}
        </div>
        {funds.map(f => (
          <div key={f.id} className="grid grid-cols-12 gap-2 items-center">
            <Input value={f.name} onChange={e => upd(f.id, "name", e.target.value)}
              placeholder="Fund name" className="col-span-4 h-8 text-sm bg-white/5 border-white/20 text-white" />
            <Input value={f.committedCapital} type="number" onChange={e => upd(f.id, "committedCapital", Number(e.target.value))}
              className="col-span-2 h-8 text-sm bg-white/5 border-white/20 text-white" />
            <Input value={f.nav} type="number" onChange={e => upd(f.id, "nav", Number(e.target.value))}
              className="col-span-2 h-8 text-sm bg-white/5 border-white/20 text-white" />
            <Input value={f.dpi} type="number" step="0.01" onChange={e => upd(f.id, "dpi", Number(e.target.value))}
              className="col-span-2 h-8 text-sm bg-white/5 border-white/20 text-white" />
            <div className="col-span-1 text-sm font-mono text-indigo-400 text-center">
              {f.committedCapital > 0 ? fmt(f.nav / f.committedCapital) : "—"}x
            </div>
            <Button variant="ghost" size="icon" onClick={() => del(f.id)} className="col-span-1 h-8 text-white/30 hover:text-red-400">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={add} className="border-white/20 text-white/60 hover:text-white gap-2 mt-2">
          <Plus className="h-4 w-4" /> Add Fund
        </Button>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis type="number" tickFormatter={v => `$${v}M`} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
          <YAxis type="category" dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} width={130} />
          <Tooltip formatter={(v: number) => `$${v}M`} contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)" }} />
          <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }} />
          <Bar dataKey="Committed ($M)" fill="#6366f1" radius={[0,3,3,0]} />
          <Bar dataKey="NAV ($M)" fill="#22d3ee" radius={[0,3,3,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── SECTION 5: SaaS Forecasting ─────────────────────────────────────────────
function SaaSForecasting() {
  const [startArr, setStartArr] = useState(500000);
  const [newLogoMrr, setNewLogoMrr] = useState(30000);
  const [expansion, setExpansion] = useState(5);
  const [churn, setChurn] = useState(3);
  const [months, setMonths] = useState(24);
  const { toast } = useToast();

  const data = useMemo(() => {
    let arr = startArr;
    return Array.from({ length: months }, (_, i) => {
      const expansionMrr = (arr / 12) * (expansion / 100);
      const churnMrr = (arr / 12) * (churn / 100);
      const newMrr = newLogoMrr + expansionMrr - churnMrr;
      arr += newMrr * 12;
      const month = i + 1;
      return {
        month: month % 3 === 0 ? `M${month}` : "",
        MRR: Math.round(arr / 12 / 1000),
        ARR: Math.round(arr / 1000),
        "Net New MRR": Math.round(newMrr / 1000),
      };
    });
  }, [startArr, newLogoMrr, expansion, churn, months]);

  const last = data[data.length - 1] || { ARR: 0, MRR: 0 };
  const copy = () => {
    navigator.clipboard.writeText(`SaaS Forecast: ARR ${fmtC(last.ARR * 1000)} | MRR ${fmtC(last.MRR * 1000)} at month ${months}`);
    toast({ title: "Copied" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">SaaS ARR/MRR Forecasting</h2>
          <p className="text-sm text-white/50 mt-1">Model ARR growth with new logos, expansion, and churn</p>
        </div>
        <Button variant="outline" size="sm" onClick={copy} className="gap-2 border-white/20 text-white/70 hover:text-white">
          <Copy className="h-4 w-4" /> Copy
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Starting ARR ($)", value: startArr, set: setStartArr },
          { label: "New Logo MRR/mo ($)", value: newLogoMrr, set: setNewLogoMrr },
          { label: "Expansion Rate (%)", value: expansion, set: setExpansion },
          { label: "Churn Rate (%/yr)", value: churn, set: setChurn },
          { label: "Months to forecast", value: months, set: setMonths },
        ].map(f => (
          <div key={f.label} className="space-y-1">
            <Label className="text-xs text-white/60">{f.label}</Label>
            <Input value={f.value} type="number" onChange={e => f.set(Number(e.target.value))}
              className="bg-white/5 border-white/20 text-white" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4">
            <div className="text-xs text-white/50">ARR at Month {months}</div>
            <div className="text-2xl font-bold text-white">{fmtC(last.ARR * 1000)}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4">
            <div className="text-xs text-white/50">MRR at Month {months}</div>
            <div className="text-2xl font-bold text-white">{fmtC(last.MRR * 1000)}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4">
            <div className="text-xs text-white/50">Growth ({months}mo)</div>
            <div className="text-2xl font-bold text-emerald-400">
              {startArr > 0 ? `${fmtPct(((last.ARR * 1000 / startArr) - 1) * 100)}` : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
          <YAxis tickFormatter={v => `$${v}K`} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
          <Tooltip formatter={(v: number) => `$${v}K`} contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)" }} />
          <Area type="monotone" dataKey="ARR" stroke="#6366f1" fill="#6366f120" strokeWidth={2} name="ARR ($K)" />
          <Area type="monotone" dataKey="MRR" stroke="#22d3ee" fill="#22d3ee20" strokeWidth={2} name="MRR ($K)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── SECTION 6: Enterprise SaaS Forecasting ──────────────────────────────────
function EnterpriseSaaSForecasting() {
  const [pipelineDeals, setPipelineDeals] = useState(25);
  const [avgAcv, setAvgAcv] = useState(80000);
  const [winRate, setWinRate] = useState(25);
  const [salesCycle, setSalesCycle] = useState(6);
  const [ndrPct, setNdrPct] = useState(115);
  const [years, setYears] = useState(3);
  const { toast } = useToast();

  const data = useMemo(() => {
    let arr = 0;
    return Array.from({ length: years }, (_, i) => {
      const newClosedDeals = Math.round(pipelineDeals * (winRate / 100) * (12 / salesCycle));
      const newArr = newClosedDeals * avgAcv;
      arr = arr * (ndrPct / 100) + newArr;
      return {
        year: `Year ${i + 1}`,
        "New Bookings ARR": Math.round(newArr / 1000),
        "Total ARR": Math.round(arr / 1000),
        "New Deals Closed": newClosedDeals,
      };
    });
  }, [pipelineDeals, avgAcv, winRate, salesCycle, ndrPct, years]);

  const lastYear = data[data.length - 1] || { "Total ARR": 0, "New Deals Closed": 0 };
  const copy = () => {
    navigator.clipboard.writeText(`Enterprise SaaS: ARR ${fmtC(lastYear["Total ARR"] * 1000)} at Year ${years}`);
    toast({ title: "Copied" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Enterprise SaaS Forecasting</h2>
          <p className="text-sm text-white/50 mt-1">ACV deal pipeline model with NDR and expansion ARR</p>
        </div>
        <Button variant="outline" size="sm" onClick={copy} className="gap-2 border-white/20 text-white/70 hover:text-white">
          <Copy className="h-4 w-4" /> Copy
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: "Pipeline Deals/yr", value: pipelineDeals, set: setPipelineDeals },
          { label: "Avg ACV ($)", value: avgAcv, set: setAvgAcv },
          { label: "Win Rate (%)", value: winRate, set: setWinRate },
          { label: "Sales Cycle (mo)", value: salesCycle, set: setSalesCycle },
          { label: "NDR (%)", value: ndrPct, set: setNdrPct },
          { label: "Years", value: years, set: setYears },
        ].map(f => (
          <div key={f.label} className="space-y-1">
            <Label className="text-xs text-white/60">{f.label}</Label>
            <Input value={f.value} type="number" onChange={e => f.set(Number(e.target.value))}
              className="bg-white/5 border-white/20 text-white" />
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-white/40 text-xs border-b border-white/10">
              <th className="text-left pb-2">Year</th>
              <th className="text-right pb-2">New Deals</th>
              <th className="text-right pb-2">New Bookings ARR</th>
              <th className="text-right pb-2">Total ARR</th>
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.year} className="border-b border-white/5">
                <td className="py-2 text-white/70">{row.year}</td>
                <td className="py-2 text-right text-white">{row["New Deals Closed"]}</td>
                <td className="py-2 text-right text-white">{fmtC(row["New Bookings ARR"] * 1000)}</td>
                <td className="py-2 text-right font-semibold text-indigo-400">{fmtC(row["Total ARR"] * 1000)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="year" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
          <YAxis tickFormatter={v => `$${v}K`} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
          <Tooltip formatter={(v: number) => `$${v}K`} contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)" }} />
          <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }} />
          <Bar dataKey="New Bookings ARR" fill="#22d3ee" stackId="a" radius={[0,0,0,0]} />
          <Bar dataKey="Total ARR" fill="#6366f1" stackId="b" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── SECTION 7: Ecommerce Forecasting ────────────────────────────────────────
function EcommerceForecasting() {
  const [startGmv, setStartGmv] = useState(100000);
  const [monthlyGrowth, setMonthlyGrowth] = useState(8);
  const [aov, setAov] = useState(75);
  const [repeatRate, setRepeatRate] = useState(35);
  const [cacPaid, setCacPaid] = useState(25);
  const [grossMargin, setGrossMargin] = useState(55);
  const [months, setMonths] = useState(18);
  const { toast } = useToast();

  const data = useMemo(() => {
    let gmv = startGmv;
    return Array.from({ length: months }, (_, i) => {
      const orders = Math.round(gmv / aov);
      const newCustomers = Math.round(orders * (1 - repeatRate / 100));
      const totalCac = newCustomers * cacPaid;
      const grossProfit = gmv * (grossMargin / 100);
      const contribution = grossProfit - totalCac;
      const label = i + 1;
      const point = {
        month: label % 3 === 0 ? `M${label}` : "",
        "GMV ($K)": Math.round(gmv / 1000),
        "Gross Profit ($K)": Math.round(grossProfit / 1000),
        "Contribution ($K)": Math.round(contribution / 1000),
      };
      gmv = gmv * (1 + monthlyGrowth / 100);
      return point;
    });
  }, [startGmv, monthlyGrowth, aov, repeatRate, cacPaid, grossMargin, months]);

  const last = data[data.length - 1] || { "GMV ($K)": 0, "Gross Profit ($K)": 0 };
  const copy = () => {
    navigator.clipboard.writeText(`Ecommerce: GMV ${fmtC(last["GMV ($K)"] * 1000)} | GP ${fmtC(last["Gross Profit ($K)"] * 1000)} at month ${months}`);
    toast({ title: "Copied" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Ecommerce Forecasting</h2>
          <p className="text-sm text-white/50 mt-1">GMV growth, AOV, repeat rate, and contribution margin</p>
        </div>
        <Button variant="outline" size="sm" onClick={copy} className="gap-2 border-white/20 text-white/70 hover:text-white">
          <Copy className="h-4 w-4" /> Copy
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Starting GMV ($/mo)", value: startGmv, set: setStartGmv },
          { label: "Monthly GMV Growth (%)", value: monthlyGrowth, set: setMonthlyGrowth },
          { label: "Avg Order Value ($)", value: aov, set: setAov },
          { label: "Repeat Purchase Rate (%)", value: repeatRate, set: setRepeatRate },
          { label: "Paid CAC per customer ($)", value: cacPaid, set: setCacPaid },
          { label: "Gross Margin (%)", value: grossMargin, set: setGrossMargin },
          { label: "Months to forecast", value: months, set: setMonths },
        ].map(f => (
          <div key={f.label} className="space-y-1">
            <Label className="text-xs text-white/60">{f.label}</Label>
            <Input value={f.value} type="number" onChange={e => f.set(Number(e.target.value))}
              className="bg-white/5 border-white/20 text-white" />
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
          <YAxis tickFormatter={v => `$${v}K`} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
          <Tooltip formatter={(v: number) => `$${v}K`} contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)" }} />
          <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }} />
          <Area type="monotone" dataKey="GMV ($K)" stroke="#f59e0b" fill="#f59e0b20" strokeWidth={2} />
          <Area type="monotone" dataKey="Gross Profit ($K)" stroke="#10b981" fill="#10b98120" strokeWidth={2} />
          <Area type="monotone" dataKey="Contribution ($K)" stroke="#6366f1" fill="#6366f120" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── SECTION 8: OpEx ProForma ─────────────────────────────────────────────────
interface HeadcountRow {
  id: number;
  role: string;
  count: number;
  annualSalary: number;
  startMonth: number;
}
function OpExProForma() {
  const [headcount, setHeadcount] = useState<HeadcountRow[]>([
    { id: 1, role: "Engineers", count: 3, annualSalary: 120000, startMonth: 1 },
    { id: 2, role: "Sales", count: 2, annualSalary: 90000, startMonth: 3 },
    { id: 3, role: "G&A", count: 1, annualSalary: 80000, startMonth: 1 },
  ]);
  const [otherMonthlyOpex, setOtherMonthlyOpex] = useState(15000);
  const [startingCash, setStartingCash] = useState(1500000);
  const [months, setMonths] = useState(18);
  const { toast } = useToast();

  const add = () => setHeadcount(p => [...p, { id: Date.now(), role: "", count: 1, annualSalary: 80000, startMonth: 1 }]);
  const del = (id: number) => setHeadcount(p => p.filter(r => r.id !== id));
  const upd = (id: number, k: keyof HeadcountRow, v: string | number) =>
    setHeadcount(p => p.map(r => r.id === id ? { ...r, [k]: v } : r));

  const data = useMemo(() => {
    let cash = startingCash;
    return Array.from({ length: months }, (_, i) => {
      const m = i + 1;
      const payroll = headcount.filter(r => r.startMonth <= m).reduce((s, r) => s + (r.count * r.annualSalary) / 12, 0);
      const totalBurn = payroll + otherMonthlyOpex;
      cash -= totalBurn;
      const label = m % 3 === 0 ? `M${m}` : "";
      return {
        month: label,
        "Payroll ($K)": Math.round(payroll / 1000),
        "Other OpEx ($K)": Math.round(otherMonthlyOpex / 1000),
        "Cash ($K)": Math.round(cash / 1000),
        "Total Burn ($K)": Math.round(totalBurn / 1000),
      };
    });
  }, [headcount, otherMonthlyOpex, startingCash, months]);

  const runwayMonth = data.findIndex(d => d["Cash ($K)"] <= 0);
  const runwayDisplay = runwayMonth === -1 ? `>${months}mo` : `${runwayMonth}mo`;
  const totalMonthlyCost = data[0]?.["Total Burn ($K)"] || 0;
  const copy = () => {
    navigator.clipboard.writeText(`OpEx ProForma: ${fmtC(totalMonthlyCost * 1000)}/mo burn | ${runwayDisplay} runway | ${fmtC(startingCash)} starting cash`);
    toast({ title: "Copied" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">OpEx ProForma & Runway Budgeting</h2>
          <p className="text-sm text-white/50 mt-1">Headcount plan with salary bands and monthly burn projection</p>
        </div>
        <Button variant="outline" size="sm" onClick={copy} className="gap-2 border-white/20 text-white/70 hover:text-white">
          <Copy className="h-4 w-4" /> Copy
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-white/60">Starting Cash ($)</Label>
          <Input value={startingCash} type="number" onChange={e => setStartingCash(Number(e.target.value))}
            className="bg-white/5 border-white/20 text-white" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-white/60">Other Monthly OpEx ($)</Label>
          <Input value={otherMonthlyOpex} type="number" onChange={e => setOtherMonthlyOpex(Number(e.target.value))}
            className="bg-white/5 border-white/20 text-white" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-white/60">Months to model</Label>
          <Input value={months} type="number" onChange={e => setMonths(Number(e.target.value))}
            className="bg-white/5 border-white/20 text-white" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4">
            <div className="text-xs text-white/50">Monthly Burn (M1)</div>
            <div className="text-2xl font-bold text-red-400">{fmtC(totalMonthlyCost * 1000)}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4">
            <div className="text-xs text-white/50">Runway</div>
            <div className="text-2xl font-bold text-emerald-400">{runwayDisplay}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4">
            <div className="text-xs text-white/50">Total Headcount</div>
            <div className="text-2xl font-bold text-white">{headcount.reduce((s, r) => s + r.count, 0)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 text-xs text-white/40 px-1 pb-1 border-b border-white/10">
          <div className="col-span-4">Role</div>
          <div className="col-span-2">Count</div>
          <div className="col-span-3">Annual Salary ($)</div>
          <div className="col-span-2">Start Month</div>
          <div className="col-span-1"></div>
        </div>
        {headcount.map(r => (
          <div key={r.id} className="grid grid-cols-12 gap-2 items-center">
            <Input value={r.role} onChange={e => upd(r.id, "role", e.target.value)}
              placeholder="Role" className="col-span-4 h-8 text-sm bg-white/5 border-white/20 text-white" />
            <Input value={r.count} type="number" min={1} onChange={e => upd(r.id, "count", Number(e.target.value))}
              className="col-span-2 h-8 text-sm bg-white/5 border-white/20 text-white" />
            <Input value={r.annualSalary} type="number" onChange={e => upd(r.id, "annualSalary", Number(e.target.value))}
              className="col-span-3 h-8 text-sm bg-white/5 border-white/20 text-white" />
            <Input value={r.startMonth} type="number" min={1} onChange={e => upd(r.id, "startMonth", Number(e.target.value))}
              className="col-span-2 h-8 text-sm bg-white/5 border-white/20 text-white" />
            <Button variant="ghost" size="icon" onClick={() => del(r.id)} className="col-span-1 h-8 text-white/30 hover:text-red-400">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={add} className="border-white/20 text-white/60 hover:text-white gap-2 mt-2">
          <Plus className="h-4 w-4" /> Add Row
        </Button>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
          <YAxis tickFormatter={v => `$${v}K`} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
          <Tooltip formatter={(v: number) => `$${v}K`} contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)" }} />
          <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }} />
          <Area type="monotone" dataKey="Cash ($K)" stroke="#22d3ee" fill="#22d3ee20" strokeWidth={2} />
          <Area type="monotone" dataKey="Total Burn ($K)" stroke="#f43f5e" fill="#f43f5e20" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── SECTION 9: Venture Studio Model ─────────────────────────────────────────
function VentureStudioModel() {
  const [companiesPerYear, setCompaniesPerYear] = useState(4);
  const [avgOwnership, setAvgOwnership] = useState(25);
  const [exitTimelineYrs, setExitTimelineYrs] = useState(7);
  const [avgExitValuation, setAvgExitValuation] = useState(40000000);
  const [successRate, setSuccessRate] = useState(30);
  const [studioOpexMonthly, setStudioOpexMonthly] = useState(80000);
  const [feePerPortcoMonthly, setFeePerPortcoMonthly] = useState(5000);
  const [years, setYears] = useState(5);
  const { toast } = useToast();

  const data = useMemo(() => {
    let totalCompanies = 0;
    return Array.from({ length: years }, (_, i) => {
      const yr = i + 1;
      totalCompanies += companiesPerYear;
      const activePortco = totalCompanies;
      const feeIncome = activePortco * feePerPortcoMonthly * 12;
      const studioOpex = studioOpexMonthly * 12;
      const netPl = feeIncome - studioOpex;
      const exitsThisYear = i >= exitTimelineYrs - 1 ? companiesPerYear * (successRate / 100) : 0;
      const exitProceeds = exitsThisYear * avgExitValuation * (avgOwnership / 100);
      return {
        year: `Y${yr}`,
        "Active Portfolio": activePortco,
        "Fee Income ($K)": Math.round(feeIncome / 1000),
        "Studio OpEx ($K)": Math.round(studioOpex / 1000),
        "Net P&L ($K)": Math.round(netPl / 1000),
        "Exit Proceeds ($K)": Math.round(exitProceeds / 1000),
      };
    });
  }, [companiesPerYear, avgOwnership, exitTimelineYrs, avgExitValuation, successRate, studioOpexMonthly, feePerPortcoMonthly, years]);

  const totalExitProceeds = data.reduce((s, d) => s + d["Exit Proceeds ($K)"], 0);
  const copy = () => {
    navigator.clipboard.writeText(`Venture Studio: ${companiesPerYear} companies/yr | ${fmtC(totalExitProceeds * 1000)} projected exit proceeds over ${years}yrs`);
    toast({ title: "Copied" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Venture Studio Model</h2>
          <p className="text-sm text-white/50 mt-1">Annual portfolio incubation forecast with studio P&L</p>
        </div>
        <Button variant="outline" size="sm" onClick={copy} className="gap-2 border-white/20 text-white/70 hover:text-white">
          <Copy className="h-4 w-4" /> Copy
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Companies incubated/yr", value: companiesPerYear, set: setCompaniesPerYear },
          { label: "Avg ownership stake (%)", value: avgOwnership, set: setAvgOwnership },
          { label: "Avg exit timeline (yrs)", value: exitTimelineYrs, set: setExitTimelineYrs },
          { label: "Avg exit valuation ($)", value: avgExitValuation, set: setAvgExitValuation },
          { label: "Portfolio success rate (%)", value: successRate, set: setSuccessRate },
          { label: "Studio OpEx/mo ($)", value: studioOpexMonthly, set: setStudioOpexMonthly },
          { label: "Fee per portco/mo ($)", value: feePerPortcoMonthly, set: setFeePerPortcoMonthly },
          { label: "Years to model", value: years, set: setYears },
        ].map(f => (
          <div key={f.label} className="space-y-1">
            <Label className="text-xs text-white/60">{f.label}</Label>
            <Input value={f.value} type="number" onChange={e => f.set(Number(e.target.value))}
              className="bg-white/5 border-white/20 text-white" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4">
            <div className="text-xs text-white/50">Projected Exit Proceeds ({years}yr)</div>
            <div className="text-2xl font-bold text-emerald-400">{fmtC(totalExitProceeds * 1000)}</div>
          </CardContent>
        </Card>
        <Card className="bg-white/5 border-white/10">
          <CardContent className="pt-4">
            <div className="text-xs text-white/50">Companies in Portfolio (Y{years})</div>
            <div className="text-2xl font-bold text-white">{companiesPerYear * years}</div>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-white/40 text-xs border-b border-white/10">
              {["Year", "Active Portfolio", "Fee Income", "Studio OpEx", "Net P&L", "Exit Proceeds"].map(h => (
                <th key={h} className="text-left pb-2 pr-4">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.year} className="border-b border-white/5">
                <td className="py-2 text-white/70 pr-4">{row.year}</td>
                <td className="py-2 text-white pr-4">{row["Active Portfolio"]}</td>
                <td className="py-2 text-emerald-400 pr-4">{fmtC(row["Fee Income ($K)"] * 1000)}</td>
                <td className="py-2 text-red-400 pr-4">{fmtC(row["Studio OpEx ($K)"] * 1000)}</td>
                <td className={`py-2 pr-4 font-semibold ${row["Net P&L ($K)"] >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {row["Net P&L ($K)"] >= 0 ? "+" : ""}{fmtC(row["Net P&L ($K)"] * 1000)}
                </td>
                <td className="py-2 text-indigo-400 pr-4">{row["Exit Proceeds ($K)"] > 0 ? fmtC(row["Exit Proceeds ($K)"] * 1000) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="year" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
          <YAxis tickFormatter={v => `$${v}K`} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
          <Tooltip formatter={(v: number) => `$${v}K`} contentStyle={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.1)" }} />
          <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }} />
          <Bar dataKey="Fee Income ($K)" fill="#10b981" radius={[3,3,0,0]} />
          <Bar dataKey="Studio OpEx ($K)" fill="#f43f5e" radius={[3,3,0,0]} />
          <Bar dataKey="Exit Proceeds ($K)" fill="#6366f1" radius={[3,3,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Sidebar Nav ──────────────────────────────────────────────────────────────
const FUND_MODELS = [
  { id: "portfolio-kpi", label: "Portfolio KPI Dashboard", icon: BarChart3 },
  { id: "fund-forecast", label: "Fund Forecast Scenarios", icon: TrendingUp },
  { id: "rolling-fund", label: "Rolling Fund Model", icon: Layers },
  { id: "fund-of-funds", label: "Fund of Funds", icon: Briefcase },
];
const REVENUE_TOOLS = [
  { id: "saas-forecast", label: "SaaS ARR/MRR Forecast", icon: TrendingUp },
  { id: "enterprise-saas", label: "Enterprise SaaS Forecast", icon: Building2 },
  { id: "ecommerce", label: "Ecommerce Forecast", icon: Globe },
  { id: "opex-proforma", label: "OpEx & Runway ProForma", icon: DollarSign },
];
const STUDIO_TOOLS = [
  { id: "venture-studio", label: "Venture Studio Model", icon: Users },
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ForecastingStudio() {
  const [activeId, setActiveId] = useState("portfolio-kpi");

  const renderContent = () => {
    switch (activeId) {
      case "portfolio-kpi": return <VCPortfolioDashboard />;
      case "fund-forecast": return <FundForecastScenarios />;
      case "rolling-fund": return <RollingFundModel />;
      case "fund-of-funds": return <FundOfFundsModel />;
      case "saas-forecast": return <SaaSForecasting />;
      case "enterprise-saas": return <EnterpriseSaaSForecasting />;
      case "ecommerce": return <EcommerceForecasting />;
      case "opex-proforma": return <OpExProForma />;
      case "venture-studio": return <VentureStudioModel />;
      default: return null;
    }
  };

  const NavSection = ({ title, items }: { title: string; items: typeof FUND_MODELS }) => (
    <div className="mb-4">
      <div className="text-xs font-semibold text-white/30 uppercase tracking-wider px-3 mb-2">{title}</div>
      {items.map(item => {
        const Icon = item.icon;
        const active = activeId === item.id;
        return (
          <button key={item.id} onClick={() => setActiveId(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all mb-1 ${
              active ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30" : "text-white/50 hover:text-white hover:bg-white/5"
            }`}>
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="text-left leading-tight">{item.label}</span>
            {active && <ChevronRight className="h-3 w-3 ml-auto" />}
          </button>
        );
      })}
    </div>
  );

  return (
    <AppLayout videoSrc={videoBackgrounds.default}>
      <div className="min-h-screen flex">
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0 border-r border-white/10 bg-black/20 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="mb-6">
            <h1 className="text-lg font-bold text-white">Forecasting Studio</h1>
            <p className="text-xs text-white/40 mt-1">Fund models & revenue tools</p>
          </div>
          <NavSection title="Fund Models" items={FUND_MODELS} />
          <NavSection title="Revenue Forecasting" items={REVENUE_TOOLS} />
          <NavSection title="Venture Studio" items={STUDIO_TOOLS} />
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>
    </AppLayout>
  );
}
