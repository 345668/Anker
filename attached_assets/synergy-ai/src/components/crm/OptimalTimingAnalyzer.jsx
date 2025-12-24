import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Clock, Loader2, TrendingUp, Calendar, Sun, Moon } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function OptimalTimingAnalyzer({ outreaches, contact, firm }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [timingInsights, setTimingInsights] = useState(null);

  const analyzeOptimalTiming = async () => {
    setIsAnalyzing(true);

    try {
      // Prepare historical engagement data
      const engagementData = outreaches
        .filter(o => o.opened_at || o.replied_at)
        .map(o => ({
          sent_at: o.sent_at,
          opened_at: o.opened_at,
          replied_at: o.replied_at,
          day_of_week: new Date(o.sent_at).toLocaleDateString('en-US', { weekday: 'long' }),
          hour: new Date(o.sent_at).getHours(),
          time_to_open: o.opened_at ? 
            Math.round((new Date(o.opened_at) - new Date(o.sent_at)) / (1000 * 60 * 60)) : null,
          time_to_reply: o.replied_at ?
            Math.round((new Date(o.replied_at) - new Date(o.sent_at)) / (1000 * 60 * 60)) : null,
        }));

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze email engagement patterns to determine optimal send times for investor outreach.

HISTORICAL ENGAGEMENT DATA:
${JSON.stringify(engagementData, null, 2)}

RECIPIENT INFO:
- Name: ${contact?.full_name}
- Firm: ${firm?.company_name}
- Firm Type: ${firm?.firm_type}
- Location: ${firm?.city}, ${firm?.state_region}

Analyze patterns to determine:
1. Best day of week to send emails
2. Best time of day (morning/afternoon/evening)
3. Average time to open and reply
4. Timezone considerations
5. Industry-specific patterns for ${firm?.firm_type}

Provide specific recommendations for when to send the next email to maximize open and reply rates.`,
        response_json_schema: {
          type: 'object',
          properties: {
            optimal_day: { type: 'string' },
            optimal_time: { type: 'string' },
            timezone: { type: 'string' },
            reasoning: { type: 'string' },
            confidence_score: { type: 'number' },
            next_send_recommendation: { type: 'string' },
            patterns: {
              type: 'object',
              properties: {
                best_days: { type: 'array', items: { type: 'string' } },
                worst_days: { type: 'array', items: { type: 'string' } },
                peak_engagement_hours: { type: 'array', items: { type: 'number' } },
                avg_time_to_open_hours: { type: 'number' },
                avg_time_to_reply_hours: { type: 'number' }
              }
            }
          }
        }
      });

      setTimingInsights(result);
    } catch (error) {
      console.error('Timing analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!timingInsights) {
    return (
      <Card className="border-amber-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="w-4 h-4 text-amber-600" />
            Optimal Send Time
          </CardTitle>
          <CardDescription>
            AI-powered timing recommendations based on engagement patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={analyzeOptimalTiming}
            disabled={isAnalyzing || outreaches.length < 3}
            className="w-full bg-amber-600 hover:bg-amber-700"
            size="sm"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Patterns...
              </>
            ) : (
              <>
                <Clock className="w-4 h-4 mr-2" />
                Analyze Timing
              </>
            )}
          </Button>
          {outreaches.length < 3 && (
            <p className="text-xs text-slate-500 mt-2 text-center">
              Need at least 3 emails to analyze patterns
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const getTimeIcon = (time) => {
    const hour = parseInt(time.split(':')[0]);
    return hour < 12 ? Sun : Moon;
  };

  const TimeIcon = getTimeIcon(timingInsights.optimal_time);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            Timing Insights
          </CardTitle>
          <Badge className={cn(
            "text-xs",
            timingInsights.confidence_score >= 80 ? "bg-emerald-100 text-emerald-700" :
            timingInsights.confidence_score >= 60 ? "bg-amber-100 text-amber-700" :
            "bg-slate-100 text-slate-700"
          )}>
            {timingInsights.confidence_score}% confidence
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Recommendation */}
        <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200">
          <p className="text-xs font-medium text-amber-900 mb-1">Next Email Recommendation</p>
          <p className="text-sm text-amber-800 font-medium">{timingInsights.next_send_recommendation}</p>
        </div>

        {/* Optimal Time */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-slate-500" />
              <p className="text-xs text-slate-500">Best Day</p>
            </div>
            <p className="text-lg font-bold text-slate-900">{timingInsights.optimal_day}</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <TimeIcon className="w-4 h-4 text-slate-500" />
              <p className="text-xs text-slate-500">Best Time</p>
            </div>
            <p className="text-lg font-bold text-slate-900">{timingInsights.optimal_time}</p>
          </div>
        </div>

        {/* Reasoning */}
        <div>
          <p className="text-xs font-medium text-slate-700 mb-1">Why?</p>
          <p className="text-sm text-slate-600">{timingInsights.reasoning}</p>
        </div>

        {/* Patterns */}
        {timingInsights.patterns && (
          <div className="space-y-2 pt-2 border-t">
            <div>
              <p className="text-xs font-medium text-slate-700 mb-1">Best Days</p>
              <div className="flex flex-wrap gap-1">
                {timingInsights.patterns.best_days?.map((day, i) => (
                  <Badge key={i} className="bg-emerald-100 text-emerald-700 text-xs">
                    {day}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-700 mb-1">Avoid</p>
              <div className="flex flex-wrap gap-1">
                {timingInsights.patterns.worst_days?.map((day, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {day}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-500">Avg. time to open:</span>
                <span className="font-medium ml-1">{timingInsights.patterns.avg_time_to_open_hours}h</span>
              </div>
              <div>
                <span className="text-slate-500">Avg. time to reply:</span>
                <span className="font-medium ml-1">{timingInsights.patterns.avg_time_to_reply_hours}h</span>
              </div>
            </div>
          </div>
        )}

        <Button 
          variant="outline" 
          size="sm" 
          className="w-full"
          onClick={analyzeOptimalTiming}
        >
          Refresh Analysis
        </Button>
      </CardContent>
    </Card>
  );
}