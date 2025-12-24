import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  BarChart3, Loader2, TrendingUp, TrendingDown, Eye,
  MousePointer, MessageSquare, Calendar, Clock, Target
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import { cn } from "@/lib/utils";

export default function EngagementAnalytics({ outreaches, onInsightsGenerated }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiInsights, setAiInsights] = useState(null);

  // Calculate metrics
  const metrics = useMemo(() => {
    if (!outreaches?.length) return null;

    const sent = outreaches.filter(o => o.sent_at);
    const opened = outreaches.filter(o => o.opened_at);
    const clicked = outreaches.filter(o => o.clicked_at);
    const replied = outreaches.filter(o => o.replied_at);
    const meetings = outreaches.filter(o => o.stage === 'call_scheduled');

    const openRate = sent.length ? Math.round((opened.length / sent.length) * 100) : 0;
    const clickRate = opened.length ? Math.round((clicked.length / opened.length) * 100) : 0;
    const replyRate = sent.length ? Math.round((replied.length / sent.length) * 100) : 0;
    const meetingRate = replied.length ? Math.round((meetings.length / replied.length) * 100) : 0;

    // Day of week analysis
    const dayStats = {};
    sent.forEach(o => {
      const day = new Date(o.sent_at).toLocaleDateString('en-US', { weekday: 'short' });
      if (!dayStats[day]) dayStats[day] = { sent: 0, opened: 0, replied: 0 };
      dayStats[day].sent++;
      if (o.opened_at) dayStats[day].opened++;
      if (o.replied_at) dayStats[day].replied++;
    });

    const dayData = Object.entries(dayStats).map(([day, stats]) => ({
      day,
      openRate: stats.sent ? Math.round((stats.opened / stats.sent) * 100) : 0,
      replyRate: stats.sent ? Math.round((stats.replied / stats.sent) * 100) : 0
    }));

    // Stage distribution
    const stageData = outreaches.reduce((acc, o) => {
      acc[o.stage] = (acc[o.stage] || 0) + 1;
      return acc;
    }, {});

    return {
      total: outreaches.length,
      sent: sent.length,
      opened: opened.length,
      clicked: clicked.length,
      replied: replied.length,
      meetings: meetings.length,
      openRate,
      clickRate,
      replyRate,
      meetingRate,
      dayData,
      stageData: Object.entries(stageData).map(([stage, count]) => ({ stage, count }))
    };
  }, [outreaches]);

  const generateAIInsights = async () => {
    if (!metrics) return;
    setIsAnalyzing(true);

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze these email engagement metrics and provide actionable insights:

METRICS:
- Total sent: ${metrics.sent}
- Open rate: ${metrics.openRate}%
- Click rate: ${metrics.clickRate}%
- Reply rate: ${metrics.replyRate}%
- Meeting conversion: ${metrics.meetingRate}%

PERFORMANCE BY DAY:
${JSON.stringify(metrics.dayData)}

STAGE DISTRIBUTION:
${JSON.stringify(metrics.stageData)}

Provide:
1. Overall performance assessment
2. Key insights from the data
3. Specific recommendations to improve each metric
4. Best performing patterns
5. Areas needing improvement
6. Actionable next steps`,
        response_json_schema: {
          type: 'object',
          properties: {
            overall_assessment: { type: 'string' },
            performance_grade: { type: 'string' },
            key_insights: { type: 'array', items: { type: 'string' } },
            recommendations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  metric: { type: 'string' },
                  current: { type: 'string' },
                  target: { type: 'string' },
                  action: { type: 'string' }
                }
              }
            },
            best_patterns: { type: 'array', items: { type: 'string' } },
            improvement_areas: { type: 'array', items: { type: 'string' } },
            next_steps: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      setAiInsights(result);
      if (onInsightsGenerated) {
        onInsightsGenerated(result);
      }
    } catch (error) {
      console.error('Error generating insights:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  if (!metrics) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center py-8">
          <BarChart3 className="w-12 h-12 text-slate-300 mb-4" />
          <p className="text-slate-500">No outreach data to analyze</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Eye className="w-5 h-5 text-indigo-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-slate-900">{metrics.openRate}%</p>
            <p className="text-xs text-slate-500">Open Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MousePointer className="w-5 h-5 text-emerald-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-slate-900">{metrics.clickRate}%</p>
            <p className="text-xs text-slate-500">Click Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MessageSquare className="w-5 h-5 text-amber-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-slate-900">{metrics.replyRate}%</p>
            <p className="text-xs text-slate-500">Reply Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar className="w-5 h-5 text-violet-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-slate-900">{metrics.meetingRate}%</p>
            <p className="text-xs text-slate-500">Meeting Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Target className="w-5 h-5 text-rose-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-slate-900">{metrics.sent}</p>
            <p className="text-xs text-slate-500">Total Sent</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Performance by Day */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Performance by Day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.dayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="openRate" name="Open %" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="replyRate" name="Reply %" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Stage Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pipeline Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.stageData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="stage"
                  >
                    {metrics.stageData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {metrics.stageData.slice(0, 5).map((item, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  <span 
                    className="w-2 h-2 rounded-full mr-1" 
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  {item.stage}: {item.count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Insights */}
      {!aiInsights ? (
        <Card>
          <CardContent className="p-6">
            <Button 
              onClick={generateAIInsights}
              disabled={isAnalyzing}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing Patterns...
                </>
              ) : (
                <>
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Generate AI Insights
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600" />
                AI Performance Insights
              </CardTitle>
              <Badge className={cn(
                aiInsights.performance_grade === 'A' ? "bg-emerald-100 text-emerald-700" :
                aiInsights.performance_grade === 'B' ? "bg-blue-100 text-blue-700" :
                aiInsights.performance_grade === 'C' ? "bg-amber-100 text-amber-700" :
                "bg-red-100 text-red-700"
              )}>
                Grade: {aiInsights.performance_grade}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-slate-600">{aiInsights.overall_assessment}</p>

            {/* Recommendations */}
            {aiInsights.recommendations?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-900 mb-3">Recommendations</h4>
                <div className="space-y-3">
                  {aiInsights.recommendations.map((rec, i) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">{rec.metric}</Badge>
                        <span className="text-xs text-slate-500">
                          {rec.current} → <span className="text-emerald-600 font-medium">{rec.target}</span>
                        </span>
                      </div>
                      <p className="text-sm text-slate-700">{rec.action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Steps */}
            {aiInsights.next_steps?.length > 0 && (
              <div className="p-4 bg-indigo-50 rounded-lg">
                <h4 className="text-sm font-medium text-indigo-700 mb-2">Priority Actions</h4>
                <ul className="space-y-1">
                  {aiInsights.next_steps.map((step, i) => (
                    <li key={i} className="text-sm text-indigo-900">• {step}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}