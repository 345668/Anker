import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Loader2, TrendingUp, Mail, Eye, MessageSquare } from "lucide-react";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------
  SynergyAI "Liquid Glass" primitives (self-contained)
-------------------------------------------------------- */

function GlobalStyles() {
  return (
    <style>{`
      @keyframes synergyGradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @keyframes synergySweep {
        0% { transform: translateX(-60%) rotate(12deg); opacity: 0; }
        25% { opacity: 1; }
        100% { transform: translateX(240%) rotate(12deg); opacity: 0; }
      }
    `}</style>
  );
}

function LiquidBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,rgba(15,23,42,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.35)_1px,transparent_1px)] [background-size:64px_64px]" />
      <div className="absolute -top-28 left-1/4 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-purple-400/30 to-pink-400/25 blur-3xl" />
      <div className="absolute top-1/4 right-1/4 h-[480px] w-[480px] rounded-full bg-gradient-to-br from-orange-400/20 to-yellow-400/18 blur-3xl" />
      <div className="absolute -bottom-28 left-1/3 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-green-400/18 to-blue-400/18 blur-3xl" />
    </div>
  );
}

function UnderGlow({ className }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 rounded-[28px]",
        "bg-gradient-to-br from-purple-400/30 via-pink-400/20 to-blue-400/25 blur-3xl opacity-35",
        className
      )}
    />
  );
}

function GlassPanel({ className, children }) {
  return (
    <div
      className={cn(
        "relative rounded-3xl border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30",
        "backdrop-blur-2xl shadow-lg",
        className
      )}
    >
      {children}
    </div>
  );
}

function GlassHeader({ title, subtitle, right }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-4xl md:text-5xl font-bold text-slate-900">
          Analytics{" "}
          <span className="bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)] bg-clip-text text-transparent">
            Insights
          </span>
        </h1>
        <p className="mt-2 text-slate-600">{subtitle}</p>
      </div>
      {right ? <div className="flex items-center gap-3">{right}</div> : null}
    </div>
  );
}

function StatTile({ title, value, icon: Icon, tint = "from-indigo-400/25 to-violet-400/20" }) {
  return (
    <div className="relative">
      <UnderGlow className={cn("opacity-25", tint)} />
      <GlassPanel className="p-4 md:p-5 hover:shadow-xl transition-shadow">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-11 w-11 rounded-2xl bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)] bg-[length:220%_220%] animate-[synergyGradient_10s_ease_infinite] shadow-sm" />
            <div className="absolute inset-0 rounded-2xl bg-white/10" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Icon className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-sm text-slate-500">{title}</p>
            <p className="text-2xl font-bold text-slate-900 truncate">{value}</p>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

function ChartShell({ title, description, children }) {
  return (
    <div className="relative">
      <UnderGlow className="opacity-20" />
      <GlassPanel className="p-4 md:p-6">
        <div className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">{title}</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        {children}
      </GlassPanel>
    </div>
  );
}

/* Tooltip styling for Recharts */
function GlassTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border-2 border-white/60 bg-gradient-to-br from-white/70 to-white/40 backdrop-blur-2xl shadow-lg px-3 py-2">
      <p className="text-xs font-medium text-slate-700">{label}</p>
      <div className="mt-1 space-y-0.5">
        {payload.map((p, idx) => (
          <div key={idx} className="flex items-center justify-between gap-6 text-xs">
            <span className="text-slate-600">{p.name}</span>
            <span className="font-semibold text-slate-900">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------
  Page
-------------------------------------------------------- */

const COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e"];

export default function Analytics() {
  const { data: outreaches = [], isLoading: outreachLoading } = useQuery({
    queryKey: ["outreaches"],
    queryFn: () => base44.entities.Outreach.list("-created_date", 1000),
  });

  const { data: firms = [], isLoading: firmsLoading } = useQuery({
    queryKey: ["firms"],
    queryFn: () => base44.entities.InvestorFirm.list("-created_date", 1000),
  });

  const { data: matches = [] } = useQuery({
    queryKey: ["matches"],
    queryFn: () => base44.entities.Match.list("-created_date", 1000),
  });

  const isLoading = outreachLoading || firmsLoading;

  const stats = useMemo(() => {
    const totalSent = outreaches.filter((o) => o.sent_at).length;
    const opened = outreaches.filter((o) => o.opened_at).length;
    const replied = outreaches.filter((o) => o.replied_at).length;
    const callsScheduled = outreaches.filter((o) => o.stage === "call_scheduled").length;

    const openRate = totalSent > 0 ? Math.round((opened / totalSent) * 100) : 0;
    const replyRate = totalSent > 0 ? Math.round((replied / totalSent) * 100) : 0;

    return { totalSent, opened, replied, callsScheduled, openRate, replyRate };
  }, [outreaches]);

  const outreachOverTime = useMemo(() => {
    const last14Days = eachDayOfInterval({ start: subDays(new Date(), 13), end: new Date() });
    return last14Days.map((day) => {
      const dayStr = format(day, "yyyy-MM-dd");
      const sent = outreaches.filter((o) => o.sent_at?.startsWith(dayStr)).length;
      const opened = outreaches.filter((o) => o.opened_at?.startsWith(dayStr)).length;
      return { date: format(day, "MMM d"), sent, opened };
    });
  }, [outreaches]);

  const stageDistribution = useMemo(() => {
    return [
      { name: "Sent", value: outreaches.filter((o) => o.stage === "pitch_sent").length, color: "#6366f1" },
      { name: "Opened", value: outreaches.filter((o) => o.stage === "opened").length, color: "#f59e0b" },
      { name: "Replied", value: outreaches.filter((o) => o.stage === "replied").length, color: "#10b981" },
      { name: "Call Set", value: outreaches.filter((o) => o.stage === "call_scheduled").length, color: "#8b5cf6" },
      { name: "Negotiating", value: outreaches.filter((o) => o.stage === "in_negotiation").length, color: "#ec4899" },
      { name: "Passed", value: outreaches.filter((o) => o.stage === "passed").length, color: "#ef4444" },
    ].filter((s) => s.value > 0);
  }, [outreaches]);

  const firmTypeData = useMemo(() => {
    const dist = firms.reduce((acc, firm) => {
      const type = firm.firm_type || "Other";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(dist).map(([name, value]) => ({ name, value }));
  }, [firms]);

  const topInvestorTypes = useMemo(() => {
    const reduced = outreaches.reduce((acc, o) => {
      const firm = firms.find((f) => f.id === o.firm_id);
      const type = firm?.firm_type || "Other";
      if (!acc[type]) acc[type] = { sent: 0, opened: 0, replied: 0 };
      if (o.sent_at) acc[type].sent++;
      if (o.opened_at) acc[type].opened++;
      if (o.replied_at) acc[type].replied++;
      return acc;
    }, {});

    return Object.entries(reduced)
      .map(([type, data]) => ({
        type,
        ...data,
        openRate: data.sent > 0 ? Math.round((data.opened / data.sent) * 100) : 0,
        replyRate: data.sent > 0 ? Math.round((data.replied / data.sent) * 100) : 0,
      }))
      .sort((a, b) => b.openRate - a.openRate);
  }, [outreaches, firms]);

  if (isLoading) {
    return (
      <div className="relative min-h-[55vh]">
        <GlobalStyles />
        <LiquidBackground />
        <div className="flex h-[55vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading analytics…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <GlobalStyles />
      <LiquidBackground />

      <div className="space-y-6">
        <GlassHeader subtitle="Track your fundraising performance across outreach, pipeline, and investor coverage." />

        {/* Key metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile title="Emails Sent" value={stats.totalSent} icon={Mail} />
          <StatTile title="Open Rate" value={`${stats.openRate}%`} icon={Eye} tint="from-amber-400/25 to-orange-400/20" />
          <StatTile title="Reply Rate" value={`${stats.replyRate}%`} icon={MessageSquare} tint="from-emerald-400/22 to-green-400/18" />
          <StatTile title="Calls Scheduled" value={stats.callsScheduled} icon={TrendingUp} tint="from-violet-400/25 to-indigo-400/20" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Outreach over time */}
          <ChartShell title="Outreach Activity" description="Emails sent and opened over the last 14 days.">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={outreachOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                  <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                  <Tooltip content={<GlassTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="sent" stroke="#6366f1" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="opened" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartShell>

          {/* Stage distribution */}
          <ChartShell title="Pipeline Distribution" description="Current status breakdown of all outreach.">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stageDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={108}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {stageDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<GlassTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartShell>

          {/* Investor type distribution */}
          <ChartShell title="Investor Types" description="Distribution of investors in your database.">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={firmTypeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.35)" />
                  <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} angle={-45} textAnchor="end" height={80} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                  <Tooltip content={<GlassTooltip />} />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                    {firmTypeData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartShell>

          {/* Performance by investor type */}
          <ChartShell title="Performance by Investor Type" description="Open and reply rates by investor category.">
            <div className="space-y-4">
              {topInvestorTypes.slice(0, 5).map((t) => (
                <div key={t.type} className="flex items-center gap-4">
                  <div className="w-28 text-sm font-semibold text-slate-800 truncate">{t.type}</div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-2.5 rounded-full border border-white/60 bg-white/55 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#7C3AED,#EC4899,#3B82F6)]"
                          style={{ width: `${t.openRate}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 w-10">{t.openRate}%</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2.5 rounded-full border border-white/60 bg-white/55 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,#22C55E,#34D399,#3B82F6)]"
                          style={{ width: `${t.replyRate}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500 w-10">{t.replyRate}%</span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 whitespace-nowrap">{t.sent} sent</div>
                </div>
              ))}

              <div className="mt-4 flex items-center gap-4 rounded-2xl border-2 border-white/60 bg-white/45 px-4 py-3 backdrop-blur-2xl text-xs">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-[linear-gradient(90deg,#7C3AED,#EC4899,#3B82F6)]" />
                  <span className="text-slate-600">Open Rate</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded bg-[linear-gradient(90deg,#22C55E,#34D399,#3B82F6)]" />
                  <span className="text-slate-600">Reply Rate</span>
                </div>
              </div>
            </div>
          </ChartShell>
        </div>

        {/* Optional: a subtle footer meta row */}
        <div className="text-xs text-slate-500">
          Data sources: outreaches ({outreaches.length}), firms ({firms.length}), matches ({matches.length}).
        </div>
      </div>
    </div>
  );
}