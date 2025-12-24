import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Building2, Loader2, Sparkles, Star, TrendingUp, Target
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SimilarCompanyInvestors({ startups, firms, contacts }) {
  const [selectedStartup, setSelectedStartup] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyzeInvestors = async () => {
    if (!selectedStartup) return;
    setIsAnalyzing(true);

    try {
      const startup = startups.find(s => s.id === selectedStartup);

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a venture capital research analyst. Find investors who have invested in companies similar to this startup.

STARTUP PROFILE:
Name: ${startup.company_name}
Industry: ${startup.industry?.join(', ')}
Stage: ${startup.stage}
Problem: ${startup.problem}
Solution: ${startup.solution}
One-liner: ${startup.one_liner}

TASK:
Research and identify:
1. Similar companies in the same space (competitors, adjacent players)
2. Which investors backed these similar companies
3. Investment stage and check sizes
4. Why these investors would be interested in this startup
5. Pattern analysis: what do these investors look for?

Provide specific investor names and firms, not just general advice.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            similar_companies: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  company_name: { type: 'string' },
                  description: { type: 'string' },
                  similarity_reason: { type: 'string' },
                  stage: { type: 'string' },
                  funding_raised: { type: 'string' }
                }
              }
            },
            investors_found: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  investor_name: { type: 'string' },
                  firm_name: { type: 'string' },
                  companies_invested: { type: 'array', items: { type: 'string' } },
                  typical_check_size: { type: 'string' },
                  investment_stages: { type: 'array', items: { type: 'string' } },
                  why_relevant: { type: 'string' },
                  recent_activity: { type: 'string' },
                  thesis_alignment: { type: 'string' },
                  contact_info: { type: 'string' },
                  interest_likelihood: { type: 'string', enum: ['high', 'medium', 'low'] }
                }
              }
            },
            investment_patterns: {
              type: 'object',
              properties: {
                common_themes: { type: 'array', items: { type: 'string' } },
                typical_metrics: { type: 'string' },
                geographic_focus: { type: 'array', items: { type: 'string' } },
                key_decision_factors: { type: 'array', items: { type: 'string' } }
              }
            },
            recommendation: { type: 'string' }
          }
        }
      });

      setAnalysis(result);
    } catch (error) {
      console.error('Error analyzing investors:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const interestConfig = {
    high: { color: 'bg-emerald-100 text-emerald-700', label: 'High Interest' },
    medium: { color: 'bg-amber-100 text-amber-700', label: 'Medium Interest' },
    low: { color: 'bg-slate-100 text-slate-700', label: 'Low Interest' },
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Similar Company Investors</CardTitle>
          <CardDescription>
            Discover investors who backed companies similar to yours
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Select value={selectedStartup} onValueChange={setSelectedStartup}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a startup" />
              </SelectTrigger>
              <SelectContent>
                {startups.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              onClick={analyzeInvestors}
              disabled={!selectedStartup || isAnalyzing}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Find Investors
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {analysis && (
        <>
          {/* Similar Companies */}
          {analysis.similar_companies?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Similar Companies</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analysis.similar_companies.map((company, i) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-lg border">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium text-slate-900">{company.company_name}</h4>
                          <p className="text-xs text-slate-500">{company.stage} • {company.funding_raised}</p>
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 mb-1">{company.description}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-medium">Why similar:</span> {company.similarity_reason}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Investment Patterns */}
          {analysis.investment_patterns && (
            <Card className="bg-gradient-to-br from-violet-50 to-indigo-50 border-indigo-200">
              <CardHeader>
                <CardTitle className="text-base text-indigo-900">Investment Patterns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis.investment_patterns.common_themes?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-indigo-900 mb-2">Common Themes</p>
                    <div className="flex flex-wrap gap-2">
                      {analysis.investment_patterns.common_themes.map((theme, i) => (
                        <Badge key={i} className="bg-indigo-100 text-indigo-700">{theme}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {analysis.investment_patterns.typical_metrics && (
                  <div>
                    <p className="text-sm font-medium text-indigo-900 mb-1">Typical Metrics</p>
                    <p className="text-sm text-indigo-700">{analysis.investment_patterns.typical_metrics}</p>
                  </div>
                )}
                {analysis.investment_patterns.key_decision_factors?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-indigo-900 mb-2">Key Decision Factors</p>
                    <ul className="space-y-1">
                      {analysis.investment_patterns.key_decision_factors.map((factor, i) => (
                        <li key={i} className="text-sm text-indigo-700 flex items-start gap-2">
                          <Star className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          {factor}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Investors */}
          {analysis.investors_found?.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Investors Found ({analysis.investors_found.length})
              </h3>
              {analysis.investors_found.map((investor, i) => {
                const interest = interestConfig[investor.interest_likelihood] || interestConfig.medium;
                
                return (
                  <Card key={i} className="hover:shadow-lg transition-shadow">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-slate-900">{investor.investor_name}</h4>
                          <p className="text-sm text-slate-500">{investor.firm_name}</p>
                        </div>
                        <Badge className={interest.color}>{interest.label}</Badge>
                      </div>

                      <div className="space-y-3">
                        {investor.companies_invested?.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-slate-700 mb-1">Invested In</p>
                            <div className="flex flex-wrap gap-1">
                              {investor.companies_invested.map((company, j) => (
                                <Badge key={j} variant="outline" className="text-xs">{company}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="p-2 bg-emerald-50 rounded border border-emerald-100">
                          <p className="text-xs font-medium text-emerald-800 mb-1">Why Relevant</p>
                          <p className="text-sm text-emerald-700">{investor.why_relevant}</p>
                        </div>

                        {investor.thesis_alignment && (
                          <div>
                            <p className="text-xs font-medium text-slate-700 mb-1">Thesis Alignment</p>
                            <p className="text-sm text-slate-600">{investor.thesis_alignment}</p>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="text-slate-500">Check Size</p>
                            <p className="font-medium text-slate-900">{investor.typical_check_size}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Stages</p>
                            <p className="font-medium text-slate-900">
                              {investor.investment_stages?.join(', ')}
                            </p>
                          </div>
                        </div>

                        {investor.recent_activity && (
                          <div className="p-2 bg-blue-50 rounded text-xs">
                            <p className="font-medium text-blue-800 mb-1">Recent Activity</p>
                            <p className="text-blue-700">{investor.recent_activity}</p>
                          </div>
                        )}

                        {investor.contact_info && (
                          <p className="text-xs text-slate-500">
                            📧 {investor.contact_info}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Recommendation */}
          {analysis.recommendation && (
            <Card className="border-indigo-200 bg-indigo-50">
              <CardHeader>
                <CardTitle className="text-base text-indigo-900">Recommendation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-indigo-700">{analysis.recommendation}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!analysis && !isAnalyzing && (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Building2 className="w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No Analysis Yet</h3>
            <p className="text-slate-500 text-sm max-w-md">
              Select a startup to discover investors who backed similar companies
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}