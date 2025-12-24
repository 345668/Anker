import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sparkles, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from "@/lib/utils";
import { LiquidGlassCard, GlassBody, GlassHeader, GlassInset, GlassKpi } from "@/components/ui/liquid-glass";

export default function FundraisingHealthScore({ startup, matches, outreaches, deals }) {
  // Calculate health score based on multiple factors
  let healthScore = 0;
  const factors = [];

  // Pitch deck quality (30 points)
  const deckScore = startup.pitch_deck_extracted?.analysis?.overall_score || 0;
  const deckPoints = (deckScore / 100) * 30;
  healthScore += deckPoints;
  factors.push({
    name: 'Pitch Deck Quality',
    score: deckScore,
    points: deckPoints.toFixed(0),
    max: 30,
    status: deckScore >= 70 ? 'good' : deckScore >= 50 ? 'fair' : 'poor'
  });

  // Investor engagement (25 points)
  const totalSent = outreaches.filter(o => o.stage !== 'draft').length;
  const replied = outreaches.filter(o => o.stage === 'replied' || o.stage === 'call_scheduled').length;
  const engagementRate = totalSent > 0 ? (replied / totalSent) * 100 : 0;
  const engagementPoints = (engagementRate / 100) * 25;
  healthScore += engagementPoints;
  factors.push({
    name: 'Investor Engagement',
    score: engagementRate.toFixed(0),
    points: engagementPoints.toFixed(0),
    max: 25,
    status: engagementRate >= 30 ? 'good' : engagementRate >= 15 ? 'fair' : 'poor'
  });

  // Pipeline activity (20 points)
  const activePipeline = outreaches.filter(o => 
    ['pitch_sent', 'opened', 'replied', 'call_scheduled'].includes(o.stage)
  ).length;
  const pipelinePoints = Math.min(activePipeline / 10 * 20, 20);
  healthScore += pipelinePoints;
  factors.push({
    name: 'Active Pipeline',
    score: activePipeline,
    points: pipelinePoints.toFixed(0),
    max: 20,
    status: activePipeline >= 10 ? 'good' : activePipeline >= 5 ? 'fair' : 'poor'
  });

  // Match quality (15 points)
  const avgMatchScore = matches.length > 0 
    ? matches.reduce((sum, m) => sum + (m.match_score || 0), 0) / matches.length
    : 0;
  const matchPoints = (avgMatchScore / 100) * 15;
  healthScore += matchPoints;
  factors.push({
    name: 'Match Quality',
    score: avgMatchScore.toFixed(0),
    points: matchPoints.toFixed(0),
    max: 15,
    status: avgMatchScore >= 70 ? 'good' : avgMatchScore >= 50 ? 'fair' : 'poor'
  });

  // Deal momentum (10 points)
  const activeDeals = deals.filter(d => d.status === 'Active').length;
  const dealPoints = Math.min(activeDeals / 3 * 10, 10);
  healthScore += dealPoints;
  factors.push({
    name: 'Active Deals',
    score: activeDeals,
    points: dealPoints.toFixed(0),
    max: 10,
    status: activeDeals >= 3 ? 'good' : activeDeals >= 1 ? 'fair' : 'poor'
  });

  const finalScore = Math.round(healthScore);

  const getHealthStatus = (score) => {
    if (score >= 80) return { label: 'Excellent', icon: CheckCircle, tone: 'emerald' };
    if (score >= 60) return { label: 'Good', icon: CheckCircle, tone: 'indigo' };
    if (score >= 40) return { label: 'Fair', icon: AlertTriangle, tone: 'amber' };
    return { label: 'Needs Attention', icon: AlertTriangle, tone: 'rose' };
  };

  const healthStatus = getHealthStatus(finalScore);
  const HealthIcon = healthStatus.icon;

  const scoreTone = 
    finalScore >= 80 ? 'text-emerald-700' :
    finalScore >= 60 ? 'text-indigo-700' :
    finalScore >= 40 ? 'text-amber-700' :
    'text-rose-700';

  return (
    <LiquidGlassCard gradient="from-indigo-500 to-purple-500">
      <GlassBody>
        <GlassHeader
          icon={Sparkles}
          title="Fundraising health score"
          subtitle="Single composite indicator to track fundraising momentum."
          right={
            <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800 px-4 py-2 shadow-lg">
              {startup?.stage || "—"}
            </Badge>
          }
        />

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-5">
          <GlassInset className="p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">Overall health</p>
                <p className={cn("mt-2 text-4xl font-bold", scoreTone)}>{finalScore}</p>
                <p className="mt-1 text-xs text-slate-500">Score out of 100</p>
              </div>
              {finalScore < 60 ? (
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-rose-700">
                  <AlertTriangle className="h-4 w-4" />
                  Needs attention
                </div>
              ) : null}
            </div>

            <Progress value={finalScore} className="h-2 mt-4" />

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border-2 border-white/60 bg-white/50 p-3">
                <p className="text-xs font-semibold text-slate-600">Match avg</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{avgMatchScore.toFixed(0)}</p>
              </div>
              <div className="rounded-2xl border-2 border-white/60 bg-white/50 p-3">
                <p className="text-xs font-semibold text-slate-600">Response</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{engagementRate.toFixed(1)}%</p>
              </div>
              <div className="rounded-2xl border-2 border-white/60 bg-white/50 p-3">
                <p className="text-xs font-semibold text-slate-600">Active</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{activeDeals}</p>
              </div>
            </div>
          </GlassInset>

          <GlassInset className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <HealthIcon className={cn("h-5 w-5", 
                healthStatus.tone === 'emerald' ? 'text-emerald-600' :
                healthStatus.tone === 'indigo' ? 'text-indigo-600' :
                healthStatus.tone === 'amber' ? 'text-amber-600' :
                'text-rose-600'
              )} />
              <p className="text-sm font-semibold text-slate-700">{healthStatus.label}</p>
            </div>
            <p className="text-sm text-slate-600 mb-4">How to improve:</p>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>• Increase reply rate with tighter personalization and better subject lines.</li>
              <li>• Raise match quality by refining investor thesis and filtering criteria.</li>
              <li>• Move more prospects to calls by adding a "next step" CTA in every email.</li>
            </ul>
          </GlassInset>
        </div>

        <div className="mt-5">
          <p className="text-sm font-semibold text-slate-700 mb-3">Factor breakdown</p>
          <div className="space-y-2">
            {factors.map((factor, i) => (
              <div key={i} className="rounded-2xl border-2 border-white/60 bg-white/50 backdrop-blur-xl p-3 shadow">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">{factor.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={factor.status === 'good' ? 'default' : 'outline'} 
                           className={cn("text-xs",
                             factor.status === 'good' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                             factor.status === 'fair' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                             'bg-red-100 text-red-700 border-red-200'
                           )}>
                      {factor.score}
                    </Badge>
                    <span className="text-xs text-slate-500">{factor.points}/{factor.max} pts</span>
                  </div>
                </div>
                <Progress value={(factor.points / factor.max) * 100} className="h-1.5" />
              </div>
            ))}
          </div>
        </div>
      </GlassBody>
    </LiquidGlassCard>
  );
}