import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Brain, Loader2, TrendingUp, Target, Clock, Sparkles,
  ThumbsUp, ThumbsDown, Mail, Calendar, ArrowRight,
  Lightbulb, AlertCircle, CheckCircle, MessageSquare
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

export default function AIInsightsPanel({ startup, matches, outreaches, contacts, firms }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [insights, setInsights] = useState(null);

  const generateInsights = async () => {
    setIsAnalyzing(true);

    try {
      // Prepare data for analysis
      const outreachData = outreaches.map(o => ({
        firm: firms[o.firm_id]?.company_name,
        firm_type: firms[o.firm_id]?.firm_type,
        stage: o.stage,
        opened: !!o.opened_at,
        replied: !!o.replied_at,
        open_count: o.open_count,
        sent_date: o.sent_at,
      }));

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an expert fundraising advisor analyzing a startup's investor outreach data.

Startup: ${startup?.company_name}
Industry: ${startup?.industry?.join(', ')}
Stage: ${startup?.stage}

Outreach History:
${JSON.stringify(outreachData, null, 2)}

Analyze this data and provide:
1. Which investor types (VC, Angel, CVC, etc.) show the most engagement
2. Patterns in successful vs unsuccessful outreach
3. Optimal timing recommendations
4. Personalized follow-up strategies for different scenarios
5. Predicted success factors
6. Risk factors to address

Be specific and data-driven in your analysis.`,
        response_json_schema: {
          type: 'object',
          properties: {
            engagement_analysis: {
              type: 'object',
              properties: {
                best_investor_types: { type: 'array', items: { type: 'string' } },
                best_engagement_rate: { type: 'number' },
                worst_investor_types: { type: 'array', items: { type: 'string' } },
                insights: { type: 'array', items: { type: 'string' } }
              }
            },
            success_patterns: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  pattern: { type: 'string' },
                  impact: { type: 'string' },
                  recommendation: { type: 'string' }
                }
              }
            },
            timing_recommendations: {
              type: 'object',
              properties: {
                best_days: { type: 'array', items: { type: 'string' } },
                best_times: { type: 'string' },
                followup_timing: { type: 'string' },
                insights: { type: 'array', items: { type: 'string' } }
              }
            },
            followup_strategies: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  scenario: { type: 'string' },
                  strategy: { type: 'string' },
                  template_suggestion: { type: 'string' },
                  urgency: { type: 'string' }
                }
              }
            },
            predicted_success_factors: { type: 'array', items: { type: 'string' } },
            risk_factors: { type: 'array', items: { type: 'string' } },
            next_best_actions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  action: { type: 'string' },
                  priority: { type: 'string' },
                  expected_impact: { type: 'string' }
                }
              }
            },
            overall_health_score: { type: 'number' },
            summary: { type: 'string' }
          }
        }
      });

      setInsights(result);
    } catch (error) {
      console.error('Error generating insights:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getPriorityColor = (priority) => {
    const colors = {
      high: 'bg-red-100 text-red-700',
      medium: 'bg-amber-100 text-amber-700',
      low: 'bg-slate-100 text-slate-700',
    };
    return colors[priority?.toLowerCase()] || colors.medium;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">AI CRM Insights</h3>
            <p className="text-sm text-slate-500">Powered by machine learning</p>
          </div>
        </div>
        <Button 
          onClick={generateInsights}
          disabled={isAnalyzing}
          variant={insights ? "outline" : "default"}
          className={!insights ? "bg-violet-600 hover:bg-violet-700" : ""}
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              {insights ? 'Refresh' : 'Generate Insights'}
            </>
          )}
        </Button>
      </div>

      {!insights && !isAnalyzing && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <Brain className="w-16 h-16 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-700 mb-2">AI-Powered CRM Intelligence</h3>
            <p className="text-slate-500 text-center max-w-md mb-6">
              Get personalized insights on investor engagement patterns, optimal timing, 
              and follow-up strategies based on your outreach data.
            </p>
            <Button onClick={generateInsights} className="bg-violet-600 hover:bg-violet-700">
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Insights
            </Button>
          </CardContent>
        </Card>
      )}

      {insights && (
        <>
          {/* Health Score */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-slate-500">Pipeline Health Score</p>
                  <p className="text-3xl font-bold text-slate-900">{insights.overall_health_score}/100</p>
                </div>
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center",
                  insights.overall_health_score >= 70 ? "bg-emerald-100" :
                  insights.overall_health_score >= 50 ? "bg-amber-100" : "bg-red-100"
                )}>
                  {insights.overall_health_score >= 70 ? (
                    <ThumbsUp className="w-8 h-8 text-emerald-600" />
                  ) : insights.overall_health_score >= 50 ? (
                    <Target className="w-8 h-8 text-amber-600" />
                  ) : (
                    <AlertCircle className="w-8 h-8 text-red-600" />
                  )}
                </div>
              </div>
              <Progress value={insights.overall_health_score} className="h-2" />
              <p className="text-sm text-slate-600 mt-4">{insights.summary}</p>
            </CardContent>
          </Card>

          {/* Engagement Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                Engagement Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-3 bg-emerald-50 rounded-lg">
                  <p className="text-xs text-emerald-600 font-medium mb-1">Best Performing</p>
                  <div className="flex flex-wrap gap-1">
                    {insights.engagement_analysis?.best_investor_types?.map((type, i) => (
                      <Badge key={i} className="bg-emerald-100 text-emerald-700">{type}</Badge>
                    ))}
                  </div>
                </div>
                <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-xs text-red-600 font-medium mb-1">Lower Response</p>
                  <div className="flex flex-wrap gap-1">
                    {insights.engagement_analysis?.worst_investor_types?.map((type, i) => (
                      <Badge key={i} className="bg-red-100 text-red-700">{type}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              <ul className="space-y-2">
                {insights.engagement_analysis?.insights?.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    {insight}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Timing Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Optimal Timing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">Best Days</p>
                  <p className="font-medium text-slate-900">
                    {insights.timing_recommendations?.best_days?.join(', ')}
                  </p>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">Best Time</p>
                  <p className="font-medium text-slate-900">
                    {insights.timing_recommendations?.best_times}
                  </p>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">Follow-up After</p>
                  <p className="font-medium text-slate-900">
                    {insights.timing_recommendations?.followup_timing}
                  </p>
                </div>
              </div>
              <ul className="space-y-2">
                {insights.timing_recommendations?.insights?.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <Clock className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    {insight}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Follow-up Strategies */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-violet-600" />
                Personalized Follow-up Strategies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {insights.followup_strategies?.map((strategy, i) => (
                  <div key={i} className="p-4 border border-slate-200 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <p className="font-medium text-slate-900">{strategy.scenario}</p>
                      <Badge className={getPriorityColor(strategy.urgency)}>
                        {strategy.urgency}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 mb-3">{strategy.strategy}</p>
                    {strategy.template_suggestion && (
                      <div className="p-3 bg-violet-50 rounded-lg">
                        <p className="text-xs font-medium text-violet-700 mb-1">Suggested Message</p>
                        <p className="text-sm text-violet-900">{strategy.template_suggestion}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Next Best Actions */}
          <Card className="bg-gradient-to-br from-violet-50 to-purple-50 border-violet-200">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-violet-900">
                <Target className="w-5 h-5" />
                Recommended Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {insights.next_best_actions?.map((action, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-white rounded-lg">
                    <span className="flex-shrink-0 w-6 h-6 bg-violet-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-slate-900">{action.action}</p>
                        <Badge className={getPriorityColor(action.priority)} variant="secondary">
                          {action.priority}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600">{action.expected_impact}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Risk Factors */}
          {insights.risk_factors?.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                  <AlertCircle className="w-5 h-5" />
                  Risk Factors to Address
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {insights.risk_factors.map((risk, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                      <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      {risk}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}