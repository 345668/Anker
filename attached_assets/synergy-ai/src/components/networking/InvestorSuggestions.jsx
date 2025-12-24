import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Sparkles, Loader2, Building2, Star, MapPin, DollarSign,
  TrendingUp, Users, Target, ExternalLink
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
import { cn } from "@/lib/utils";

export default function InvestorSuggestions({ startups, matches, firms, contacts, outreaches }) {
  const [selectedStartup, setSelectedStartup] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateSuggestions = async () => {
    if (!selectedStartup) return;
    setIsGenerating(true);

    try {
      const startup = startups.find(s => s.id === selectedStartup);
      
      // Get outreach history for learning
      const outreachFirms = outreaches
        .filter(o => o.stage === 'replied' || o.stage === 'call_scheduled')
        .map(o => firms.find(f => f.id === o.firm_id))
        .filter(Boolean);

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an expert venture capital networker. Analyze this startup and suggest specific investors to connect with, prioritized by likelihood of interest and strategic fit.

STARTUP PROFILE:
Name: ${startup.company_name}
Industry: ${startup.industry?.join(', ')}
Stage: ${startup.stage}
Location: ${startup.location}
Funding Goal: $${startup.funding_goal || startup.funding_sought || 0}
Problem: ${startup.problem}
Solution: ${startup.solution}
Traction: ${JSON.stringify(startup.traction_metrics || {})}

EXISTING MATCHES:
${matches.slice(0, 10).map(m => {
  const firm = firms.find(f => f.id === m.firm_id);
  return `- ${firm?.company_name} (Score: ${m.match_score})`;
}).join('\n')}

SUCCESSFUL OUTREACH PATTERNS:
${outreachFirms.slice(0, 5).map(f => 
  `- ${f?.company_name}: ${f?.firm_type}, focuses on ${f?.investment_focus?.join(', ')}`
).join('\n')}

TASK:
1. Identify 5-8 specific investor firms NOT in existing matches
2. For each, explain WHY they're a great fit (be specific)
3. Provide networking strategy (warm intro vs cold outreach)
4. Suggest the best approach angle for each
5. Rate connection priority (critical/high/medium)

Consider:
- Industry alignment and thesis fit
- Stage match and check size compatibility  
- Geographic preferences
- Portfolio companies (synergies or competition)
- Recent funding activity in this space
- Investor's investment pace and availability`,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            suggested_investors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  investor_name: { type: 'string' },
                  firm_type: { type: 'string' },
                  priority: { type: 'string', enum: ['critical', 'high', 'medium'] },
                  fit_score: { type: 'number' },
                  why_perfect_fit: { type: 'string' },
                  networking_strategy: { type: 'string' },
                  approach_angle: { type: 'string' },
                  warm_intro_potential: { type: 'boolean' },
                  potential_connectors: { type: 'array', items: { type: 'string' } },
                  recent_investments: { type: 'array', items: { type: 'string' } },
                  estimated_response_time: { type: 'string' }
                }
              }
            },
            overall_networking_strategy: { type: 'string' },
            timing_recommendation: { type: 'string' },
            key_talking_points: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      setSuggestions(result);
    } catch (error) {
      console.error('Error generating suggestions:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const priorityConfig = {
    critical: { color: 'bg-red-100 text-red-700', label: 'Critical' },
    high: { color: 'bg-orange-100 text-orange-700', label: 'High Priority' },
    medium: { color: 'bg-blue-100 text-blue-700', label: 'Medium Priority' },
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Investor Suggestions</CardTitle>
          <CardDescription>
            Get personalized investor recommendations based on your startup profile and funding stage
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
              onClick={generateSuggestions}
              disabled={!selectedStartup || isGenerating}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Suggestions
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {suggestions && (
        <>
          {/* Strategy Overview */}
          <Card className="bg-gradient-to-br from-indigo-50 to-violet-50 border-indigo-200">
            <CardHeader>
              <CardTitle className="text-base text-indigo-900">Networking Strategy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium text-indigo-900 mb-1">Overall Strategy</p>
                <p className="text-sm text-indigo-700">{suggestions.overall_networking_strategy}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-indigo-900 mb-1">Timing</p>
                <p className="text-sm text-indigo-700">{suggestions.timing_recommendation}</p>
              </div>
              {suggestions.key_talking_points?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-indigo-900 mb-2">Key Talking Points</p>
                  <div className="space-y-1">
                    {suggestions.key_talking_points.map((point, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-indigo-700">
                        <Star className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Investor Suggestions */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Suggested Investors ({suggestions.suggested_investors?.length || 0})
            </h3>
            {suggestions.suggested_investors?.map((investor, i) => {
              const priority = priorityConfig[investor.priority] || priorityConfig.medium;
              
              return (
                <Card key={i} className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-12 h-12 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-lg flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-indigo-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900">{investor.investor_name}</h4>
                            <p className="text-sm text-slate-500">{investor.firm_type}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge className={priority.color}>{priority.label}</Badge>
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-amber-500" />
                          <span className="text-sm font-semibold text-slate-900">
                            {investor.fit_score}/100
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Why Perfect Fit */}
                    <div className="mb-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                      <p className="text-xs font-medium text-emerald-800 mb-1">
                        Why This Is a Perfect Fit
                      </p>
                      <p className="text-sm text-emerald-700">{investor.why_perfect_fit}</p>
                    </div>

                    {/* Networking Strategy */}
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-medium text-slate-700 mb-1">Networking Strategy</p>
                        <p className="text-sm text-slate-600">{investor.networking_strategy}</p>
                      </div>
                      
                      <div>
                        <p className="text-xs font-medium text-slate-700 mb-1">Approach Angle</p>
                        <p className="text-sm text-slate-600">{investor.approach_angle}</p>
                      </div>

                      {investor.warm_intro_potential && investor.potential_connectors?.length > 0 && (
                        <div className="p-2 bg-violet-50 rounded border border-violet-100">
                          <p className="text-xs font-medium text-violet-800 mb-1">
                            🔥 Warm Intro Opportunity
                          </p>
                          <p className="text-xs text-violet-700">
                            Potential connectors: {investor.potential_connectors.join(', ')}
                          </p>
                        </div>
                      )}

                      {investor.recent_investments?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-700 mb-1">Recent Investments</p>
                          <div className="flex flex-wrap gap-1">
                            {investor.recent_investments.map((inv, j) => (
                              <Badge key={j} variant="outline" className="text-xs">{inv}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {investor.estimated_response_time && (
                        <p className="text-xs text-slate-500">
                          ⏱️ Estimated response time: {investor.estimated_response_time}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {!suggestions && !isGenerating && (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No Suggestions Yet</h3>
            <p className="text-slate-500 text-sm max-w-md">
              Select a startup and generate AI-powered investor suggestions tailored to your profile
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}