import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  DollarSign, Loader2, TrendingUp, TrendingDown, AlertTriangle,
  Calendar, Target, BarChart3, Activity
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function FinancialProjectionsAnalysis({ startup }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [financialData, setFinancialData] = useState({
    current_cash: '',
    monthly_burn: '',
    mrr: '',
    arr: '',
    revenue_growth_rate: '',
    cac: '',
    ltv: '',
    gross_margin: '',
    projected_revenue_12m: '',
    projected_revenue_24m: '',
    projected_revenue_36m: '',
  });

  const analyzeFinancials = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('mistralPitchAnalysis', {
        analysisType: 'financial_projections',
        financialData: {
          ...financialData,
          startup_stage: startup?.stage,
          industry: startup?.industry,
          current_cash: parseFloat(financialData.current_cash) || 0,
          monthly_burn: parseFloat(financialData.monthly_burn) || 0,
          mrr: parseFloat(financialData.mrr) || 0,
          arr: parseFloat(financialData.arr) || 0,
          revenue_growth_rate: parseFloat(financialData.revenue_growth_rate) || 0,
          cac: parseFloat(financialData.cac) || 0,
          ltv: parseFloat(financialData.ltv) || 0,
          gross_margin: parseFloat(financialData.gross_margin) || 0,
          projected_revenue_12m: parseFloat(financialData.projected_revenue_12m) || 0,
          projected_revenue_24m: parseFloat(financialData.projected_revenue_24m) || 0,
          projected_revenue_36m: parseFloat(financialData.projected_revenue_36m) || 0,
        }
      });

      if (response.data.success) {
        setAnalysis(response.data.analysis);
      }
    } catch (error) {
      console.error('Error analyzing financials:', error);
    } finally {
      setLoading(false);
    }
  };

  const getHealthColor = (status) => {
    if (status?.includes('healthy') || status?.includes('strong')) return 'text-emerald-600';
    if (status?.includes('concern') || status?.includes('weak')) return 'text-red-600';
    return 'text-amber-600';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            Financial Projections & Metrics
          </CardTitle>
          <CardDescription>
            Deep analysis of cash runway, burn rate, and unit economics powered by Mistral AI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <Label className="text-xs">Current Cash ($)</Label>
              <Input
                type="number"
                placeholder="500000"
                value={financialData.current_cash}
                onChange={(e) => setFinancialData({...financialData, current_cash: e.target.value})}
              />
            </div>
            <div>
              <Label className="text-xs">Monthly Burn Rate ($)</Label>
              <Input
                type="number"
                placeholder="50000"
                value={financialData.monthly_burn}
                onChange={(e) => setFinancialData({...financialData, monthly_burn: e.target.value})}
              />
            </div>
            <div>
              <Label className="text-xs">MRR ($)</Label>
              <Input
                type="number"
                placeholder="30000"
                value={financialData.mrr}
                onChange={(e) => setFinancialData({...financialData, mrr: e.target.value})}
              />
            </div>
            <div>
              <Label className="text-xs">ARR ($)</Label>
              <Input
                type="number"
                placeholder="360000"
                value={financialData.arr}
                onChange={(e) => setFinancialData({...financialData, arr: e.target.value})}
              />
            </div>
            <div>
              <Label className="text-xs">CAC ($)</Label>
              <Input
                type="number"
                placeholder="5000"
                value={financialData.cac}
                onChange={(e) => setFinancialData({...financialData, cac: e.target.value})}
              />
            </div>
            <div>
              <Label className="text-xs">LTV ($)</Label>
              <Input
                type="number"
                placeholder="20000"
                value={financialData.ltv}
                onChange={(e) => setFinancialData({...financialData, ltv: e.target.value})}
              />
            </div>
            <div>
              <Label className="text-xs">Gross Margin (%)</Label>
              <Input
                type="number"
                placeholder="70"
                value={financialData.gross_margin}
                onChange={(e) => setFinancialData({...financialData, gross_margin: e.target.value})}
              />
            </div>
            <div>
              <Label className="text-xs">Monthly Growth Rate (%)</Label>
              <Input
                type="number"
                placeholder="15"
                value={financialData.revenue_growth_rate}
                onChange={(e) => setFinancialData({...financialData, revenue_growth_rate: e.target.value})}
              />
            </div>
          </div>

          <Button 
            onClick={analyzeFinancials}
            disabled={loading || !financialData.monthly_burn}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing with AI...
              </>
            ) : (
              <>
                <BarChart3 className="w-4 h-4 mr-2" />
                Analyze Financials
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {analysis && (
        <>
          {/* Cash Runway Analysis */}
          {analysis.cash_runway_analysis && (
            <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-blue-900">
                  <Calendar className="w-5 h-5" />
                  Cash Runway Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-xs text-slate-600 mb-1">Monthly Burn</p>
                    <p className="text-2xl font-bold text-slate-900">
                      ${(analysis.cash_runway_analysis.current_burn_rate / 1000).toFixed(0)}K
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-xs text-slate-600 mb-1">Runway</p>
                    <p className={cn("text-2xl font-bold", 
                      analysis.cash_runway_analysis.estimated_runway >= 18 ? 'text-emerald-600' :
                      analysis.cash_runway_analysis.estimated_runway >= 12 ? 'text-amber-600' :
                      'text-red-600'
                    )}>
                      {analysis.cash_runway_analysis.estimated_runway} mo
                    </p>
                  </div>
                </div>

                {analysis.cash_runway_analysis.recommended_raise_amount && (
                  <div className="bg-white rounded-lg p-3 border border-blue-200">
                    <p className="text-sm font-medium text-slate-900 mb-1">Recommended Raise</p>
                    <p className="text-xl font-bold text-blue-900">
                      ${(analysis.cash_runway_analysis.recommended_raise_amount / 1000000).toFixed(1)}M
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      {analysis.cash_runway_analysis.rationale}
                    </p>
                  </div>
                )}

                {analysis.cash_runway_analysis.key_milestones?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-900 mb-2">Key Milestones</p>
                    <ul className="space-y-1">
                      {analysis.cash_runway_analysis.key_milestones.map((milestone, i) => (
                        <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                          <Target className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          {milestone}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Unit Economics */}
          {analysis.unit_economics && (
            <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-emerald-900">
                  <DollarSign className="w-5 h-5" />
                  Unit Economics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-xs text-slate-600 mb-1">LTV:CAC</p>
                    <p className={cn("text-xl font-bold",
                      parseFloat(analysis.unit_economics.ltv_cac_ratio) >= 3 ? 'text-emerald-600' :
                      parseFloat(analysis.unit_economics.ltv_cac_ratio) >= 2 ? 'text-amber-600' :
                      'text-red-600'
                    )}>
                      {analysis.unit_economics.ltv_cac_ratio}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-xs text-slate-600 mb-1">Payback Period</p>
                    <p className={cn("text-xl font-bold",
                      parseFloat(analysis.unit_economics.payback_period) <= 12 ? 'text-emerald-600' :
                      parseFloat(analysis.unit_economics.payback_period) <= 18 ? 'text-amber-600' :
                      'text-red-600'
                    )}>
                      {analysis.unit_economics.payback_period} mo
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-xs text-slate-600 mb-1">CLTV</p>
                    <p className="text-xl font-bold text-slate-900">
                      ${(analysis.unit_economics.cltv_calculation / 1000).toFixed(0)}K
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-lg p-3">
                  <p className="text-sm font-medium text-slate-900 mb-2">Assessment</p>
                  <p className={cn("text-sm", getHealthColor(analysis.unit_economics.assessment))}>
                    {analysis.unit_economics.assessment}
                  </p>
                </div>

                {analysis.unit_economics.recommendations?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-900 mb-2">Recommendations</p>
                    <ul className="space-y-1">
                      {analysis.unit_economics.recommendations.map((rec, i) => (
                        <li key={i} className="text-sm text-slate-700 pl-4">• {rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Burn Rate Benchmarks */}
          {analysis.burn_rate_benchmarks && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-5 h-5 text-slate-700" />
                  Burn Rate Benchmarks
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-600 mb-1">vs Industry</p>
                    <p className={cn("text-sm font-medium", getHealthColor(analysis.burn_rate_benchmarks.vs_industry))}>
                      {analysis.burn_rate_benchmarks.vs_industry}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-600 mb-1">Efficiency Score</p>
                    <p className="text-lg font-bold text-slate-900">
                      {analysis.burn_rate_benchmarks.efficiency_metric}
                    </p>
                  </div>
                </div>

                {analysis.burn_rate_benchmarks.red_flags?.length > 0 && (
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-sm font-medium text-red-900 mb-2 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Red Flags
                    </p>
                    <ul className="space-y-1">
                      {analysis.burn_rate_benchmarks.red_flags.map((flag, i) => (
                        <li key={i} className="text-sm text-red-700 pl-4">• {flag}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Valuation Indicators */}
          {analysis.valuation_indicators && (
            <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-purple-900">
                  <TrendingUp className="w-5 h-5" />
                  Valuation Indicators
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis.valuation_indicators.suggested_valuation_range && (
                  <div className="bg-white rounded-lg p-4 border border-purple-200">
                    <p className="text-sm font-medium text-slate-900 mb-2">Suggested Pre-Money Valuation</p>
                    <p className="text-2xl font-bold text-purple-900">
                      ${(analysis.valuation_indicators.suggested_valuation_range.min / 1000000).toFixed(1)}M - ${(analysis.valuation_indicators.suggested_valuation_range.max / 1000000).toFixed(1)}M
                    </p>
                    <p className="text-xs text-slate-600 mt-2">
                      {analysis.valuation_indicators.rationale}
                    </p>
                  </div>
                )}

                {analysis.valuation_indicators.revenue_multiples && (
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm font-medium text-slate-900 mb-2">Revenue Multiples Analysis</p>
                    <p className="text-sm text-slate-700">{analysis.valuation_indicators.revenue_multiples}</p>
                  </div>
                )}

                {analysis.valuation_indicators.comparable_companies?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-900 mb-2">Comparable Companies</p>
                    <div className="flex flex-wrap gap-2">
                      {analysis.valuation_indicators.comparable_companies.map((company, i) => (
                        <Badge key={i} variant="outline" className="bg-purple-100 text-purple-700">
                          {company}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Revenue Projections */}
          {analysis.revenue_projections && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-600" />
                  Revenue Projections Assessment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-slate-900 mb-1">Growth Trajectory</p>
                  <p className={cn("text-sm", getHealthColor(analysis.revenue_projections.growth_trajectory))}>
                    {analysis.revenue_projections.growth_trajectory}
                  </p>
                </div>

                {analysis.revenue_projections.path_to_profitability && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-sm font-medium text-slate-900 mb-1">Path to Profitability</p>
                    <p className="text-sm text-slate-700">{analysis.revenue_projections.path_to_profitability}</p>
                  </div>
                )}

                {analysis.revenue_projections.key_assumptions?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-900 mb-2">Key Assumptions to Validate</p>
                    <ul className="space-y-1">
                      {analysis.revenue_projections.key_assumptions.map((assumption, i) => (
                        <li key={i} className="text-sm text-slate-700 pl-4">• {assumption}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}