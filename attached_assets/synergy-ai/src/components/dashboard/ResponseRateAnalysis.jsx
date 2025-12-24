import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Activity } from 'lucide-react';
import { cn } from "@/lib/utils";
import { LiquidGlassCard, GlassBody, GlassHeader, GlassInset, GlassKpi } from "@/components/ui/liquid-glass";

export default function ResponseRateAnalysis({ outreaches, interactions }) {
  const totalSent = outreaches.filter(o => o.stage !== 'draft').length;
  const totalOpened = outreaches.filter(o => o.opened_at).length;
  const totalReplied = outreaches.filter(o => o.stage === 'replied' || o.stage === 'call_scheduled').length;
  const totalMeetings = outreaches.filter(o => o.stage === 'call_scheduled').length;

  const openRate = totalSent > 0 ? (totalOpened / totalSent * 100).toFixed(1) : 0;
  const replyRate = totalSent > 0 ? (totalReplied / totalSent * 100).toFixed(1) : 0;
  const meetingRate = totalReplied > 0 ? (totalMeetings / totalReplied * 100).toFixed(1) : 0;

  const data = [
    { stage: 'Sent', rate: 100, count: totalSent },
    { stage: 'Opened', rate: parseFloat(openRate), count: totalOpened },
    { stage: 'Replied', rate: parseFloat(replyRate), count: totalReplied },
    { stage: 'Meeting', rate: parseFloat(meetingRate), count: totalMeetings },
  ];

  return (
    <LiquidGlassCard gradient="from-emerald-500 to-teal-500">
      <GlassBody>
        <GlassHeader
          icon={Activity}
          title="Response rate funnel"
          subtitle="Engagement signal: replies relative to outreaches."
          right={
            <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800 px-4 py-2 shadow-lg">
              {totalReplied}/{totalSent} replied
            </Badge>
          }
        />

        <div className="mt-6">
          <GlassInset>
            <div className="space-y-4">
              {data.map((item, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">{item.stage}</span>
                      <Badge variant="outline" className="text-xs">{item.count}</Badge>
                    </div>
                    <span className={cn("text-sm font-bold",
                      item.rate >= 50 ? 'text-emerald-600' :
                      item.rate >= 30 ? 'text-amber-600' :
                      'text-red-600'
                    )}>
                      {item.rate}%
                    </span>
                  </div>
                  <Progress value={item.rate} className="h-2" />
                </div>
              ))}
            </div>
          </GlassInset>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <GlassKpi
            label="Reply rate"
            value={`${replyRate}%`}
            sub="Target: 15%+"
            tone={parseFloat(replyRate) >= 15 ? "emerald" : parseFloat(replyRate) >= 8 ? "amber" : "rose"}
          />
          <GlassKpi
            label="Meeting conv."
            value={`${meetingRate}%`}
            sub="Calls from replies"
            tone={parseFloat(meetingRate) >= 30 ? "emerald" : "indigo"}
          />
        </div>
      </GlassBody>
    </LiquidGlassCard>
  );
}