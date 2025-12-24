import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Target, Loader2, TrendingUp, Star, Mail, Calendar,
  ChevronRight, Sparkles, ArrowUp, ArrowDown, Minus
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
import { cn } from "@/lib/utils";

export default function OutreachPrioritization({ 
  matches, 
  outreaches, 
  firms, 
  contacts, 
  onSelectInvestor 
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [prioritizedList, setPrioritizedList] = useState(null);

  const generatePrioritization = async () => {
    setIsGenerating(true);

    try {
      // Calculate engagement metrics per investor
      const investorMetrics = {};
      
      outreaches.forEach(o => {
        const firmId = o.firm_id;
        if (!investorMetrics[firmId]) {
          investorMetrics[firmId] = {
            sent: 0, opened: 0, clicked: 0, replied: 0, meetings: 0
          };
        }
        investorMetrics[firmId].sent++;
        if (o.opened_at) investorMetrics[firmId].opened++;
        if (o.clicked_at) investorMetrics[firmId].clicked++;
        if (o.replied_at) investorMetrics[firmId].replied++;
        if (o.stage === 'call_scheduled') investorMetrics[firmId].meetings++;
      });

      // Get match data
      const matchData = matches.map(m => {
        const firm = firms[m.firm_id];
        const contact = contacts[m.contact_id];
        const metrics = investorMetrics[m.firm_id] || {};
        
        return {
          match_id: m.id,
          firm_id: m.firm_id,
          firm_name: firm?.company_name,
          firm_type: firm?.firm_type,
          contact_name: contact?.full_name,
          match_score: m.match_score,
          predicted_interest: m.predicted_interest,
          sentiment: m.sentiment_analysis,
          engagement: metrics,
          user_feedback: m.user_feedback
        };
      });

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze these investor matches and engagement data to prioritize outreach. Rank from highest to lowest priority.

INVESTOR DATA:
${JSON.stringify(matchData, null, 2)}

For each investor, calculate a priority score (0-100) based on:
1. Match score (weight: 25%)
2. Predicted interest level (weight: 20%)
3. Engagement metrics - open/reply rates (weight: 25%)
4. Sentiment from past interactions (weight: 15%)
5. User feedback (positive = boost, negative = lower) (weight: 15%)

Return the top 10 investors ranked by priority with reasoning.`,
        response_json_schema: {
          type: 'object',
          properties: {
            prioritized_investors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  firm_id: { type: 'string' },
                  priority_score: { type: 'number' },
                  rank: { type: 'number' },
                  reason: { type: 'string' },
                  recommended_action: { type: 'string' },
                  timing: { type: 'string' },
                  risk_level: { type: 'string' }
                }
              }
            },
            insights: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      // Merge with firm/contact data
      const enrichedList = result.prioritized_investors?.map(inv => ({
        ...inv,
        firm: firms[inv.firm_id],
        contact: contacts[matches.find(m => m.firm_id === inv.firm_id)?.contact_id],
        match: matches.find(m => m.firm_id === inv.firm_id)
      }));

      setPrioritizedList({
        investors: enrichedList || [],
        insights: result.insights || []
      });
    } catch (error) {
      console.error('Prioritization error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const getRiskColor = (risk) => {
    switch (risk?.toLowerCase()) {
      case 'low': return 'bg-emerald-100 text-emerald-700';
      case 'medium': return 'bg-amber-100 text-amber-700';
      case 'high': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  if (!prioritizedList) {
    return (
      <Card className="border-indigo-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            AI Outreach Prioritization
          </CardTitle>
          <CardDescription>
            Get AI-recommended investor rankings based on engagement and fit
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={generatePrioritization}
            disabled={isGenerating || matches.length === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Investors...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Priority List
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            Priority Outreach List
          </CardTitle>
          <Button variant="outline" size="sm" onClick={generatePrioritization}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Insights */}
        {prioritizedList.insights?.length > 0 && (
          <div className="p-3 bg-indigo-50 rounded-lg mb-4">
            <p className="text-xs font-medium text-indigo-700 mb-2">Key Insights</p>
            <ul className="space-y-1">
              {prioritizedList.insights.slice(0, 3).map((insight, i) => (
                <li key={i} className="text-xs text-indigo-900">• {insight}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Prioritized List */}
        <div className="space-y-3">
          {prioritizedList.investors?.map((inv, index) => (
            <div 
              key={inv.firm_id}
              className="flex items-center gap-4 p-4 bg-white border rounded-xl hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onSelectInvestor?.(inv)}
            >
              {/* Rank */}
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                index === 0 ? "bg-amber-100 text-amber-700" :
                index === 1 ? "bg-slate-200 text-slate-700" :
                index === 2 ? "bg-orange-100 text-orange-700" :
                "bg-slate-100 text-slate-600"
              )}>
                {index + 1}
              </div>

              {/* Investor Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-slate-900 truncate">
                    {inv.firm?.company_name || 'Unknown'}
                  </p>
                  <Badge variant="secondary" className="text-xs">
                    {inv.firm?.firm_type}
                  </Badge>
                </div>
                <p className="text-sm text-slate-500 truncate">
                  {inv.contact?.full_name} • {inv.contact?.title}
                </p>
                <p className="text-xs text-slate-400 mt-1">{inv.reason}</p>
              </div>

              {/* Scores */}
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <p className="text-lg font-bold text-indigo-600">{inv.priority_score}</p>
                  <p className="text-xs text-slate-500">Priority</p>
                </div>
                <Badge className={getRiskColor(inv.risk_level)}>
                  {inv.risk_level} risk
                </Badge>
              </div>

              {/* Action */}
              <div className="text-right">
                <p className="text-xs font-medium text-slate-700">{inv.recommended_action}</p>
                <p className="text-xs text-slate-400">{inv.timing}</p>
              </div>

              <ChevronRight className="w-5 h-5 text-slate-400" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}