import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  TrendingUp, Loader2, CheckCircle, AlertTriangle, Globe,
  BarChart3, Users, DollarSign, Target
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

export default function MarketValidation({ startup, onAnalysisComplete }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(startup?.market_validation || null);

  const analyzeMarket = async () => {
    setIsAnalyzing(true);

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze the market opportunity for this startup. Use real market data.

Startup: ${startup.company_name}
Industry: ${startup.industry?.join(', ')}
Problem: ${startup.problem}
Solution: ${startup.solution}
Target Market: ${startup.geographic_markets?.join(', ')}

Provide comprehensive market validation including:
1. Total Addressable Market (TAM)
2. Serviceable Addressable Market (SAM)
3. Serviceable Obtainable Market (SOM)
4. Market growth rate
5. Key market trends
6. Market timing assessment
7. Competitive intensity
8. Barriers to entry
9. Customer validation signals
10. Risk factors`,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            tam: { type: 'string' },
            tam_value: { type: 'number' },
            sam: { type: 'string' },
            sam_value: { type: 'number' },
            som: { type: 'string' },
            som_value: { type: 'number' },
            growth_rate: { type: 'string' },
            market_trends: { type: 'array', items: { type: 'string' } },
            timing_score: { type: 'number' },
            timing_assessment: { type: 'string' },
            competitive_intensity: { type: 'string' },
            top_competitors: { type: 'array', items: { type: 'string' } },
            barriers_to_entry: { type: 'array', items: { type: 'string' } },
            validation_signals: { type: 'array', items: { type: 'string' } },
            risk_factors: { type: 'array', items: { type: 'string' } },
            overall_opportunity_score: { type: 'number' }
          }
        }
      });

      setAnalysis(result);
      if (onAnalysisComplete) {
        onAnalysisComplete(result);
      }
    } catch (error) {
      console.error('Market analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatMarketSize = (value) => {
    if (!value) return 'N/A';
    if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    return `$${value.toLocaleString()}`;
  };

  if (!analysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            Market Validation
          </CardTitle>
          <CardDescription>
            AI-powered market size and opportunity analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={analyzeMarket}
            disabled={isAnalyzing}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Market...
              </>
            ) : (
              <>
                <Globe className="w-4 h-4 mr-2" />
                Analyze Market
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
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            Market Validation
          </CardTitle>
          <Badge className={cn(
            "text-sm",
            analysis.overall_opportunity_score >= 70 ? "bg-emerald-100 text-emerald-700" :
            analysis.overall_opportunity_score >= 50 ? "bg-amber-100 text-amber-700" :
            "bg-red-100 text-red-700"
          )}>
            Opportunity Score: {analysis.overall_opportunity_score}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Market Size */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-slate-50 rounded-lg">
            <p className="text-2xl font-bold text-slate-900">{formatMarketSize(analysis.tam_value)}</p>
            <p className="text-xs text-slate-500 mt-1">TAM</p>
            <p className="text-xs text-slate-400">{analysis.tam}</p>
          </div>
          <div className="text-center p-4 bg-slate-50 rounded-lg">
            <p className="text-2xl font-bold text-indigo-600">{formatMarketSize(analysis.sam_value)}</p>
            <p className="text-xs text-slate-500 mt-1">SAM</p>
            <p className="text-xs text-slate-400">{analysis.sam}</p>
          </div>
          <div className="text-center p-4 bg-slate-50 rounded-lg">
            <p className="text-2xl font-bold text-emerald-600">{formatMarketSize(analysis.som_value)}</p>
            <p className="text-xs text-slate-500 mt-1">SOM</p>
            <p className="text-xs text-slate-400">{analysis.som}</p>
          </div>
        </div>

        {/* Growth & Timing */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-emerald-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">Growth Rate</span>
            </div>
            <p className="text-lg font-bold text-emerald-900">{analysis.growth_rate}</p>
          </div>
          <div className="p-4 bg-indigo-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-medium text-indigo-700">Market Timing</span>
            </div>
            <p className="text-lg font-bold text-indigo-900">{analysis.timing_score}%</p>
            <p className="text-xs text-indigo-600 mt-1">{analysis.timing_assessment}</p>
          </div>
        </div>

        {/* Market Trends */}
        {analysis.market_trends?.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-900 mb-2">Key Market Trends</h4>
            <div className="flex flex-wrap gap-2">
              {analysis.market_trends.map((trend, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {trend}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Top Competitors */}
        {analysis.top_competitors?.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-900 mb-2">Top Competitors</h4>
            <div className="flex flex-wrap gap-2">
              {analysis.top_competitors.map((comp, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {comp}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Competitive Intensity: {analysis.competitive_intensity}
            </p>
          </div>
        )}

        {/* Validation Signals */}
        {analysis.validation_signals?.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-emerald-700 mb-2 flex items-center gap-1">
              <CheckCircle className="w-4 h-4" />
              Validation Signals
            </h4>
            <ul className="space-y-1">
              {analysis.validation_signals.map((s, i) => (
                <li key={i} className="text-sm text-slate-600">• {s}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Risk Factors */}
        {analysis.risk_factors?.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              Risk Factors
            </h4>
            <ul className="space-y-1">
              {analysis.risk_factors.map((r, i) => (
                <li key={i} className="text-sm text-slate-600">• {r}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}