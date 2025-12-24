import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  TrendingUp, FileText, MessageSquare, Target, Loader2, 
  AlertTriangle, CheckCircle, Clock, Eye, Download, Sparkles
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function DealRoomAnalytics({ dealRoom, interactions, outreaches, startup }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const queryClient = useQueryClient();

  const updateDealRoomMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DealRoom.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(['dealRoom']),
  });

  const generateAnalytics = async () => {
    setAnalyzing(true);
    try {
      // Analyze investor engagement patterns
      const documentInteractions = interactions.filter(i => i.type === 'document_shared');
      const emailInteractions = interactions.filter(i => i.type === 'email_sent' || i.type === 'email_opened');
      const meetingInteractions = interactions.filter(i => i.type === 'meeting' || i.type === 'call');
      
      // Extract questions from interactions
      const questionsAsked = interactions
        .filter(i => i.content && i.content.includes('?'))
        .map(i => i.content);

      // Analyze engagement metrics
      const engagementData = {
        total_interactions: interactions.length,
        document_views: documentInteractions.length,
        email_opens: emailInteractions.filter(i => i.type === 'email_opened').length,
        email_replies: outreaches.filter(o => o.stage === 'replied').length,
        meetings_held: meetingInteractions.length,
        avg_response_time: calculateAvgResponseTime(outreaches),
        active_investors: outreaches.filter(o => o.stage !== 'draft' && o.stage !== 'passed').length
      };

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this deal room's investor engagement and predict outcomes.

DEAL ROOM: ${dealRoom.name}
Startup: ${startup?.company_name}
Stage: ${dealRoom.funding_round}
Target: $${dealRoom.target_amount}
Raised: $${dealRoom.raised_amount}

ENGAGEMENT METRICS:
- Total Interactions: ${engagementData.total_interactions}
- Document Views: ${engagementData.document_views}
- Email Opens: ${engagementData.email_opens}
- Email Replies: ${engagementData.email_replies}
- Meetings Held: ${engagementData.meetings_held}
- Active Investors: ${engagementData.active_investors}
- Avg Response Time: ${engagementData.avg_response_time} hours

INVESTOR QUESTIONS (sample):
${questionsAsked.slice(0, 10).join('\n')}

OUTREACH STATUS:
${outreaches.map(o => `- ${o.stage}: ${o.email_subject || 'N/A'}`).slice(0, 10).join('\n')}

Provide comprehensive analytics:
1. ENGAGEMENT SCORE (0-100) - How engaged are investors?
2. DOCUMENT ENGAGEMENT - Which documents get most attention?
3. QUESTION TRENDS - What are investors asking about?
4. CONCERN PATTERNS - What concerns/objections are emerging?
5. POSITIVE SIGNALS - What indicates strong interest?
6. DEAL MOMENTUM - Is momentum increasing or decreasing?
7. DEAL PROBABILITY - Likelihood of closing (0-100%)
8. KEY BLOCKERS - What's preventing progress?
9. RECOMMENDED ACTIONS - Specific steps to improve outcomes
10. INVESTOR SEGMENTATION - Categorize investors by engagement level`,
        response_json_schema: {
          type: 'object',
          properties: {
            engagement_score: { type: 'number' },
            engagement_summary: { type: 'string' },
            document_insights: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  document_type: { type: 'string' },
                  views: { type: 'number' },
                  avg_time_spent: { type: 'string' },
                  investor_feedback: { type: 'string' }
                }
              }
            },
            question_trends: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string' },
                  frequency: { type: 'number' },
                  sample_questions: { type: 'array', items: { type: 'string' } },
                  recommended_response: { type: 'string' }
                }
              }
            },
            concern_patterns: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  concern: { type: 'string' },
                  severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                  frequency: { type: 'number' },
                  mitigation: { type: 'string' }
                }
              }
            },
            positive_signals: { type: 'array', items: { type: 'string' } },
            momentum: {
              type: 'object',
              properties: {
                direction: { type: 'string', enum: ['increasing', 'stable', 'decreasing'] },
                velocity: { type: 'string' },
                explanation: { type: 'string' }
              }
            },
            deal_probability: { type: 'number' },
            probability_factors: {
              type: 'object',
              properties: {
                positive: { type: 'array', items: { type: 'string' } },
                negative: { type: 'array', items: { type: 'string' } }
              }
            },
            key_blockers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  blocker: { type: 'string' },
                  impact: { type: 'string', enum: ['critical', 'high', 'medium'] },
                  solution: { type: 'string' }
                }
              }
            },
            recommended_actions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  action: { type: 'string' },
                  priority: { type: 'string', enum: ['urgent', 'high', 'medium'] },
                  expected_impact: { type: 'string' }
                }
              }
            },
            investor_segments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  segment: { type: 'string' },
                  count: { type: 'number' },
                  engagement_level: { type: 'string' },
                  next_steps: { type: 'string' }
                }
              }
            },
            financial_metrics_needed: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      setAnalytics(result);

      // Update deal room with analytics
      await updateDealRoomMutation.mutateAsync({
        id: dealRoom.id,
        data: {
          ai_insights: {
            ...dealRoom.ai_insights,
            analytics: {
              analyzed_at: new Date().toISOString(),
              engagement_score: result.engagement_score,
              deal_probability: result.deal_probability,
              momentum: result.momentum?.direction,
              key_metrics: engagementData
            }
          }
        }
      });

      toast.success('Analytics generated successfully!');
    } catch (error) {
      console.error('Error generating analytics:', error);
      toast.error('Failed to generate analytics');
    } finally {
      setAnalyzing(false);
    }
  };

  const calculateAvgResponseTime = (outreaches) => {
    const replies = outreaches.filter(o => o.sent_at && o.replied_at);
    if (replies.length === 0) return 0;
    
    const totalHours = replies.reduce((sum, o) => {
      const sent = new Date(o.sent_at);
      const replied = new Date(o.replied_at);
      return sum + (replied - sent) / (1000 * 60 * 60);
    }, 0);
    
    return Math.round(totalHours / replies.length);
  };

  const momentumConfig = {
    increasing: { color: 'text-emerald-600 bg-emerald-50', icon: TrendingUp },
    stable: { color: 'text-blue-600 bg-blue-50', icon: Target },
    decreasing: { color: 'text-red-600 bg-red-50', icon: AlertTriangle }
  };

  return (
    <div className="space-y-6">
      {/* Generate Analytics Button */}
      {!analytics && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI-Powered Deal Analytics</CardTitle>
            <CardDescription>
              Get deep insights into investor engagement, question trends, and deal predictions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={generateAnalytics}
              disabled={analyzing}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {analyzing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generate Analytics
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Analytics Results */}
      {analytics && (
        <>
          {/* Overview Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Engagement Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-bold text-slate-900">
                    {analytics.engagement_score}
                  </div>
                  <Progress value={analytics.engagement_score} className="flex-1" />
                </div>
                <p className="text-xs text-slate-600 mt-2">{analytics.engagement_summary}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Deal Probability</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "text-3xl font-bold",
                    analytics.deal_probability >= 70 ? "text-emerald-600" :
                    analytics.deal_probability >= 40 ? "text-amber-600" : "text-red-600"
                  )}>
                    {analytics.deal_probability}%
                  </div>
                  <Progress 
                    value={analytics.deal_probability} 
                    className={cn(
                      "flex-1",
                      analytics.deal_probability >= 70 && "[&>div]:bg-emerald-600",
                      analytics.deal_probability >= 40 && analytics.deal_probability < 70 && "[&>div]:bg-amber-600",
                      analytics.deal_probability < 40 && "[&>div]:bg-red-600"
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className={momentumConfig[analytics.momentum?.direction]?.color}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Deal Momentum</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {React.createElement(momentumConfig[analytics.momentum?.direction]?.icon, { className: "w-6 h-6" })}
                  <div>
                    <p className="font-semibold capitalize">{analytics.momentum?.direction}</p>
                    <p className="text-xs">{analytics.momentum?.velocity}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Positive Signals & Blockers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-emerald-200 bg-emerald-50">
              <CardHeader>
                <CardTitle className="text-sm text-emerald-900 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Positive Signals ({analytics.positive_signals?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analytics.positive_signals?.map((signal, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-emerald-800">
                      <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      {signal}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="text-sm text-red-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Key Blockers ({analytics.key_blockers?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analytics.key_blockers?.map((blocker, i) => (
                    <div key={i} className="bg-white rounded p-2 border border-red-200">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-red-800">{blocker.blocker}</p>
                        <Badge className="bg-red-200 text-red-800 text-xs">{blocker.impact}</Badge>
                      </div>
                      <p className="text-xs text-red-700">{blocker.solution}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Question Trends */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Investor Question Trends</CardTitle>
              <CardDescription>Most common themes from investor questions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics.question_trends?.map((trend, i) => (
                  <div key={i} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-indigo-600" />
                        <h4 className="font-medium text-slate-900">{trend.category}</h4>
                      </div>
                      <Badge className="bg-indigo-100 text-indigo-700">
                        Asked {trend.frequency} times
                      </Badge>
                    </div>
                    
                    <div className="bg-slate-50 rounded p-2">
                      <p className="text-xs font-medium text-slate-700 mb-1">Sample Questions:</p>
                      <ul className="space-y-1">
                        {trend.sample_questions?.slice(0, 2).map((q, j) => (
                          <li key={j} className="text-xs text-slate-600">• {q}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-indigo-50 rounded p-2">
                      <p className="text-xs font-medium text-indigo-800 mb-1">Recommended Response:</p>
                      <p className="text-xs text-indigo-700">{trend.recommended_response}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Concern Patterns */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Investor Concerns</CardTitle>
              <CardDescription>Recurring concerns and mitigation strategies</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analytics.concern_patterns?.map((concern, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
                    <AlertTriangle className={cn(
                      "w-5 h-5 mt-0.5 flex-shrink-0",
                      concern.severity === 'high' && "text-red-500",
                      concern.severity === 'medium' && "text-amber-500",
                      concern.severity === 'low' && "text-blue-500"
                    )} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-slate-900">{concern.concern}</p>
                        <div className="flex items-center gap-2">
                          <Badge className={cn(
                            "text-xs",
                            concern.severity === 'high' && "bg-red-100 text-red-700",
                            concern.severity === 'medium' && "bg-amber-100 text-amber-700",
                            concern.severity === 'low' && "bg-blue-100 text-blue-700"
                          )}>
                            {concern.severity}
                          </Badge>
                          <span className="text-xs text-slate-500">×{concern.frequency}</span>
                        </div>
                      </div>
                      <p className="text-sm text-slate-600">{concern.mitigation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Document Engagement */}
          {analytics.document_insights?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Document Engagement</CardTitle>
                <CardDescription>How investors interact with shared documents</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analytics.document_insights.map((doc, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <div>
                          <p className="text-sm font-medium text-slate-900">{doc.document_type}</p>
                          <p className="text-xs text-slate-500">{doc.investor_feedback}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-600">
                        <div className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {doc.views} views
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {doc.avg_time_spent}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommended Actions */}
          <Card className="bg-gradient-to-br from-indigo-50 to-violet-50 border-indigo-200">
            <CardHeader>
              <CardTitle className="text-base text-indigo-900">Recommended Actions</CardTitle>
              <CardDescription>Prioritized steps to improve deal outcomes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analytics.recommended_actions?.map((action, i) => (
                  <div key={i} className="bg-white rounded-lg p-3 border border-indigo-200">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-indigo-900">{i + 1}.</span>
                        <p className="font-medium text-slate-900">{action.action}</p>
                      </div>
                      <Badge className={cn(
                        "text-xs",
                        action.priority === 'urgent' && "bg-red-100 text-red-700",
                        action.priority === 'high' && "bg-amber-100 text-amber-700",
                        action.priority === 'medium' && "bg-blue-100 text-blue-700"
                      )}>
                        {action.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600 ml-6">{action.expected_impact}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Investor Segmentation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Investor Segmentation</CardTitle>
              <CardDescription>Categorized by engagement level</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {analytics.investor_segments?.map((segment, i) => (
                  <div key={i} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-slate-900">{segment.segment}</h4>
                      <Badge variant="outline">{segment.count}</Badge>
                    </div>
                    <p className="text-xs text-slate-600 mb-2">{segment.engagement_level}</p>
                    <p className="text-xs text-indigo-700 font-medium">{segment.next_steps}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Refresh Analytics */}
          <div className="flex justify-center">
            <Button 
              onClick={generateAnalytics}
              disabled={analyzing}
              variant="outline"
            >
              {analyzing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Refresh Analytics
            </Button>
          </div>
        </>
      )}
    </div>
  );
}