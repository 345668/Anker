import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Brain, Loader2, TrendingUp, TrendingDown, Minus,
  MessageSquare, Calendar, AlertCircle
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

export default function SentimentAnalyzer({ interactions, investorId, onAnalysisComplete }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const analyzeSentiment = async () => {
    if (!interactions || interactions.length === 0) return;
    setIsAnalyzing(true);

    try {
      const communicationHistory = interactions
        .filter(i => i.contact_id === investorId || i.firm_id === investorId)
        .map(i => ({
          type: i.type,
          content: i.content || i.subject,
          date: i.created_date
        }));

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze the sentiment and interest level from these investor communications:

${JSON.stringify(communicationHistory, null, 2)}

Evaluate:
1. Overall sentiment (positive, neutral, negative)
2. Interest level (1-10)
3. Engagement quality
4. Key signals (positive and negative)
5. Recommended next action
6. Optimal timing for follow-up
7. Risk factors`,
        response_json_schema: {
          type: 'object',
          properties: {
            overall_sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
            interest_score: { type: 'number' },
            engagement_quality: { type: 'string' },
            positive_signals: { type: 'array', items: { type: 'string' } },
            negative_signals: { type: 'array', items: { type: 'string' } },
            recommended_action: { type: 'string' },
            follow_up_timing: { type: 'string' },
            risk_factors: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      setAnalysis(result);
      if (onAnalysisComplete) {
        onAnalysisComplete(result);
      }
    } catch (error) {
      console.error('Sentiment analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getSentimentIcon = (sentiment) => {
    switch (sentiment) {
      case 'positive': return <TrendingUp className="w-4 h-4 text-emerald-600" />;
      case 'negative': return <TrendingDown className="w-4 h-4 text-red-600" />;
      default: return <Minus className="w-4 h-4 text-slate-500" />;
    }
  };

  const getSentimentColor = (sentiment) => {
    switch (sentiment) {
      case 'positive': return 'bg-emerald-100 text-emerald-700';
      case 'negative': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  if (!analysis) {
    return (
      <Button 
        onClick={analyzeSentiment}
        disabled={isAnalyzing || !interactions?.length}
        variant="outline"
        size="sm"
      >
        {isAnalyzing ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Brain className="w-4 h-4 mr-2" />
        )}
        Analyze Sentiment
      </Button>
    );
  }

  return (
    <Card className="border-indigo-100">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-600" />
            Sentiment Analysis
          </CardTitle>
          <Badge className={getSentimentColor(analysis.overall_sentiment)}>
            {getSentimentIcon(analysis.overall_sentiment)}
            <span className="ml-1 capitalize">{analysis.overall_sentiment}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Interest Score */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">Interest Level</span>
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full",
                  analysis.interest_score >= 7 ? "bg-emerald-500" :
                  analysis.interest_score >= 4 ? "bg-amber-500" : "bg-red-500"
                )}
                style={{ width: `${analysis.interest_score * 10}%` }}
              />
            </div>
            <span className="text-sm font-medium">{analysis.interest_score}/10</span>
          </div>
        </div>

        {/* Positive Signals */}
        {analysis.positive_signals?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-emerald-700 mb-1">Positive Signals</p>
            <div className="flex flex-wrap gap-1">
              {analysis.positive_signals.slice(0, 3).map((signal, i) => (
                <Badge key={i} variant="outline" className="text-xs border-emerald-200 text-emerald-700">
                  {signal}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Risk Factors */}
        {analysis.risk_factors?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-amber-700 mb-1">Risk Factors</p>
            <div className="flex flex-wrap gap-1">
              {analysis.risk_factors.slice(0, 2).map((risk, i) => (
                <Badge key={i} variant="outline" className="text-xs border-amber-200 text-amber-700">
                  {risk}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Recommended Action */}
        <div className="p-3 bg-indigo-50 rounded-lg">
          <p className="text-xs font-medium text-indigo-700 mb-1">Recommended Next Step</p>
          <p className="text-sm text-indigo-900">{analysis.recommended_action}</p>
          <div className="flex items-center gap-1 mt-2 text-xs text-indigo-600">
            <Calendar className="w-3.5 h-3.5" />
            <span>{analysis.follow_up_timing}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}