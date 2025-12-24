import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Zap } from 'lucide-react';
import { cn } from "@/lib/utils";
import { LiquidGlassCard, GlassBody, GlassHeader, GlassInset, GlassKpi } from "@/components/ui/liquid-glass";

export default function DealVelocityMetrics({ outreaches, deals }) {
  // Calculate time-based metrics
  const getLast30Days = () => {
    const data = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const outreachCount = outreaches.filter(o => 
        o.sent_at && o.sent_at.startsWith(dateStr)
      ).length;
      
      const replyCount = outreaches.filter(o => 
        o.replied_at && o.replied_at.startsWith(dateStr)
      ).length;

      data.push({
        date: `${date.getMonth() + 1}/${date.getDate()}`,
        outreach: outreachCount,
        replies: replyCount,
      });
    }
    return data;
  };

  const velocityData = getLast30Days();

  // Calculate average time to response
  const responseTimes = outreaches
    .filter(o => o.sent_at && o.replied_at)
    .map(o => {
      const sent = new Date(o.sent_at);
      const replied = new Date(o.replied_at);
      return (replied - sent) / (1000 * 60 * 60); // hours
    });

  const avgResponseTime = responseTimes.length > 0
    ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(1)
    : null;

  // Calculate deal cycle times
  const dealCycleTimes = deals
    .filter(d => d.status === 'Won' && d.actual_close_date)
    .map(d => {
      const created = new Date(d.created_date);
      const closed = new Date(d.actual_close_date);
      return Math.round((closed - created) / (1000 * 60 * 60 * 24)); // days
    });

  const avgDealCycle = dealCycleTimes.length > 0
    ? Math.round(dealCycleTimes.reduce((a, b) => a + b, 0) / dealCycleTimes.length)
    : null;

  const winRate = deals.length > 0 
    ? ((deals.filter(d => d.status === 'Won').length / deals.length) * 100).toFixed(0) 
    : 0;

  return (
    <LiquidGlassCard gradient="from-purple-500 to-pink-500">
      <GlassBody>
        <GlassHeader
          icon={Zap}
          title="Deal velocity"
          subtitle="How quickly outreach converts into calls and active deals."
        />

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <GlassKpi
            label="Avg response time"
            value={avgResponseTime ? `${avgResponseTime}h` : 'N/A'}
            sub="From sent to reply"
            tone={avgResponseTime && avgResponseTime < 24 ? "emerald" : avgResponseTime && avgResponseTime < 48 ? "amber" : "rose"}
          />

          <GlassKpi
            label="Avg deal cycle"
            value={avgDealCycle ? `${avgDealCycle}d` : 'N/A'}
            sub="From start to close"
            tone="indigo"
          />

          <GlassKpi
            label="Win rate"
            value={`${winRate}%`}
            sub="Won / total deals"
            tone="emerald"
          />
        </div>

        <div className="mt-5">
          <GlassInset>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={velocityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="outreach" stroke="#6366f1" strokeWidth={2} name="Outreach Sent" />
                <Line type="monotone" dataKey="replies" stroke="#10b981" strokeWidth={2} name="Replies" />
              </LineChart>
            </ResponsiveContainer>
          </GlassInset>
        </div>
      </GlassBody>
    </LiquidGlassCard>
  );
}