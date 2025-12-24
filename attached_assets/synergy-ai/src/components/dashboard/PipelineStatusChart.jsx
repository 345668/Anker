import React from 'react';
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Target } from 'lucide-react';
import { LiquidGlassCard, GlassBody, GlassHeader, GlassInset } from "@/components/ui/liquid-glass";

const COLORS = ['#94a3b8', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'];

export default function PipelineStatusChart({ outreaches, deals }) {
  const stageCounts = {
    draft: outreaches.filter(o => o.stage === 'draft').length,
    pitch_sent: outreaches.filter(o => o.stage === 'pitch_sent').length,
    opened: outreaches.filter(o => o.stage === 'opened').length,
    replied: outreaches.filter(o => o.stage === 'replied').length,
    call_scheduled: outreaches.filter(o => o.stage === 'call_scheduled').length,
    in_negotiation: outreaches.filter(o => o.stage === 'in_negotiation').length,
  };

  const data = Object.entries(stageCounts)
    .filter(([_, count]) => count > 0)
    .map(([stage, count]) => ({
      name: stage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: count,
    }));

  const total = outreaches.length;
  const activeDeals = deals.filter(d => d.status === "Active").length;

  return (
    <LiquidGlassCard gradient="from-blue-500 to-purple-500">
      <GlassBody>
        <GlassHeader
          icon={Target}
          title="Pipeline status"
          subtitle="Stage distribution across outreach and deals."
          right={
            <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800 px-4 py-2 shadow-lg">
              {total} outreaches • {activeDeals} active
            </Badge>
          }
        />

        <div className="mt-6">
          <GlassInset>
            {data.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-500">
                No outreach data yet
              </div>
            )}
          </GlassInset>
        </div>
      </GlassBody>
    </LiquidGlassCard>
  );
}