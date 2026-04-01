import { useState, useMemo } from "react";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  PieChart as RechartsPieChart,
  Pie,
  ComposedChart,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  Plus,
  Trash2,
  BarChart3,
  PieChart,
  Calculator,
  Target,
  Layers,
  Users,
  Building2,
  ArrowUpRight,
  Zap,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";

// ─── Utility ────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 1): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(decimals)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(decimals)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(decimals)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtMultiple(x: number) {
  return `${x.toFixed(2)}x`;
}

function fmtPct(x: number) {
  return `${x.toFixed(1)}%`;
}

const CHART_COLORS = {
  purple: "#8e84f7",
  blue: "#60a5fa",
  green: "#34d399",
  amber: "#fbbf24",
  red: "#f87171",
  conservative: "#60a5fa",
  base: "#8e84f7",
  optimistic: "#34d399",
};

// ─── IRR approximation (XIRR Newton's method) ───────────────────────────────

function approxIRR(invested: number, currentValue: number, years: number): number {
  if (invested <= 0 || currentValue <= 0 || years <= 0) return 0;
  return (Math.pow(currentValue / invested, 1 / years) - 1) * 100;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface PortfolioCompany {
  id: string;
  name: string;
  invested: number;
  currentValue: number;
  stage: string;
  sector: string;
  year: number;
}

interface RollingLPCommitment {
  id: string;
  lpName: string;
  commitment: number;
  quarter: string;
}

interface FoFund {
  id: string;
  name: string;
  committed: number;
  nav: number;
  distributions: number;
  moic: number;
}

interface SaaSCohort {
  month: string;
  newMRR: number;
  expansion: number;
  churn: number;
}

interface HeadcountLine {
  id: string;
  role: string;
  headcount: number;
  salary: number;
  startMonth: number;
}

interface StudioCompany {
  id: string;
  name: string;
  ownership: number;
  exitYear: number;
  exitValue: number;
}

// ─── Default seed data ───────────────────────────────────────────────────────

const defaultPortfolio: PortfolioCompany[] = [
  { id: "1", name: "AlphaAI", invested: 500000, currentValue: 2500000, stage: "Series A", sector: "AI/ML", year: 2022 },
  { id: "2", name: "BetaHealth", invested: 750000, currentValue: 1200000, stage: "Seed", sector: "HealthTech", year: 2023 },
  { id: "3", name: "GammaFinance", invested: 1000000, currentValue: 3800000, stage: "Series B", sector: "FinTech", year: 2021 },
  { id: "4", name: "DeltaRetail", invested: 250000, currentValue: 100000, stage: "Seed", sector: "E-Commerce", year: 2023 },
];

const defaultRollingLPs: RollingLPCommitment[] = [
  { id: "1", lpName: "LP Alpha Family Office", commitment: 2000000, quarter: "Q1 2024" },
  { id: "2", lpName: "Beta Endowment", commitment: 5000000, quarter: "Q2 2024" },
  { id: "3", lpName: "Gamma Pension", commitment: 3000000, quarter: "Q3 2024" },
];

const defaultFoFunds: FoFund[] = [
  { id: "1", name: "Seed Fund I", committed: 10000000, nav: 14000000, distributions: 2000000, moic: 1.6 },
  { id: "2", name: "Growth Fund II", committed: 25000000, nav: 38000000, distributions: 5000000, moic: 1.72 },
  { id: "3", name: "Venture Fund III", committed: 15000000, nav: 21000000, distributions: 3000000, moic: 1.6 },
];

const defaultSaaSCohorts: SaaSCohort[] = [
  { month: "Jan", newMRR: 80000, expansion: 12000, churn: 8000 },
  { month: "Feb", newMRR: 95000, expansion: 15000, churn: 9500 },
  { month: "Mar", newMRR: 110000, expansion: 18000, churn: 11000 },
  { month: "Apr", newMRR: 120000, expansion: 21000, churn: 12000 },
  { month: "May", newMRR: 140000, expansion: 25000, churn: 13000 },
  { month: "Jun", newMRR: 160000, expansion: 28000, churn: 14000 },
];

const defaultHeadcount: HeadcountLine[] = [
  { id: "1", role: "Engineering", headcount: 8, salary: 150000, startMonth: 1 },
  { id: "2", role: "Sales", headcount: 4, salary: 120000, startMonth: 1 },
  { id: "3", role: "Marketing", headcount: 3, salary: 110000, startMonth: 3 },
  { id: "4", role: "G&A", headcount: 2, salary: 130000, startMonth: 1 },
];

const defaultStudioCompanies: StudioCompany[] = [
  { id: "1", name: "StudioCo Alpha", ownership: 35, exitYear: 2027, exitValue: 25000000 },
  { id: "2", name: "StudioCo Beta", ownership: 40, exitYear: 2028, exitValue: 40000000 },
  { id: "3", name: "StudioCo Gamma", ownership: 30, exitYear: 2029, exitValue: 15000000 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: FUND MODELS
// ═══════════════════════════════════════════════════════════════════════════════

function FundModelsTab() {
  const [portfolio, setPortfolio] = useState<PortfolioCompany[]>(defaultPortfolio);
  const [fundSize, setFundSize] = useState(25000000);
  const [fundLife, setFundLife] = useState(10);
  const [targetDeals, setTargetDeals] = useState(20);
  const [reserveRatio, setReserveRatio] = useState(30);
  const [fundModel, setFundModel] = useState<"standard" | "rolling" | "fof">("standard");

  // Rolling fund state
  const [rollingLPs, setRollingLPs] = useState<RollingLPCommitment[]>(defaultRollingLPs);
  const [newLP, setNewLP] = useState({ lpName: "", commitment: 0, quarter: "Q1 2025" });

  // FoF state
  const [foFunds, setFoFunds] = useState<FoFund[]>(defaultFoFunds);

  // Portfolio KPIs
  const kpis = useMemo(() => {
    const totalInvested = portfolio.reduce((s, c) => s + c.invested, 0);
    const totalNAV = portfolio.reduce((s, c) => s + c.currentValue, 0);
    const totalDistributions = 0; // simplified
    const moic = totalInvested > 0 ? totalNAV / totalInvested : 0;
    const tvpi = totalInvested > 0 ? (totalNAV + totalDistributions) / totalInvested : 0;
    const dpi = totalInvested > 0 ? totalDistributions / totalInvested : 0;
    const avgYears = portfolio.length > 0
      ? portfolio.reduce((s, c) => s + (2026 - c.year), 0) / portfolio.length
      : 3;
    const irr = approxIRR(totalInvested, totalNAV, avgYears);
    const deployed = totalInvested;
    const reserveCapital = fundSize * (reserveRatio / 100);
    const availableForNew = Math.max(0, fundSize - deployed - reserveCapital);

    return { totalInvested, totalNAV, totalDistributions, moic, tvpi, dpi, irr, deployed, availableForNew, reserveCapital };
  }, [portfolio, fundSize, reserveRatio]);

  // Scenario projections
  const scenarioData = useMemo(() => {
    const years = Array.from({ length: fundLife + 1 }, (_, i) => i);
    return years.map(y => {
      const base = kpis.totalNAV * Math.pow(1.18, y);
      return {
        year: `Y${y}`,
        conservative: Math.round(kpis.totalNAV * Math.pow(1.10, y)),
        base: Math.round(base),
        optimistic: Math.round(kpis.totalNAV * Math.pow(1.28, y)),
      };
    });
  }, [kpis.totalNAV, fundLife]);

  const addCompany = () => {
    setPortfolio(p => [...p, {
      id: Date.now().toString(),
      name: "New Company",
      invested: 250000,
      currentValue: 250000,
      stage: "Seed",
      sector: "SaaS",
      year: 2025,
    }]);
  };

  const updateCompany = (id: string, field: keyof PortfolioCompany, value: any) => {
    setPortfolio(p => p.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeCompany = (id: string) => {
    setPortfolio(p => p.filter(c => c.id !== id));
  };

  const addLP = () => {
    if (!newLP.lpName) return;
    setRollingLPs(lps => [...lps, { ...newLP, id: Date.now().toString() }]);
    setNewLP({ lpName: "", commitment: 0, quarter: "Q1 2025" });
  };

  const removeLP = (id: string) => setRollingLPs(lps => lps.filter(l => l.id !== id));

  const totalRollingCommitments = rollingLPs.reduce((s, l) => s + l.commitment, 0);

  // FoF aggregate
  const foAgg = useMemo(() => {
    const totalCommitted = foFunds.reduce((s, f) => s + f.committed, 0);
    const totalNAV = foFunds.reduce((s, f) => s + f.nav, 0);
    const totalDist = foFunds.reduce((s, f) => s + f.distributions, 0);
    const weightedMOIC = totalCommitted > 0
      ? foFunds.reduce((s, f) => s + f.moic * (f.committed / totalCommitted), 0)
      : 0;
    return { totalCommitted, totalNAV, totalDist, weightedMOIC };
  }, [foFunds]);

  const benchmarks = [
    { label: "MOIC", value: kpis.moic, benchmark: 2.5, unit: "x" },
    { label: "TVPI", value: kpis.tvpi, benchmark: 2.0, unit: "x" },
    { label: "DPI", value: kpis.dpi, benchmark: 0.8, unit: "x" },
    { label: "IRR", value: kpis.irr, benchmark: 25, unit: "%" },
  ];

  return (
    <div className="space-y-6">
      {/* Fund Model Selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <Label className="text-white/70">Fund Model:</Label>
        {(["standard", "rolling", "fof"] as const).map(m => (
          <Button
            key={m}
            variant="outline"
            size="sm"
            onClick={() => setFundModel(m)}
            className={`border-white/20 text-sm ${fundModel === m ? "bg-white/10 text-white" : "text-white/60 hover:text-white"}`}
            data-testid={`button-fund-model-${m}`}
          >
            {m === "standard" ? "Standard VC Fund" : m === "rolling" ? "Rolling Fund" : "Fund of Funds"}
          </Button>
        ))}
      </div>

      {/* Fund Config Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1">
          <Label className="text-white/60 text-xs">Fund Size ($)</Label>
          <Input
            type="number"
            value={fundSize}
            onChange={e => setFundSize(Number(e.target.value))}
            className="bg-white/5 border-white/20 text-white text-sm"
            data-testid="input-fund-size"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-white/60 text-xs">Fund Life (years)</Label>
          <Input
            type="number"
            value={fundLife}
            onChange={e => setFundLife(Number(e.target.value))}
            className="bg-white/5 border-white/20 text-white text-sm"
            data-testid="input-fund-life"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-white/60 text-xs">Target # Deals</Label>
          <Input
            type="number"
            value={targetDeals}
            onChange={e => setTargetDeals(Number(e.target.value))}
            className="bg-white/5 border-white/20 text-white text-sm"
            data-testid="input-target-deals"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-white/60 text-xs">Reserve Ratio ({reserveRatio}%)</Label>
          <Slider
            value={[reserveRatio]}
            onValueChange={([v]) => setReserveRatio(v)}
            min={0}
            max={60}
            step={5}
            className="mt-2"
            data-testid="slider-reserve-ratio"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "NAV", value: fmt(kpis.totalNAV), sub: `Invested: ${fmt(kpis.totalInvested)}`, icon: DollarSign, color: "text-purple-400" },
          { label: "MOIC", value: fmtMultiple(kpis.moic), sub: "Benchmark: 2.5x", icon: TrendingUp, color: "text-blue-400" },
          { label: "TVPI", value: fmtMultiple(kpis.tvpi), sub: "Benchmark: 2.0x", icon: BarChart3, color: "text-green-400" },
          { label: "IRR (est.)", value: fmtPct(kpis.irr), sub: "Benchmark: 25%", icon: Target, color: "text-amber-400" },
        ].map(kpi => (
          <Card key={kpi.label} className="bg-white/5 border-white/10" data-testid={`card-kpi-${kpi.label.toLowerCase()}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/60 text-xs">{kpi.label}</span>
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <div className="text-2xl font-light text-white">{kpi.value}</div>
              <div className="text-white/40 text-xs mt-1">{kpi.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Benchmark Comparison Bars */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm font-light">KPI vs. Benchmark</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {benchmarks.map(b => {
            const pct = Math.min((b.value / (b.benchmark * 1.5)) * 100, 100);
            const benchPct = Math.min((b.benchmark / (b.benchmark * 1.5)) * 100, 100);
            const isAbove = b.value >= b.benchmark;
            return (
              <div key={b.label} className="space-y-1" data-testid={`benchmark-${b.label.toLowerCase()}`}>
                <div className="flex justify-between text-xs">
                  <span className="text-white/70">{b.label}</span>
                  <span className={isAbove ? "text-green-400" : "text-amber-400"}>
                    {b.value.toFixed(2)}{b.unit} <span className="text-white/40">vs {b.benchmark}{b.unit} benchmark</span>
                  </span>
                </div>
                <div className="relative h-2 bg-white/10 rounded-full">
                  <div
                    className={`absolute left-0 top-0 h-2 rounded-full transition-all ${isAbove ? "bg-green-500" : "bg-amber-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                  <div
                    className="absolute top-[-3px] w-0.5 h-4 bg-white/50"
                    style={{ left: `${benchPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Pacing Tracker */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm font-light">Pacing Tracker</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-light text-white">{portfolio.length}</div>
              <div className="text-white/50 text-xs mt-1">Deals Made</div>
              <div className="text-white/30 text-xs">of {targetDeals} target</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-light text-white">
                {portfolio.length > 0 ? fmt(kpis.totalInvested / portfolio.length) : "$0"}
              </div>
              <div className="text-white/50 text-xs mt-1">Avg Check Size</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-light text-white">{fmtPct(reserveRatio)}</div>
              <div className="text-white/50 text-xs mt-1">Reserve Ratio</div>
              <div className="text-white/30 text-xs">{fmt(kpis.reserveCapital)} reserved</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-light text-white">{fmt(kpis.availableForNew)}</div>
              <div className="text-white/50 text-xs mt-1">Available for New</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Portfolio Table */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-white text-sm font-light">Portfolio Companies</CardTitle>
          <Button size="sm" variant="outline" className="border-white/20 text-white/70 hover:text-white" onClick={addCompany} data-testid="button-add-company">
            <Plus className="w-3 h-3 mr-1" /> Add
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {["Company", "Invested", "Current Value", "MOIC", "Stage", "Sector", "Year", ""].map(h => (
                    <th key={h} className="text-left text-white/40 font-normal pb-2 pr-3 text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {portfolio.map(c => {
                  const moic = c.invested > 0 ? c.currentValue / c.invested : 0;
                  return (
                    <tr key={c.id} data-testid={`row-company-${c.id}`}>
                      <td className="py-2 pr-3">
                        <Input value={c.name} onChange={e => updateCompany(c.id, "name", e.target.value)} className="bg-transparent border-0 p-0 h-auto text-white text-sm focus-visible:ring-0" />
                      </td>
                      <td className="py-2 pr-3">
                        <Input type="number" value={c.invested} onChange={e => updateCompany(c.id, "invested", Number(e.target.value))} className="bg-transparent border-0 p-0 h-auto text-white text-sm focus-visible:ring-0 w-24" />
                      </td>
                      <td className="py-2 pr-3">
                        <Input type="number" value={c.currentValue} onChange={e => updateCompany(c.id, "currentValue", Number(e.target.value))} className="bg-transparent border-0 p-0 h-auto text-white text-sm focus-visible:ring-0 w-24" />
                      </td>
                      <td className={`py-2 pr-3 font-medium ${moic >= 2 ? "text-green-400" : moic >= 1 ? "text-amber-400" : "text-red-400"}`}>
                        {fmtMultiple(moic)}
                      </td>
                      <td className="py-2 pr-3">
                        <Select value={c.stage} onValueChange={v => updateCompany(c.id, "stage", v)}>
                          <SelectTrigger className="bg-transparent border-0 h-auto p-0 text-white/70 text-sm focus:ring-0 w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["Pre-seed", "Seed", "Series A", "Series B", "Series C", "Growth"].map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 pr-3">
                        <Input value={c.sector} onChange={e => updateCompany(c.id, "sector", e.target.value)} className="bg-transparent border-0 p-0 h-auto text-white/70 text-sm focus-visible:ring-0 w-20" />
                      </td>
                      <td className="py-2 pr-3">
                        <Input type="number" value={c.year} onChange={e => updateCompany(c.id, "year", Number(e.target.value))} className="bg-transparent border-0 p-0 h-auto text-white/70 text-sm focus-visible:ring-0 w-16" />
                      </td>
                      <td className="py-2">
                        <button onClick={() => removeCompany(c.id)} className="text-white/30 hover:text-red-400 transition-colors" data-testid={`button-remove-company-${c.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Scenario Forecast Chart */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm font-light">NAV Forecast — Conservative / Base / Optimistic</CardTitle>
          <CardDescription className="text-white/40 text-xs">Projected NAV at fund maturity across 3 growth scenarios</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={scenarioData}>
              <defs>
                {[
                  { id: "conservative", color: CHART_COLORS.conservative },
                  { id: "base", color: CHART_COLORS.base },
                  { id: "optimistic", color: CHART_COLORS.optimistic },
                ].map(d => (
                  <linearGradient key={d.id} id={`grad-${d.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={d.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={d.color} stopOpacity={0.0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="year" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
              <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} tickFormatter={v => fmt(v, 0)} />
              <RechartsTooltip
                contentStyle={{ backgroundColor: "rgb(18,18,18)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                labelStyle={{ color: "rgba(255,255,255,0.7)" }}
                formatter={(value: any) => [fmt(value), ""]}
              />
              <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }} />
              <Area type="monotone" dataKey="conservative" stroke={CHART_COLORS.conservative} fill={`url(#grad-conservative)`} strokeWidth={2} name="Conservative (10%)" />
              <Area type="monotone" dataKey="base" stroke={CHART_COLORS.base} fill={`url(#grad-base)`} strokeWidth={2} name="Base (18%)" />
              <Area type="monotone" dataKey="optimistic" stroke={CHART_COLORS.optimistic} fill={`url(#grad-optimistic)`} strokeWidth={2} name="Optimistic (28%)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Rolling Fund Model */}
      {fundModel === "rolling" && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm font-light flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-purple-400" /> Rolling Fund — LP Commitments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Input placeholder="LP Name" value={newLP.lpName} onChange={e => setNewLP(p => ({ ...p, lpName: e.target.value }))} className="bg-white/5 border-white/20 text-white text-sm" data-testid="input-lp-name" />
              <Input type="number" placeholder="Commitment ($)" value={newLP.commitment || ""} onChange={e => setNewLP(p => ({ ...p, commitment: Number(e.target.value) }))} className="bg-white/5 border-white/20 text-white text-sm" data-testid="input-lp-commitment" />
              <Select value={newLP.quarter} onValueChange={v => setNewLP(p => ({ ...p, quarter: v }))}>
                <SelectTrigger className="bg-white/5 border-white/20 text-white text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024", "Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025"].map(q => (
                    <SelectItem key={q} value={q}>{q}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={addLP} variant="outline" className="border-white/20 text-white/70 hover:text-white text-sm" data-testid="button-add-lp">
                <Plus className="w-3 h-3 mr-1" /> Add LP
              </Button>
            </div>
            <div className="space-y-2">
              {rollingLPs.map(lp => (
                <div key={lp.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg" data-testid={`row-lp-${lp.id}`}>
                  <div className="flex gap-4">
                    <span className="text-white text-sm">{lp.lpName}</span>
                    <Badge variant="outline" className="text-purple-400 border-purple-400/30 text-xs">{lp.quarter}</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-white/70 text-sm">{fmt(lp.commitment)}</span>
                    <button onClick={() => removeLP(lp.id)} className="text-white/30 hover:text-red-400" data-testid={`button-remove-lp-${lp.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-2 border-t border-white/10">
              <span className="text-white/60 text-sm">Total Rolling Commitments</span>
              <span className="text-white font-medium">{fmt(totalRollingCommitments)}</span>
            </div>
            {/* Cumulative closes chart */}
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={rollingLPs.map((lp, i) => ({ name: lp.quarter, commitment: lp.commitment, cumulative: rollingLPs.slice(0, i + 1).reduce((s, l) => s + l.commitment, 0) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} tickFormatter={v => fmt(v, 0)} />
                <RechartsTooltip contentStyle={{ backgroundColor: "rgb(18,18,18)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} formatter={(v: any) => [fmt(v), ""]} />
                <Bar dataKey="commitment" fill={CHART_COLORS.purple} name="Quarterly Commitment" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="cumulative" stroke={CHART_COLORS.green} strokeWidth={2} name="Cumulative" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Fund of Funds Model */}
      {fundModel === "fof" && (
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm font-light flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" /> Fund of Funds — Aggregate Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-white/5 rounded-lg">
              <div>
                <div className="text-white/50 text-xs mb-1">Total Committed</div>
                <div className="text-white text-lg">{fmt(foAgg.totalCommitted)}</div>
              </div>
              <div>
                <div className="text-white/50 text-xs mb-1">Total NAV</div>
                <div className="text-white text-lg">{fmt(foAgg.totalNAV)}</div>
              </div>
              <div>
                <div className="text-white/50 text-xs mb-1">Total Distributions</div>
                <div className="text-white text-lg">{fmt(foAgg.totalDist)}</div>
              </div>
              <div>
                <div className="text-white/50 text-xs mb-1">Weighted MOIC</div>
                <div className="text-white text-lg">{fmtMultiple(foAgg.weightedMOIC)}</div>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {["Fund Name", "Committed", "NAV", "Distributions", "MOIC", "Weight"].map(h => (
                    <th key={h} className="text-left text-white/40 font-normal pb-2 pr-3 text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {foFunds.map(f => (
                  <tr key={f.id} data-testid={`row-fof-${f.id}`}>
                    <td className="py-2 pr-3 text-white">{f.name}</td>
                    <td className="py-2 pr-3 text-white/70">{fmt(f.committed)}</td>
                    <td className="py-2 pr-3 text-white/70">{fmt(f.nav)}</td>
                    <td className="py-2 pr-3 text-white/70">{fmt(f.distributions)}</td>
                    <td className="py-2 pr-3 text-green-400">{fmtMultiple(f.moic)}</td>
                    <td className="py-2 pr-3 text-white/50">{foAgg.totalCommitted > 0 ? fmtPct((f.committed / foAgg.totalCommitted) * 100) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={foFunds.map(f => ({ name: f.name, NAV: f.nav, Committed: f.committed, Distributions: f.distributions }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} tickFormatter={v => fmt(v, 0)} />
                <RechartsTooltip contentStyle={{ backgroundColor: "rgb(18,18,18)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} formatter={(v: any) => [fmt(v), ""]} />
                <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }} />
                <Bar dataKey="Committed" fill={CHART_COLORS.blue} radius={[4, 4, 0, 0]} />
                <Bar dataKey="NAV" fill={CHART_COLORS.purple} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Distributions" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: REVENUE FORECASTING
// ═══════════════════════════════════════════════════════════════════════════════

function RevenueForecastingTab() {
  const [revenueModel, setRevenueModel] = useState<"saas" | "enterprise" | "ecommerce" | "opex">("saas");

  // SaaS inputs
  const [saasStartMRR, setSaasStartMRR] = useState(500000);
  const [newLogoGrowth, setNewLogoGrowth] = useState(15);
  const [expansionRate, setExpansionRate] = useState(10);
  const [churnRate, setChurnRate] = useState(5);
  const [cohorts, setCohorts] = useState<SaaSCohort[]>(defaultSaaSCohorts);

  // Enterprise SaaS inputs
  const [acv, setAcv] = useState(120000);
  const [dealCycleMonths, setDealCycleMonths] = useState(6);
  const [pipelineDeals, setPipelineDeals] = useState(20);
  const [winRate, setWinRate] = useState(25);
  const [upsellRate, setUpsellRate] = useState(20);

  // Ecommerce inputs
  const [gmvBase, setGmvBase] = useState(2000000);
  const [aov, setAov] = useState(85);
  const [repeatRate, setRepeatRate] = useState(35);
  const [channels, setChannels] = useState([
    { name: "Paid Search", cac: 45, contribution: 38 },
    { name: "Social", cac: 32, contribution: 28 },
    { name: "Email", cac: 12, contribution: 20 },
    { name: "Organic", cac: 8, contribution: 14 },
  ]);

  // OpEx / Runway
  const [headcount, setHeadcount] = useState<HeadcountLine[]>(defaultHeadcount);
  const [otherOpex, setOtherOpex] = useState(80000);
  const [cashOnHand, setCashOnHand] = useState(5000000);

  // SaaS computed
  const saasMonthlyData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let mrr = saasStartMRR;
    return months.map(m => {
      const newLogoMRR = mrr * (newLogoGrowth / 100);
      const expansionMRR = mrr * (expansionRate / 100);
      const churnMRR = mrr * (churnRate / 100);
      mrr = mrr + newLogoMRR + expansionMRR - churnMRR;
      return { month: m, MRR: Math.round(mrr), "New Logo": Math.round(newLogoMRR), Expansion: Math.round(expansionMRR), Churn: Math.round(churnMRR) };
    });
  }, [saasStartMRR, newLogoGrowth, expansionRate, churnRate]);

  const endMRR = saasMonthlyData[saasMonthlyData.length - 1]?.MRR || 0;
  const arrForecast = endMRR * 12;

  // ARR Waterfall
  const arrWaterfall = useMemo(() => {
    const startARR = saasStartMRR * 12;
    const newLogo = saasMonthlyData.reduce((s, m) => s + m["New Logo"], 0) * 12;
    const expansion = saasMonthlyData.reduce((s, m) => s + m["Expansion"], 0) * 12;
    const churn = saasMonthlyData.reduce((s, m) => s + m["Churn"], 0) * 12;
    return [
      { name: "Start ARR", value: startARR, fill: CHART_COLORS.blue },
      { name: "+ New Logo", value: newLogo, fill: CHART_COLORS.green },
      { name: "+ Expansion", value: expansion, fill: CHART_COLORS.purple },
      { name: "- Churn", value: -churn, fill: CHART_COLORS.red },
      { name: "End ARR", value: startARR + newLogo + expansion - churn, fill: CHART_COLORS.amber },
    ];
  }, [saasMonthlyData, saasStartMRR]);

  // Enterprise pipeline
  const enterpriseData = useMemo(() => {
    const stages = ["Discovery", "Demo", "Proposal", "Negotiation", "Closed Won"];
    const stageWeights = [0.15, 0.25, 0.45, 0.70, 1.0];
    return stages.map((s, i) => ({
      stage: s,
      deals: Math.round(pipelineDeals * (1 - i * 0.18)),
      value: Math.round(pipelineDeals * (1 - i * 0.18) * acv * stageWeights[i]),
    }));
  }, [pipelineDeals, acv]);

  const projectedARR = Math.round(pipelineDeals * (winRate / 100) * acv);
  const projectedARRWithUpsell = Math.round(projectedARR * (1 + upsellRate / 100));

  // GMV forecast
  const gmvForecastData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let gmv = gmvBase / 12;
    return months.map(m => {
      const orders = Math.round(gmv / aov);
      const repeatOrders = Math.round(orders * (repeatRate / 100));
      gmv = gmv * 1.06;
      return { month: m, GMV: Math.round(gmv), Orders: orders, "Repeat Orders": repeatOrders };
    });
  }, [gmvBase, aov, repeatRate]);

  // OpEx
  const monthlyBurn = useMemo(() => {
    const salaries = headcount.reduce((s, h) => s + (h.headcount * h.salary) / 12, 0);
    return salaries + otherOpex;
  }, [headcount, otherOpex]);

  const runwayMonths = cashOnHand > 0 && monthlyBurn > 0 ? Math.floor(cashOnHand / monthlyBurn) : 0;

  const runwayData = useMemo(() => {
    let cash = cashOnHand;
    return Array.from({ length: 24 }, (_, i) => {
      cash = Math.max(0, cash - monthlyBurn);
      return { month: `M${i + 1}`, cash, burn: monthlyBurn };
    });
  }, [cashOnHand, monthlyBurn]);

  const noHireBurn = monthlyBurn;
  const hireBurn = monthlyBurn * 1.25;

  const updateChannel = (i: number, field: "cac" | "contribution", value: number) => {
    setChannels(c => c.map((ch, idx) => idx === i ? { ...ch, [field]: value } : ch));
  };

  const addHeadcount = () => {
    setHeadcount(h => [...h, { id: Date.now().toString(), role: "New Role", headcount: 1, salary: 100000, startMonth: 1 }]);
  };

  const updateHeadcount = (id: string, field: keyof HeadcountLine, value: any) => {
    setHeadcount(h => h.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const removeHeadcount = (id: string) => setHeadcount(h => h.filter(l => l.id !== id));

  return (
    <div className="space-y-6">
      {/* Model selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <Label className="text-white/70">Revenue Model:</Label>
        {([
          { key: "saas", label: "SaaS Forecast" },
          { key: "enterprise", label: "Enterprise SaaS" },
          { key: "ecommerce", label: "E-commerce" },
          { key: "opex", label: "OpEx / Runway" },
        ] as const).map(m => (
          <Button
            key={m.key}
            variant="outline"
            size="sm"
            onClick={() => setRevenueModel(m.key)}
            className={`border-white/20 text-sm ${revenueModel === m.key ? "bg-white/10 text-white" : "text-white/60 hover:text-white"}`}
            data-testid={`button-revenue-model-${m.key}`}
          >
            {m.label}
          </Button>
        ))}
      </div>

      {/* SaaS Model */}
      {revenueModel === "saas" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-white/60 text-xs">Starting MRR ($)</Label>
              <Input type="number" value={saasStartMRR} onChange={e => setSaasStartMRR(Number(e.target.value))} className="bg-white/5 border-white/20 text-white text-sm" data-testid="input-start-mrr" />
            </div>
            <div className="space-y-1">
              <Label className="text-white/60 text-xs">New Logo Growth/mo ({newLogoGrowth}%)</Label>
              <Slider value={[newLogoGrowth]} onValueChange={([v]) => setNewLogoGrowth(v)} min={0} max={40} step={1} className="mt-3" data-testid="slider-new-logo" />
            </div>
            <div className="space-y-1">
              <Label className="text-white/60 text-xs">Expansion Rate/mo ({expansionRate}%)</Label>
              <Slider value={[expansionRate]} onValueChange={([v]) => setExpansionRate(v)} min={0} max={30} step={1} className="mt-3" data-testid="slider-expansion" />
            </div>
            <div className="space-y-1">
              <Label className="text-white/60 text-xs">Churn Rate/mo ({churnRate}%)</Label>
              <Slider value={[churnRate]} onValueChange={([v]) => setChurnRate(v)} min={0} max={20} step={0.5} className="mt-3" data-testid="slider-churn" />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Ending MRR", value: fmt(endMRR) },
              { label: "ARR Forecast", value: fmt(arrForecast) },
              { label: "Net MRR Growth", value: fmtPct(newLogoGrowth + expansionRate - churnRate) + "/mo" },
              { label: "Net Retention", value: fmtPct(100 + expansionRate - churnRate) },
            ].map(stat => (
              <Card key={stat.label} className="bg-white/5 border-white/10" data-testid={`card-saas-${stat.label.toLowerCase().replace(/ /g, "-")}`}>
                <CardContent className="p-4">
                  <div className="text-white/50 text-xs mb-1">{stat.label}</div>
                  <div className="text-xl font-light text-white">{stat.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* MRR Growth Chart */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm font-light">MRR Cohort — Monthly Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={saasMonthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                  <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} tickFormatter={v => fmt(v, 0)} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "rgb(18,18,18)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} formatter={(v: any) => [fmt(v), ""]} />
                  <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }} />
                  <Bar dataKey="New Logo" stackId="a" fill={CHART_COLORS.green} />
                  <Bar dataKey="Expansion" stackId="a" fill={CHART_COLORS.purple} />
                  <Bar dataKey="Churn" stackId="a" fill={CHART_COLORS.red} />
                  <Line type="monotone" dataKey="MRR" stroke={CHART_COLORS.amber} strokeWidth={2} dot={false} name="Total MRR" />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ARR Waterfall */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm font-light">ARR Waterfall</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={arrWaterfall}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                  <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} tickFormatter={v => fmt(v, 0)} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "rgb(18,18,18)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} formatter={(v: any) => [fmt(Math.abs(v)), ""]} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {arrWaterfall.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

      {/* Enterprise SaaS */}
      {revenueModel === "enterprise" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-white/60 text-xs">Avg ACV ($)</Label>
              <Input type="number" value={acv} onChange={e => setAcv(Number(e.target.value))} className="bg-white/5 border-white/20 text-white text-sm" data-testid="input-acv" />
            </div>
            <div className="space-y-1">
              <Label className="text-white/60 text-xs">Deal Cycle (months)</Label>
              <Input type="number" value={dealCycleMonths} onChange={e => setDealCycleMonths(Number(e.target.value))} className="bg-white/5 border-white/20 text-white text-sm" data-testid="input-deal-cycle" />
            </div>
            <div className="space-y-1">
              <Label className="text-white/60 text-xs">Pipeline Deals</Label>
              <Input type="number" value={pipelineDeals} onChange={e => setPipelineDeals(Number(e.target.value))} className="bg-white/5 border-white/20 text-white text-sm" data-testid="input-pipeline-deals" />
            </div>
            <div className="space-y-1">
              <Label className="text-white/60 text-xs">Win Rate ({winRate}%)</Label>
              <Slider value={[winRate]} onValueChange={([v]) => setWinRate(v)} min={5} max={70} step={5} className="mt-3" data-testid="slider-win-rate" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Projected ARR", value: fmt(projectedARR) },
              { label: `ARR w/ ${upsellRate}% Upsell`, value: fmt(projectedARRWithUpsell) },
              { label: "Avg Cycle", value: `${dealCycleMonths} months` },
            ].map(s => (
              <Card key={s.label} className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <div className="text-white/50 text-xs mb-1">{s.label}</div>
                  <div className="text-xl font-light text-white">{s.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-1">
            <Label className="text-white/60 text-xs">Upsell Motion ({upsellRate}%)</Label>
            <Slider value={[upsellRate]} onValueChange={([v]) => setUpsellRate(v)} min={0} max={60} step={5} className="mt-1 max-w-xs" data-testid="slider-upsell" />
          </div>

          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm font-light">Enterprise Deal Pipeline — Stage Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={enterpriseData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} tickFormatter={v => fmt(v, 0)} />
                  <YAxis dataKey="stage" type="category" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} width={100} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "rgb(18,18,18)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} formatter={(v: any) => [fmt(v), ""]} />
                  <Bar dataKey="value" fill={CHART_COLORS.purple} radius={[0, 4, 4, 0]} name="Pipeline Value" />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4">
                <div className="text-white/50 text-xs mb-2">ARR Bridge — Base vs. With Upsell</div>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={[
                    { name: "Base ARR", value: projectedARR, fill: CHART_COLORS.blue },
                    { name: "Upsell ARR", value: projectedARRWithUpsell - projectedARR, fill: CHART_COLORS.green },
                    { name: "Total ARR", value: projectedARRWithUpsell, fill: CHART_COLORS.purple },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                    <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} tickFormatter={v => fmt(v, 0)} />
                    <RechartsTooltip contentStyle={{ backgroundColor: "rgb(18,18,18)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} formatter={(v: any) => [fmt(v), ""]} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {[
                        { name: "Base ARR", fill: CHART_COLORS.blue },
                        { name: "Upsell ARR", fill: CHART_COLORS.green },
                        { name: "Total ARR", fill: CHART_COLORS.purple },
                      ].map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* E-commerce */}
      {revenueModel === "ecommerce" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label className="text-white/60 text-xs">Base GMV (Annual $)</Label>
              <Input type="number" value={gmvBase} onChange={e => setGmvBase(Number(e.target.value))} className="bg-white/5 border-white/20 text-white text-sm" data-testid="input-gmv" />
            </div>
            <div className="space-y-1">
              <Label className="text-white/60 text-xs">Avg Order Value ($)</Label>
              <Input type="number" value={aov} onChange={e => setAov(Number(e.target.value))} className="bg-white/5 border-white/20 text-white text-sm" data-testid="input-aov" />
            </div>
            <div className="space-y-1">
              <Label className="text-white/60 text-xs">Repeat Purchase Rate ({repeatRate}%)</Label>
              <Slider value={[repeatRate]} onValueChange={([v]) => setRepeatRate(v)} min={5} max={70} step={5} className="mt-3" data-testid="slider-repeat-rate" />
            </div>
            <div className="space-y-1">
              <Label className="text-white/60 text-xs">Monthly GMV Growth</Label>
              <div className="text-white text-lg mt-2">+6.0%</div>
            </div>
          </div>

          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm font-light">Monthly GMV Forecast</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={gmvForecastData}>
                  <defs>
                    <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.purple} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS.purple} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                  <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} tickFormatter={v => fmt(v, 0)} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "rgb(18,18,18)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} formatter={(v: any) => [fmt(v), ""]} />
                  <Area type="monotone" dataKey="GMV" stroke={CHART_COLORS.purple} fill="url(#gmvGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* CAC by Channel */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm font-light">CAC by Channel & Contribution Margin</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="border-b border-white/10">
                    {["Channel", "CAC ($)", "Contribution (%)"].map(h => (
                      <th key={h} className="text-left text-white/40 font-normal pb-2 pr-3 text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {channels.map((ch, i) => (
                    <tr key={ch.name} data-testid={`row-channel-${i}`}>
                      <td className="py-2 pr-3 text-white">{ch.name}</td>
                      <td className="py-2 pr-3">
                        <Input type="number" value={ch.cac} onChange={e => updateChannel(i, "cac", Number(e.target.value))} className="bg-transparent border-0 p-0 h-auto text-white/70 text-sm focus-visible:ring-0 w-20" />
                      </td>
                      <td className="py-2 pr-3">
                        <Input type="number" value={ch.contribution} onChange={e => updateChannel(i, "contribution", Number(e.target.value))} className="bg-transparent border-0 p-0 h-auto text-white/70 text-sm focus-visible:ring-0 w-20" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={channels}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                  <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "rgb(18,18,18)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                  <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }} />
                  <Bar dataKey="cac" fill={CHART_COLORS.red} name="CAC ($)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="contribution" fill={CHART_COLORS.green} name="Contribution (%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

      {/* OpEx / Runway */}
      {revenueModel === "opex" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-white/60 text-xs">Cash on Hand ($)</Label>
              <Input type="number" value={cashOnHand} onChange={e => setCashOnHand(Number(e.target.value))} className="bg-white/5 border-white/20 text-white text-sm" data-testid="input-cash" />
            </div>
            <div className="space-y-1">
              <Label className="text-white/60 text-xs">Other Monthly OpEx ($)</Label>
              <Input type="number" value={otherOpex} onChange={e => setOtherOpex(Number(e.target.value))} className="bg-white/5 border-white/20 text-white text-sm" data-testid="input-other-opex" />
            </div>
            <div className="space-y-1">
              <Label className="text-white/60 text-xs">Runway</Label>
              <div className={`text-xl mt-2 ${runwayMonths > 18 ? "text-green-400" : runwayMonths > 12 ? "text-amber-400" : "text-red-400"}`} data-testid="text-runway">
                {runwayMonths} months
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Monthly Burn", value: fmt(monthlyBurn) },
              { label: "Annual Burn", value: fmt(monthlyBurn * 12) },
              { label: "Burn Rate (hire +25%)", value: fmt(hireBurn) },
            ].map(s => (
              <Card key={s.label} className="bg-white/5 border-white/10">
                <CardContent className="p-4">
                  <div className="text-white/50 text-xs mb-1">{s.label}</div>
                  <div className="text-xl font-light text-white">{s.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Headcount Plan */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-white text-sm font-light">Headcount Plan</CardTitle>
              <Button size="sm" variant="outline" className="border-white/20 text-white/70 hover:text-white text-sm" onClick={addHeadcount} data-testid="button-add-role">
                <Plus className="w-3 h-3 mr-1" /> Add Role
              </Button>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    {["Role", "Headcount", "Salary/yr ($)", "Start Month", "Monthly Cost", ""].map(h => (
                      <th key={h} className="text-left text-white/40 font-normal pb-2 pr-3 text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {headcount.map(h => (
                    <tr key={h.id} data-testid={`row-headcount-${h.id}`}>
                      <td className="py-2 pr-3">
                        <Input value={h.role} onChange={e => updateHeadcount(h.id, "role", e.target.value)} className="bg-transparent border-0 p-0 h-auto text-white text-sm focus-visible:ring-0" />
                      </td>
                      <td className="py-2 pr-3">
                        <Input type="number" value={h.headcount} onChange={e => updateHeadcount(h.id, "headcount", Number(e.target.value))} className="bg-transparent border-0 p-0 h-auto text-white/70 text-sm focus-visible:ring-0 w-16" />
                      </td>
                      <td className="py-2 pr-3">
                        <Input type="number" value={h.salary} onChange={e => updateHeadcount(h.id, "salary", Number(e.target.value))} className="bg-transparent border-0 p-0 h-auto text-white/70 text-sm focus-visible:ring-0 w-24" />
                      </td>
                      <td className="py-2 pr-3">
                        <Input type="number" value={h.startMonth} onChange={e => updateHeadcount(h.id, "startMonth", Number(e.target.value))} className="bg-transparent border-0 p-0 h-auto text-white/70 text-sm focus-visible:ring-0 w-16" />
                      </td>
                      <td className="py-2 pr-3 text-white/70">{fmt((h.headcount * h.salary) / 12)}</td>
                      <td className="py-2">
                        <button onClick={() => removeHeadcount(h.id)} className="text-white/30 hover:text-red-400" data-testid={`button-remove-headcount-${h.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Runway Chart */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm font-light">Cash Runway Projection — Hire vs. No-Hire</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={runwayData.map((d, i) => ({
                  ...d,
                  noHire: Math.max(0, cashOnHand - noHireBurn * (i + 1)),
                  hire: Math.max(0, cashOnHand - hireBurn * (i + 1)),
                }))}>
                  <defs>
                    <linearGradient id="noHireGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="hireGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.red} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={CHART_COLORS.red} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
                  <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} tickFormatter={v => fmt(v, 0)} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "rgb(18,18,18)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} formatter={(v: any) => [fmt(v), ""]} />
                  <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }} />
                  <Area type="monotone" dataKey="noHire" stroke={CHART_COLORS.blue} fill="url(#noHireGrad)" strokeWidth={2} name="No New Hires" />
                  <Area type="monotone" dataKey="hire" stroke={CHART_COLORS.red} fill="url(#hireGrad)" strokeWidth={2} name="+25% Hiring" strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: VENTURE STUDIO MODEL
// ═══════════════════════════════════════════════════════════════════════════════

function VentureStudioTab() {
  const [companies, setCompanies] = useState<StudioCompany[]>(defaultStudioCompanies);
  const [companiesPerYear, setCompaniesPerYear] = useState(4);
  const [avgOwnership, setAvgOwnership] = useState(35);
  const [studyYears, setStudyYears] = useState(7);

  // Studio OpEx
  const [teamCost, setTeamCost] = useState(1200000);
  const [sharedServices, setSharedServices] = useState(400000);
  const [feePerCompany, setFeePerCompany] = useState(60000);
  const [portfolioFeeCompanies, setPortfolioFeeCompanies] = useState(8);

  const studioOpex = teamCost + sharedServices;
  const feeIncome = feePerCompany * portfolioFeeCompanies;
  const netPL = feeIncome - studioOpex;

  // Annual portfolio forecast
  const portfolioForecast = useMemo(() => {
    return Array.from({ length: studyYears }, (_, i) => {
      const year = 2026 + i;
      const totalCompanies = companiesPerYear * (i + 1);
      const exitedCompanies = Math.floor(totalCompanies * (i / studyYears));
      const projectedReturn = exitedCompanies * 10000000 * (avgOwnership / 100);
      return { year: year.toString(), "Active Companies": totalCompanies - exitedCompanies, Exited: exitedCompanies, "Projected Return": Math.round(projectedReturn) };
    });
  }, [companiesPerYear, studyYears, avgOwnership]);

  // Exit timeline distribution
  const exitDistribution = useMemo(() => {
    return [
      { name: "Y3-4", pct: 15 },
      { name: "Y5-6", pct: 35 },
      { name: "Y7-8", pct: 30 },
      { name: "Y9+", pct: 20 },
    ];
  }, []);

  // Company-level projected returns
  const companyReturns = useMemo(() => {
    return companies.map(c => ({
      ...c,
      studioReturn: c.exitValue * (c.ownership / 100),
      moic: c.exitValue / (c.exitValue * 0.1) * (c.ownership / 100),
    }));
  }, [companies]);

  const totalProjectedReturn = companyReturns.reduce((s, c) => s + c.studioReturn, 0);

  const addCompany = () => {
    setCompanies(c => [...c, { id: Date.now().toString(), name: "New Studio Co", ownership: avgOwnership, exitYear: 2030, exitValue: 20000000 }]);
  };

  const updateCompany = (id: string, field: keyof StudioCompany, value: any) => {
    setCompanies(c => c.map(co => co.id === id ? { ...co, [field]: value } : co));
  };

  const removeCompany = (id: string) => setCompanies(c => c.filter(co => co.id !== id));

  const plData = [
    { name: "Team Cost", value: -teamCost, fill: CHART_COLORS.red },
    { name: "Shared Services", value: -sharedServices, fill: CHART_COLORS.amber },
    { name: "Fee Income", value: feeIncome, fill: CHART_COLORS.green },
    { name: "Net P&L", value: netPL, fill: netPL >= 0 ? CHART_COLORS.green : CHART_COLORS.red },
  ];

  return (
    <div className="space-y-6">
      {/* Annual Forecast Config */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1">
          <Label className="text-white/60 text-xs">Companies / Year</Label>
          <Input type="number" value={companiesPerYear} onChange={e => setCompaniesPerYear(Number(e.target.value))} className="bg-white/5 border-white/20 text-white text-sm" data-testid="input-companies-per-year" />
        </div>
        <div className="space-y-1">
          <Label className="text-white/60 text-xs">Avg Ownership ({avgOwnership}%)</Label>
          <Slider value={[avgOwnership]} onValueChange={([v]) => setAvgOwnership(v)} min={10} max={60} step={5} className="mt-3" data-testid="slider-avg-ownership" />
        </div>
        <div className="space-y-1">
          <Label className="text-white/60 text-xs">Study Period (years)</Label>
          <Input type="number" value={studyYears} onChange={e => setStudyYears(Number(e.target.value))} className="bg-white/5 border-white/20 text-white text-sm" data-testid="input-study-years" />
        </div>
        <div className="space-y-1">
          <Label className="text-white/60 text-xs">Total Projected Return</Label>
          <div className="text-xl text-green-400 mt-2" data-testid="text-total-return">{fmt(totalProjectedReturn)}</div>
        </div>
      </div>

      {/* Portfolio Companies */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-white text-sm font-light">Studio Portfolio Companies</CardTitle>
          <Button size="sm" variant="outline" className="border-white/20 text-white/70 hover:text-white text-sm" onClick={addCompany} data-testid="button-add-studio-company">
            <Plus className="w-3 h-3 mr-1" /> Add
          </Button>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                {["Company", "Ownership (%)", "Exit Year", "Exit Value ($)", "Studio Return", ""].map(h => (
                  <th key={h} className="text-left text-white/40 font-normal pb-2 pr-3 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {companyReturns.map(c => (
                <tr key={c.id} data-testid={`row-studio-company-${c.id}`}>
                  <td className="py-2 pr-3">
                    <Input value={c.name} onChange={e => updateCompany(c.id, "name", e.target.value)} className="bg-transparent border-0 p-0 h-auto text-white text-sm focus-visible:ring-0" />
                  </td>
                  <td className="py-2 pr-3">
                    <Input type="number" value={c.ownership} onChange={e => updateCompany(c.id, "ownership", Number(e.target.value))} className="bg-transparent border-0 p-0 h-auto text-white/70 text-sm focus-visible:ring-0 w-16" />
                  </td>
                  <td className="py-2 pr-3">
                    <Input type="number" value={c.exitYear} onChange={e => updateCompany(c.id, "exitYear", Number(e.target.value))} className="bg-transparent border-0 p-0 h-auto text-white/70 text-sm focus-visible:ring-0 w-20" />
                  </td>
                  <td className="py-2 pr-3">
                    <Input type="number" value={c.exitValue} onChange={e => updateCompany(c.id, "exitValue", Number(e.target.value))} className="bg-transparent border-0 p-0 h-auto text-white/70 text-sm focus-visible:ring-0 w-28" />
                  </td>
                  <td className="py-2 pr-3 text-green-400">{fmt(c.studioReturn)}</td>
                  <td className="py-2">
                    <button onClick={() => removeCompany(c.id)} className="text-white/30 hover:text-red-400" data-testid={`button-remove-studio-${c.id}`}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Annual Portfolio Forecast Chart */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-sm font-light">Annual Portfolio Forecast — Active vs. Exited</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={portfolioForecast}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="year" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
              <YAxis yAxisId="left" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} tickFormatter={v => fmt(v, 0)} />
              <RechartsTooltip contentStyle={{ backgroundColor: "rgb(18,18,18)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
              <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="Active Companies" stackId="a" fill={CHART_COLORS.purple} radius={[0, 0, 0, 0]} />
              <Bar yAxisId="left" dataKey="Exited" stackId="a" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="Projected Return" stroke={CHART_COLORS.amber} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Exit Timeline Distribution */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-sm font-light">Exit Timeline Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <RechartsPieChart>
                <Pie data={exitDistribution} dataKey="pct" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, pct }) => `${name}: ${pct}%`} labelLine={false}>
                  {exitDistribution.map((_, i) => (
                    <Cell key={i} fill={[CHART_COLORS.purple, CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.amber][i % 4]} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{ backgroundColor: "rgb(18,18,18)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Studio P&L */}
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-sm font-light">Studio P&L — Annual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-white/60 text-xs">Team Cost ($)</Label>
                <Input type="number" value={teamCost} onChange={e => setTeamCost(Number(e.target.value))} className="bg-white/5 border-white/20 text-white text-sm mt-1" data-testid="input-team-cost" />
              </div>
              <div>
                <Label className="text-white/60 text-xs">Shared Services ($)</Label>
                <Input type="number" value={sharedServices} onChange={e => setSharedServices(Number(e.target.value))} className="bg-white/5 border-white/20 text-white text-sm mt-1" data-testid="input-shared-services" />
              </div>
              <div>
                <Label className="text-white/60 text-xs">Fee / Company ($)</Label>
                <Input type="number" value={feePerCompany} onChange={e => setFeePerCompany(Number(e.target.value))} className="bg-white/5 border-white/20 text-white text-sm mt-1" data-testid="input-fee-per-company" />
              </div>
              <div>
                <Label className="text-white/60 text-xs">Portfolio Companies Paying Fee</Label>
                <Input type="number" value={portfolioFeeCompanies} onChange={e => setPortfolioFeeCompanies(Number(e.target.value))} className="bg-white/5 border-white/20 text-white text-sm mt-1" data-testid="input-fee-companies" />
              </div>
            </div>
            <div className="pt-2 space-y-2 border-t border-white/10">
              {[
                { label: "Total OpEx", value: -studioOpex, color: "text-red-400" },
                { label: "Fee Income", value: feeIncome, color: "text-green-400" },
                { label: "Net P&L", value: netPL, color: netPL >= 0 ? "text-green-400" : "text-red-400" },
              ].map(row => (
                <div key={row.label} className="flex justify-between" data-testid={`text-studio-${row.label.toLowerCase().replace(/ /g, "-")}`}>
                  <span className="text-white/60 text-sm">{row.label}</span>
                  <span className={`${row.color} text-sm font-medium`}>{row.value >= 0 ? "" : "-"}{fmt(Math.abs(row.value))}</span>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={plData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} />
                <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} tickFormatter={v => fmt(v, 0)} />
                <RechartsTooltip contentStyle={{ backgroundColor: "rgb(18,18,18)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} formatter={(v: any) => [fmt(Math.abs(v)), ""]} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {plData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function ForecastingStudio() {
  return (
    <AppLayout
      title="Forecasting Studio"
      subtitle="VC Fund Models · Revenue Forecasting · Venture Studio"
      showHero={true}
      heroHeight="40vh"
      videoUrl={videoBackgrounds.lpFunds}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header Row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-light text-white tracking-wide">Forecasting Studio</h1>
            <p className="text-white/50 text-sm mt-1">Live financial modelling — all state is local, no data is saved</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-purple-400 border-purple-400/30 text-xs gap-1">
              <Zap className="w-3 h-3" /> Live Recalculation
            </Badge>
            <Link href="/app/fund-management">
              <Button variant="outline" size="sm" className="border-white/20 text-white/70 hover:text-white text-sm" data-testid="link-fund-management">
                Fund Management <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Main Tab Hub */}
        <Tabs defaultValue="fund-models" className="w-full">
          <TabsList className="bg-white/5 border border-white/10 h-auto p-1 gap-1">
            <TabsTrigger
              value="fund-models"
              className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60 flex items-center gap-2 px-4 py-2 text-sm"
              data-testid="tab-fund-models"
            >
              <PieChart className="w-4 h-4" /> Fund Models
            </TabsTrigger>
            <TabsTrigger
              value="revenue"
              className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60 flex items-center gap-2 px-4 py-2 text-sm"
              data-testid="tab-revenue"
            >
              <TrendingUp className="w-4 h-4" /> Revenue Forecasting
            </TabsTrigger>
            <TabsTrigger
              value="venture-studio"
              className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60 flex items-center gap-2 px-4 py-2 text-sm"
              data-testid="tab-venture-studio"
            >
              <Building2 className="w-4 h-4" /> Venture Studio
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fund-models" className="mt-6">
            <FundModelsTab />
          </TabsContent>

          <TabsContent value="revenue" className="mt-6">
            <RevenueForecastingTab />
          </TabsContent>

          <TabsContent value="venture-studio" className="mt-6">
            <VentureStudioTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
