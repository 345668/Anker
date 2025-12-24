import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  BarChart3, Loader2, TrendingUp, Users, DollarSign, Target,
  Award, Activity, Percent
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

export default function BusinessMetricsAnalysis({ startup }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [metricsData, setMetricsData] = useState({
    mrr: '',
    arr: '',
    monthly_growth_rate: '',
    customer_count: '',
    churn_rate: '',
    nrr: '',
    cac: '',
    ltv: '',
    gross_margin: '',
    burn_multiple: '',
    magic_number: '',
  });

  const analyzeMetrics = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('mistralPitchAnalysis', {
        analysisType: 'business_metrics',
        metricsData: {
          ...metricsData,
          startup_stage: startup?.stage,
          industry: startup?.industry?.join(', '),
          mrr: parseFloat(metricsData.mrr) || 0,
          arr: parseFloat(metricsData.arr) || 0,
          monthly_growth_rate: parseFloat(metricsData.monthly_growth_rate) || 0,
          customer_count: parseInt(metricsData.customer_count) || 0,
          churn_rate: parseFloat(metricsData.churn_rate) || 0,
          nrr: parseFloat(metricsData.nrr) || 0,
          cac: parseFloat(metricsData.cac) || 0,
          ltv: parseFloat(metricsData.ltv) || 0,
          gross_margin: parseFloat(metricsData.gross_margin) || 0,
          burn_multiple: parseFloat(metricsData.burn_multiple) || 0,
          magic_number: parseFloat(metricsData.magic_number) || 0,
        }
      });

      if (response.data.success) {
        setAnalysis(response.data.analysis);
      }
    } catch (error) {
      console.error('Error analyzing metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPercentileColor = (percentile) => {
    if (percentile >= 75) return 'text-emerald-600';
    if (percentile >= 50) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            Business Metrics & Industry Diagnostics
          </CardTitle>
          <CardDescription>
            Comprehensive analysis of SaaS metrics with industry benchmarking powered by Mistral AI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <Label className="text-xs">MRR ($)</Label>
              <Input
                type="number"
                placeholder="50000"
                value={metricsData.mrr}
                onChange={(e) => setMetricsData({...metricsData, mrr: e.target.value})}
              />
            </div>
            <div>
              <Label className="text-xs">ARR ($)</Label>
              <Input
                type="number"
                placeholder="600000"
                value={metricsData.arr}
                onChange={(e) => setMetricsData({...metricsData, arr: e.target.value})}
              />
            </div>
            <div>
              <Label className="text-xs">Monthly Growth Rate (%)</Label>
              <Input
                type="number"
                placeholder="15"
                value={metricsData.monthly_growth_rate}
                onChange={(e) => setMetricsData({...metricsData, monthly_growth_rate: e.target.value})}
              />
            </div>
            <div>
              <Label className="text-xs">Customer Count</Label>
              <Input
                type="number"
                placeholder="100"
                value={metricsData.customer_count}
                onChange={(e) => setMetricsData({...metricsData, customer_count: e.target.value})}
              />
            </div>
            <div>
              <Label className="text-xs">Monthly Churn Rate (%)</Label>
              <Input
                type="number"
                placeholder="3"
                value={metricsData.churn_rate}
                onChange={(e) => setMetricsData({...metricsData, churn_rate: e.target.value})}
              />
            </div>
            <div>
              <Label className="text-xs">Net Revenue Retention (%)</Label>
              <Input
                type="number"
                placeholder="110"
                value={metricsData.nrr}
                onChange={(e) => setMetricsData({...metricsData, nrr: e.target.value})}
              />
            </div>
            <div>
              <Label className="text-xs">CAC ($)</Label>
              <Input
                type="number"
                placeholder="5000"
                value={metricsData.cac}
                onChange={(e) => setMetricsData({...metricsData, cac: e.target.value})}
              />
            </div>
            <div>
              <Label className="text-xs">LTV ($)</Label>
              <Input
                type="number"
                placeholder="20000"
                value={metricsData.ltv}
                onChange={(e) => setMetricsData({...metricsData, ltv: e.target.value})}
              />
            </div>
            <div>
              <Label className="text-xs">Gross Margin (%)</Label>
              <Input
                type="number"
                placeholder="75"
                value={metricsData.gross_margin}
                onChange={(e) => setMetricsData({...metricsData, gross_margin: e.target.value})}
              />
            </div>
          </div>

          <Button 
            onClick={analyzeMetrics}
            disabled={loading || !metricsData.mrr}
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
                Analyze Business Metrics
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {analysis && (
        <>
          {/* Investment Readiness Score */}
          {analysis.investment_readiness_score !== undefined && (
            <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-slate-600 mb-2">Investment Readiness Score</p>
                  <div className={cn(
                    "text-5xl font-bold mb-3",
                    analysis.investment_readiness_score >= 80 ? 'text-emerald-600' :
                    analysis.investment_readiness_score >= 60 ? 'text-amber-600' :
                    'text-red-600'
                  )}>
                    {analysis.investment_readiness_score}
                  </div>
                  <Progress value={analysis.investment_readiness_score} className="h-3" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Growth Metrics */}
          {analysis.growth_metrics && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                  Growth Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-600 mb-1">Growth Rate</p>
                    <p className="text-xl font-bold text-slate-900">
                      {analysis.growth_metrics.growth_rate}% MoM
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-600 mb-1">vs Industry</p>
                    <p className={cn("text-sm font-medium", getPercentileColor(70))}>
                      {analysis.growth_metrics.vs_industry_benchmarks}
                    </p>
                  </div>
                </div>

                {analysis.growth_metrics.retention_churn_analysis && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm font-medium text-blue-900 mb-1">Retention & Churn</p>
                    <p className="text-sm text-blue-800">{analysis.growth_metrics.retention_churn_analysis}</p>
                  </div>
                )}

                {analysis.growth_metrics.expansion_revenue_potential && (
                  <div className="p-3 bg-emerald-50 rounded-lg">
                    <p className="text-sm font-medium text-emerald-900 mb-1">Expansion Revenue Potential</p>
                    <p className="text-sm text-emerald-800">{analysis.growth_metrics.expansion_revenue_potential}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Customer Economics */}
          {analysis.customer_economics && (
            <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-emerald-900">
                  <Users className="w-5 h-5" />
                  Customer Economics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-xs text-slate-600 mb-1">CLTV</p>
                    <p className="text-lg font-bold text-emerald-900">
                      ${(analysis.customer_economics.cltv_calculation / 1000).toFixed(0)}K
                    </p>
                    <Badge variant="outline" className="text-xs mt-1">
                      {analysis.customer_economics.cltv_confidence}
                    </Badge>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-xs text-slate-600 mb-1">CAC</p>
                    <p className="text-lg font-bold text-slate-900">
                      ${(analysis.customer_economics.cac_by_channel?.average / 1000).toFixed(1)}K
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-xs text-slate-600 mb-1">LTV:CAC</p>
                    <p className={cn("text-lg font-bold",
                      parseFloat(analysis.customer_economics.ltv_cac_ratio) >= 3 ? 'text-emerald-600' :
                      'text-amber-600'
                    )}>
                      {analysis.customer_economics.ltv_cac_ratio}
                    </p>
                  </div>
                </div>

                {analysis.customer_economics.payback_period_analysis && (
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm font-medium text-slate-900 mb-1">Payback Period</p>
                    <p className="text-sm text-slate-700">{analysis.customer_economics.payback_period_analysis}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Operational Efficiency */}
          {analysis.operational_efficiency && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-5 h-5 text-slate-700" />
                  Operational Efficiency
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {analysis.operational_efficiency.burn_multiple !== undefined && (
                    <div className="bg-slate-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-slate-600 mb-1">Burn Multiple</p>
                      <p className={cn("text-xl font-bold",
                        analysis.operational_efficiency.burn_multiple <= 1.5 ? 'text-emerald-600' :
                        analysis.operational_efficiency.burn_multiple <= 2 ? 'text-amber-600' :
                        'text-red-600'
                      )}>
                        {analysis.operational_efficiency.burn_multiple}x
                      </p>
                    </div>
                  )}
                  {analysis.operational_efficiency.rule_of_40_score !== undefined && (
                    <div className="bg-slate-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-slate-600 mb-1">Rule of 40</p>
                      <p className={cn("text-xl font-bold",
                        analysis.operational_efficiency.rule_of_40_score >= 40 ? 'text-emerald-600' :
                        'text-amber-600'
                      )}>
                        {analysis.operational_efficiency.rule_of_40_score}
                      </p>
                    </div>
                  )}
                  {analysis.operational_efficiency.unit_economics_health && (
                    <div className="bg-slate-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-slate-600 mb-1">Unit Economics</p>
                      <Badge className={cn(
                        analysis.operational_efficiency.unit_economics_health === 'Healthy' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-amber-100 text-amber-700'
                      )}>
                        {analysis.operational_efficiency.unit_economics_health}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Industry Diagnostics */}
          {analysis.industry_diagnostics && (
            <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-purple-900">
                  <Award className="w-5 h-5" />
                  Industry Diagnostics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis.industry_diagnostics.industry_comparison && (
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-sm font-medium text-slate-900 mb-2">vs Industry Standards</p>
                    <p className="text-sm text-slate-700">{analysis.industry_diagnostics.industry_comparison}</p>
                  </div>
                )}

                {analysis.industry_diagnostics.percentile_rankings && (
                  <div>
                    <p className="text-sm font-medium text-slate-900 mb-2">Percentile Rankings</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(analysis.industry_diagnostics.percentile_rankings).map(([key, value]) => (
                        <div key={key} className="bg-white rounded p-2 flex items-center justify-between">
                          <span className="text-xs text-slate-600">{key.replace(/_/g, ' ')}</span>
                          <Badge className={cn(getPercentileColor(value))}>
                            {value}th
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.industry_diagnostics.red_flags?.length > 0 && (
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-sm font-medium text-red-900 mb-2">Red Flags</p>
                    <ul className="space-y-1">
                      {analysis.industry_diagnostics.red_flags.map((flag, i) => (
                        <li key={i} className="text-sm text-red-700 pl-4">• {flag}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.industry_diagnostics.green_flags?.length > 0 && (
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <p className="text-sm font-medium text-emerald-900 mb-2">Green Flags</p>
                    <ul className="space-y-1">
                      {analysis.industry_diagnostics.green_flags.map((flag, i) => (
                        <li key={i} className="text-sm text-emerald-700 pl-4">• {flag}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Valuation Insights */}
          {analysis.valuation_insights && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-indigo-600" />
                  Valuation Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis.valuation_insights.revenue_multiple_range && (
                  <div className="bg-indigo-50 rounded-lg p-3">
                    <p className="text-sm font-medium text-indigo-900 mb-1">Revenue Multiple Range</p>
                    <p className="text-lg font-bold text-indigo-900">
                      {analysis.valuation_insights.revenue_multiple_range}
                    </p>
                  </div>
                )}

                {analysis.valuation_insights.comparable_companies?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-900 mb-2">Comparable Companies</p>
                    <div className="flex flex-wrap gap-2">
                      {analysis.valuation_insights.comparable_companies.map((company, i) => (
                        <Badge key={i} variant="secondary">{company}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.valuation_insights.suggested_valuation_range && (
                  <div className="p-3 bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                    <p className="text-sm font-medium text-purple-900 mb-2">Suggested Pre-Money Valuation</p>
                    <p className="text-2xl font-bold text-purple-900">
                      ${(analysis.valuation_insights.suggested_valuation_range.min / 1000000).toFixed(1)}M - ${(analysis.valuation_insights.suggested_valuation_range.max / 1000000).toFixed(1)}M
                    </p>
                    {analysis.valuation_insights.rationale && (
                      <p className="text-xs text-purple-700 mt-2">{analysis.valuation_insights.rationale}</p>
                    )}
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