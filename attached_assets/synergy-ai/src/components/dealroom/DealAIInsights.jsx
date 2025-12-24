import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Sparkles, Loader2, TrendingUp, AlertTriangle, Target,
  CheckCircle, Flame, ThermometerSun, Snowflake
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const temperatureConfig = {
  hot: { icon: Flame, color: 'text-red-500', bg: 'bg-red-100', label: 'Hot 🔥' },
  warm: { icon: ThermometerSun, color: 'text-orange-500', bg: 'bg-orange-100', label: 'Warm ☀️' },
  cold: { icon: Snowflake, color: 'text-blue-500', bg: 'bg-blue-100', label: 'Cold ❄️' },
  frozen: { icon: Snowflake, color: 'text-slate-400', bg: 'bg-slate-100', label: 'Frozen 🧊' },
};

export default function DealAIInsights({ dealRoom, startup, matches, outreaches, firms }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const queryClient = useQueryClient();

  const updateDealRoomMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DealRoom.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(['dealRoom']),
  });

  const analyzeProgress = async () => {
    setIsAnalyzing(true);

    try {
      // Prepare context
      const repliedOutreaches = outreaches.filter(o => o.replied_at);
      const positiveOutreaches = outreaches.filter(o => 
        o.sentiment_analysis?.overall_sentiment === 'positive'
      );
      const scheduledCalls = outreaches.filter(o => o.stage === 'call_scheduled');
      
      const daysRemaining = dealRoom.target_close_date ? 
        Math.ceil((new Date(dealRoom.target_close_date) - new Date()) / (1000 * 60 * 60 * 24)) : 0;
      
      const progressPercent = (dealRoom.raised_amount / dealRoom.target_amount * 100).toFixed(0);

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an expert venture capital analyst. Analyze this funding round's progress and provide strategic insights.

DEAL CONTEXT:
Deal: ${dealRoom.name}
Round: ${dealRoom.funding_round}
Target: $${dealRoom.target_amount.toLocaleString()}
Raised: $${dealRoom.raised_amount.toLocaleString()} (${progressPercent}%)
Status: ${dealRoom.status}
Days to Close: ${daysRemaining}

STARTUP:
Name: ${startup?.company_name}
Stage: ${startup?.stage}
Industry: ${startup?.industry?.join(', ')}
Traction: ${JSON.stringify(startup?.traction_metrics || {})}

INVESTOR ENGAGEMENT:
- Total matches: ${matches.length}
- Active outreaches: ${outreaches.length}
- Replied: ${repliedOutreaches.length}
- Positive sentiment: ${positiveOutreaches.length}
- Calls scheduled: ${scheduledCalls.length}
- Lead investor: ${dealRoom.lead_investor_id ? 'Yes' : 'No'}

OUTREACH DETAILS:
${outreaches.slice(0, 10).map(o => {
  const firm = firms.find(f => f.id === o.firm_id);
  return `- ${firm?.company_name}: ${o.stage}, opened ${o.open_count} times`;
}).join('\n')}

ANALYSIS REQUIRED:
1. Deal Temperature (hot/warm/cold/frozen) - assess momentum
2. Success Probability (0-100) - likelihood of closing
3. Deal Progression Analysis - where are we vs where we should be?
4. Risk Factors - what could derail this deal?
5. Opportunities - what's working well?
6. Critical Next Steps - prioritized actions needed
7. Timeline Assessment - can we close on time?
8. Investor Pipeline Health - quality and quantity analysis

Be specific, data-driven, and actionable. Reference actual metrics.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            deal_temperature: { 
              type: 'string', 
              enum: ['hot', 'warm', 'cold', 'frozen'] 
            },
            success_probability: { type: 'number' },
            confidence_level: { type: 'string' },
            progression_status: {
              type: 'object',
              properties: {
                current_stage: { type: 'string' },
                expected_stage: { type: 'string' },
                behind_schedule: { type: 'boolean' },
                assessment: { type: 'string' }
              }
            },
            risk_factors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  risk: { type: 'string' },
                  severity: { type: 'string', enum: ['high', 'medium', 'low'] },
                  impact: { type: 'string' },
                  mitigation: { type: 'string' }
                }
              }
            },
            opportunities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  opportunity: { type: 'string' },
                  potential: { type: 'string', enum: ['high', 'medium', 'low'] },
                  action: { type: 'string' }
                }
              }
            },
            critical_next_steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  step: { type: 'string' },
                  priority: { type: 'string', enum: ['critical', 'high', 'medium'] },
                  deadline: { type: 'string' },
                  rationale: { type: 'string' }
                }
              }
            },
            timeline_assessment: {
              type: 'object',
              properties: {
                on_track: { type: 'boolean' },
                estimated_close_date: { type: 'string' },
                analysis: { type: 'string' }
              }
            },
            investor_pipeline: {
              type: 'object',
              properties: {
                health_score: { type: 'number' },
                quality_assessment: { type: 'string' },
                quantity_assessment: { type: 'string' },
                recommendations: { type: 'array', items: { type: 'string' } }
              }
            },
            key_metrics: {
              type: 'object',
              properties: {
                response_rate: { type: 'number' },
                average_time_to_response: { type: 'string' },
                conversion_rate: { type: 'number' }
              }
            },
            summary: { type: 'string' }
          }
        }
      });

      // Update deal room with insights
      await updateDealRoomMutation.mutateAsync({
        id: dealRoom.id,
        data: {
          ai_insights: result,
          deal_temperature: result.deal_temperature,
          success_probability: result.success_probability,
          risk_factors: result.risk_factors?.map(r => r.risk) || [],
        }
      });

    } catch (error) {
      console.error('Analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const insights = dealRoom.ai_insights;
  const tempConfig = temperatureConfig[dealRoom.deal_temperature] || temperatureConfig.warm;
  const TempIcon = tempConfig.icon;

  if (!insights) {
    return (
      <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            AI Deal Insights
          </CardTitle>
          <CardDescription>
            Get comprehensive AI analysis of your deal progression, risks, and opportunities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={analyzeProgress}
            disabled={isAnalyzing}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Deal Progress...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Analyze Deal Progress
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn("p-3 rounded-xl", tempConfig.bg)}>
                <TempIcon className={cn("w-6 h-6", tempConfig.color)} />
              </div>
              <div>
                <p className="text-sm text-slate-600">Deal Temperature</p>
                <p className="text-xl font-bold text-slate-900">{tempConfig.label}</p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-sm text-slate-600">Success Probability</p>
              <div className="flex items-center gap-2">
                <Progress value={insights.success_probability} className="w-32 h-2" />
                <span className="text-xl font-bold text-indigo-600">
                  {insights.success_probability}%
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{insights.confidence_level}</p>
            </div>

            <Button variant="outline" size="sm" onClick={analyzeProgress}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>

          {insights.summary && (
            <div className="mt-4 p-3 bg-white rounded-lg">
              <p className="text-sm text-slate-700">{insights.summary}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Key Insights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Progression Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-600" />
              Deal Progression
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Current:</span>
                <span className="font-medium text-slate-900">
                  {insights.progression_status?.current_stage}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Expected:</span>
                <span className="font-medium text-slate-900">
                  {insights.progression_status?.expected_stage}
                </span>
              </div>
              {insights.progression_status?.behind_schedule && (
                <Badge variant="destructive" className="text-xs">Behind Schedule</Badge>
              )}
              <p className="text-xs text-slate-600 mt-2">
                {insights.progression_status?.assessment}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {insights.timeline_assessment?.on_track ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                )}
                <span className="text-xs font-medium">
                  {insights.timeline_assessment?.on_track ? 'On Track' : 'Needs Attention'}
                </span>
              </div>
              {insights.timeline_assessment?.estimated_close_date && (
                <p className="text-xs text-slate-600">
                  Estimated close: {insights.timeline_assessment.estimated_close_date}
                </p>
              )}
              <p className="text-xs text-slate-600">
                {insights.timeline_assessment?.analysis}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Health */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-violet-600" />
              Pipeline Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Health Score</span>
                <span className="text-lg font-bold text-violet-600">
                  {insights.investor_pipeline?.health_score}/100
                </span>
              </div>
              <Progress value={insights.investor_pipeline?.health_score} className="h-1.5" />
              <p className="text-xs text-slate-600 mt-2">
                {insights.investor_pipeline?.quality_assessment}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risks and Opportunities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Risk Factors */}
        {insights.risk_factors?.length > 0 && (
          <Card className="border-red-200 bg-red-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-4 h-4" />
                Risk Factors ({insights.risk_factors.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {insights.risk_factors.slice(0, 3).map((risk, i) => (
                  <div key={i} className="p-2 bg-white rounded border border-red-100">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs font-medium text-red-900">{risk.risk}</span>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-xs",
                          risk.severity === 'high' && 'border-red-500 text-red-700',
                          risk.severity === 'medium' && 'border-amber-500 text-amber-700',
                          risk.severity === 'low' && 'border-blue-500 text-blue-700'
                        )}
                      >
                        {risk.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-red-700">{risk.impact}</p>
                    <p className="text-xs text-red-600 mt-1">
                      <span className="font-medium">Fix:</span> {risk.mitigation}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Opportunities */}
        {insights.opportunities?.length > 0 && (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-emerald-700">
                <CheckCircle className="w-4 h-4" />
                Opportunities ({insights.opportunities.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {insights.opportunities.slice(0, 3).map((opp, i) => (
                  <div key={i} className="p-2 bg-white rounded border border-emerald-100">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs font-medium text-emerald-900">{opp.opportunity}</span>
                      <Badge 
                        variant="outline" 
                        className="text-xs border-emerald-500 text-emerald-700"
                      >
                        {opp.potential}
                      </Badge>
                    </div>
                    <p className="text-xs text-emerald-700">
                      <span className="font-medium">Action:</span> {opp.action}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Critical Next Steps */}
      {insights.critical_next_steps?.length > 0 && (
        <Card className="bg-gradient-to-br from-violet-50 to-indigo-50 border-indigo-200">
          <CardHeader>
            <CardTitle className="text-base text-indigo-900">Critical Next Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {insights.critical_next_steps.map((step, i) => {
                const priorityColors = {
                  critical: 'bg-red-100 text-red-700',
                  high: 'bg-orange-100 text-orange-700',
                  medium: 'bg-blue-100 text-blue-700'
                };
                return (
                  <div key={i} className="p-3 bg-white rounded-lg border border-indigo-100">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="flex-shrink-0 w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-medium">
                          {i + 1}
                        </span>
                        <Badge className={cn("text-xs", priorityColors[step.priority])}>
                          {step.priority}
                        </Badge>
                        <span className="text-xs text-slate-500">{step.deadline}</span>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-slate-900 mb-1 ml-7">{step.step}</p>
                    <p className="text-xs text-slate-600 ml-7">{step.rationale}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}