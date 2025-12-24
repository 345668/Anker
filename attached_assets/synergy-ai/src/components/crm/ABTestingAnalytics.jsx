import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { BarChart3, Loader2, TrendingUp, Mail, Award } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export default function ABTestingAnalytics({ outreaches }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [insights, setInsights] = useState(null);

  const analyzeABTests = async () => {
    setIsAnalyzing(true);

    try {
      // Group emails by subject line patterns and content
      const emailData = outreaches.map(o => ({
        subject: o.email_subject,
        has_personalization: /\{\{|\[NAME\]|\[COMPANY\]/i.test(o.email_subject),
        subject_length: o.email_subject?.length || 0,
        has_question: /\?/.test(o.email_subject),
        has_numbers: /\d/.test(o.email_subject),
        has_urgency: /(urgent|deadline|limited|today|now)/i.test(o.email_subject),
        opened: !!o.opened_at,
        clicked: !!o.clicked_at,
        replied: !!o.replied_at,
        open_count: o.open_count || 0,
        body_length: o.email_body?.length || 0,
        has_cta: /(call|meeting|schedule|book|connect|chat)/i.test(o.email_body),
        has_social_proof: /(worked with|portfolio|invested in)/i.test(o.email_body)
      }));

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze email subject lines and content to determine what drives engagement.

EMAIL DATA (${emailData.length} emails):
${JSON.stringify(emailData, null, 2)}

Perform A/B testing analysis to identify:
1. Subject line patterns that get higher open rates
2. Content elements that drive clicks and replies
3. Optimal subject line length
4. Impact of personalization, questions, numbers, urgency
5. Best CTAs and social proof usage

Provide specific recommendations for improving email performance with data-backed insights.`,
        response_json_schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            top_performers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  subject: { type: 'string' },
                  open_rate: { type: 'number' },
                  reply_rate: { type: 'number' },
                  why_it_works: { type: 'string' }
                }
              }
            },
            insights: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  finding: { type: 'string' },
                  impact: { type: 'string' },
                  recommendation: { type: 'string' }
                }
              }
            },
            subject_line_tips: { type: 'array', items: { type: 'string' } },
            content_tips: { type: 'array', items: { type: 'string' } },
            optimal_length: {
              type: 'object',
              properties: {
                subject: { type: 'string' },
                body: { type: 'string' }
              }
            }
          }
        }
      });

      setInsights(result);
    } catch (error) {
      console.error('A/B testing analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!insights) {
    return (
      <Card className="border-purple-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="w-4 h-4 text-purple-600" />
            A/B Testing Insights
          </CardTitle>
          <CardDescription>
            Analyze what email patterns drive the best engagement
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={analyzeABTests}
            disabled={isAnalyzing || outreaches.length < 5}
            className="w-full bg-purple-600 hover:bg-purple-700"
            size="sm"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <BarChart3 className="w-4 h-4 mr-2" />
                Run Analysis
              </>
            )}
          </Button>
          {outreaches.length < 5 && (
            <p className="text-xs text-slate-500 mt-2 text-center">
              Need at least 5 emails for meaningful analysis
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="w-4 h-4 text-purple-600" />
            Email Performance Analysis
          </CardTitle>
          <Button variant="outline" size="sm" onClick={analyzeABTests}>
            Refresh
          </Button>
        </div>
        <CardDescription>{insights.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top Performers */}
        {insights.top_performers?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-700 mb-2">🏆 Best Performing Subjects</p>
            <div className="space-y-2">
              {insights.top_performers.slice(0, 3).map((perf, i) => (
                <div key={i} className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                  <p className="text-sm font-medium text-slate-900 mb-1">{perf.subject}</p>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-500">Opens:</span>
                      <Badge className="bg-purple-100 text-purple-700 text-xs">
                        {perf.open_rate}%
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-500">Replies:</span>
                      <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                        {perf.reply_rate}%
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600">{perf.why_it_works}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key Insights */}
        {insights.insights?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-700 mb-2">📊 Key Findings</p>
            <div className="space-y-2">
              {insights.insights.map((insight, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex items-start gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{insight.finding}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Impact: {insight.impact}</p>
                    </div>
                  </div>
                  <p className="text-xs text-indigo-700 mt-2">💡 {insight.recommendation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Optimal Lengths */}
        {insights.optimal_length && (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">Optimal Subject Length</p>
              <p className="text-sm font-bold text-slate-900">{insights.optimal_length.subject}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 mb-1">Optimal Body Length</p>
              <p className="text-sm font-bold text-slate-900">{insights.optimal_length.body}</p>
            </div>
          </div>
        )}

        {/* Tips */}
        <div className="space-y-3">
          {insights.subject_line_tips?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-700 mb-2">✉️ Subject Line Tips</p>
              <ul className="space-y-1">
                {insights.subject_line_tips.slice(0, 3).map((tip, i) => (
                  <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                    <span className="text-purple-600">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {insights.content_tips?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-700 mb-2">📝 Content Tips</p>
              <ul className="space-y-1">
                {insights.content_tips.slice(0, 3).map((tip, i) => (
                  <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                    <span className="text-purple-600">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}