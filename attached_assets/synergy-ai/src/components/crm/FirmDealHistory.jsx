import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Briefcase, Brain, Loader2, TrendingUp, Users, FileText,
  Clock, Target, Award, Calendar, DollarSign, CheckCircle,
  AlertCircle, Sparkles
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function FirmDealHistory({ firm, deals, contacts }) {
  const [analyzing, setAnalyzing] = useState(false);
  const queryClient = useQueryClient();

  // Filter deals for this firm
  const firmDeals = deals.filter(d => d.firm_id === firm.id);
  const closedDeals = firmDeals.filter(d => d.deal_stage === 'Closed');
  const activeDeals = firmDeals.filter(d => !['Closed', 'Passed'].includes(d.deal_stage));

  const analyzeDealHistory = async () => {
    setAnalyzing(true);
    toast.info('AI is analyzing deal history...');

    try {
      // Prepare deal history data
      const dealSummary = closedDeals.map(d => ({
        name: d.deal_name,
        stage: d.deal_stage,
        amount: d.expected_amount || d.actual_amount,
        type: d.deal_type,
        contact: d.contact_name,
        close_date: d.actual_close_date || d.expected_close_date,
        created_date: d.created_date
      }));

      const contactSummary = contacts
        .filter(c => c.firm_id === firm.id)
        .map(c => ({
          name: c.full_name,
          title: c.title,
          email: c.work_email
        }));

      // Call AI for analysis
      const analysis = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this investor firm's deal history and provide strategic insights.

**FIRM:** ${firm.company_name}
**TYPE:** ${firm.firm_type}
**FOCUS:** ${firm.investment_focus?.join(', ') || 'Not specified'}

**CLOSED DEALS (${closedDeals.length}):**
${dealSummary.map(d => `
- ${d.name}: $${d.amount ? (d.amount / 1000000).toFixed(1) : '?'}M (${d.type || 'Unknown type'})
  Contact: ${d.contact || 'Unknown'}
  Closed: ${d.close_date ? new Date(d.close_date).toLocaleDateString() : 'Unknown'}
`).join('\n')}

**CONTACTS (${contactSummary.length}):**
${contactSummary.map(c => `- ${c.name} (${c.title || 'Unknown role'}) - ${c.email || 'No email'}`).join('\n')}

**ACTIVE DEALS:** ${activeDeals.length}

**ANALYSIS TASKS:**

1. **KEY CONTACTS IDENTIFICATION:**
   - Identify the most important contacts for deal-making
   - For each, provide their role, estimated deal count, and average deal size
   - Suggest who to reach out to for new deals

2. **PREFERRED DEAL STRUCTURES:**
   - Identify most common deal types (Equity, SAFE, Convertible Note, etc.)
   - Calculate frequency and average amount for each
   - Determine their preferred investment structure

3. **PERFORMANCE TRENDS:**
   - Total deals completed
   - Average deal size
   - Success rate (closed vs total)
   - Average time to close (estimate based on dates)
   - Deal velocity (increasing, stable, decreasing)
   - Typical stages they engage at

4. **STRATEGIC INSIGHTS:**
   - 5-7 actionable insights about working with this firm
   - Patterns in their investment behavior
   - Best practices for approaching them
   - Red flags or considerations

Provide data-driven, specific recommendations.`,
        response_json_schema: {
          type: 'object',
          properties: {
            key_contacts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  role: { type: 'string' },
                  deal_count: { type: 'number' },
                  avg_deal_size: { type: 'number' }
                }
              }
            },
            preferred_deal_structures: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  structure: { type: 'string' },
                  frequency: { type: 'number' },
                  avg_amount: { type: 'number' }
                }
              }
            },
            performance_trends: {
              type: 'object',
              properties: {
                total_deals: { type: 'number' },
                avg_deal_size: { type: 'number' },
                success_rate: { type: 'number' },
                avg_time_to_close: { type: 'number' },
                deal_velocity: { type: 'string' },
                typical_stages: { type: 'array', items: { type: 'string' } }
              }
            },
            insights: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      });

      // Update firm with analysis
      await base44.entities.InvestorFirm.update(firm.id, {
        deal_history_analysis: {
          ...analysis,
          last_analyzed: new Date().toISOString()
        }
      });

      queryClient.invalidateQueries(['firms']);
      toast.success('Deal history analysis complete!');
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Failed to analyze deal history');
    } finally {
      setAnalyzing(false);
    }
  };

  const analysis = firm.deal_history_analysis;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-600" />
                Deal History
              </CardTitle>
              <CardDescription>
                Track all deals and AI-powered insights for {firm.company_name}
              </CardDescription>
            </div>
            <Button
              onClick={analyzeDealHistory}
              disabled={analyzing || closedDeals.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {analyzing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Brain className="w-4 h-4 mr-2" />
              )}
              {analysis ? 'Re-analyze' : 'Analyze History'}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Deal Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span className="text-sm text-slate-500">Closed Deals</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{closedDeals.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-slate-500">Active Deals</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{activeDeals.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-green-500" />
              <span className="text-sm text-slate-500">Total Value</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              ${(closedDeals.reduce((sum, d) => sum + (d.actual_amount || d.expected_amount || 0), 0) / 1000000).toFixed(1)}M
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-purple-500" />
              <span className="text-sm text-slate-500">Contacts</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {contacts.filter(c => c.firm_id === firm.id).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* AI Analysis Results */}
      {analysis ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Key Contacts */}
          {analysis.key_contacts?.length > 0 && (
            <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-indigo-900">
                  <Users className="w-5 h-5" />
                  Key Contacts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis.key_contacts.map((contact, i) => (
                  <div key={i} className="p-3 bg-white rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-slate-900">{contact.name}</p>
                        <p className="text-xs text-slate-600">{contact.role}</p>
                      </div>
                      <Badge className="bg-indigo-600 text-white">
                        {contact.deal_count} deals
                      </Badge>
                    </div>
                    {contact.avg_deal_size > 0 && (
                      <p className="text-sm text-slate-700">
                        Avg: ${(contact.avg_deal_size / 1000000).toFixed(1)}M
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Preferred Deal Structures */}
          {analysis.preferred_deal_structures?.length > 0 && (
            <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-900">
                  <FileText className="w-5 h-5" />
                  Preferred Deal Structures
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis.preferred_deal_structures.map((structure, i) => (
                  <div key={i} className="p-3 bg-white rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-slate-900">{structure.structure}</span>
                      <Badge variant="secondary">{structure.frequency}x</Badge>
                    </div>
                    {structure.avg_amount > 0 && (
                      <p className="text-sm text-slate-700">
                        Avg: ${(structure.avg_amount / 1000000).toFixed(1)}M
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Performance Trends */}
          {analysis.performance_trends && (
            <Card className="border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-900">
                  <TrendingUp className="w-5 h-5" />
                  Performance Trends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Total Deals</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {analysis.performance_trends.total_deals}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Avg Deal Size</p>
                    <p className="text-2xl font-bold text-slate-900">
                      ${(analysis.performance_trends.avg_deal_size / 1000000).toFixed(1)}M
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Success Rate</p>
                    <div>
                      <p className="text-2xl font-bold text-slate-900">
                        {analysis.performance_trends.success_rate}%
                      </p>
                      <Progress value={analysis.performance_trends.success_rate} className="h-1 mt-1" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Avg Time to Close</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {analysis.performance_trends.avg_time_to_close} days
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-medium">Deal Velocity:</span>
                    <Badge className={cn(
                      analysis.performance_trends.deal_velocity === 'increasing' && "bg-emerald-100 text-emerald-800",
                      analysis.performance_trends.deal_velocity === 'stable' && "bg-blue-100 text-blue-800",
                      analysis.performance_trends.deal_velocity === 'decreasing' && "bg-amber-100 text-amber-800"
                    )}>
                      {analysis.performance_trends.deal_velocity}
                    </Badge>
                  </div>
                  {analysis.performance_trends.typical_stages?.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Target className="w-4 h-4 text-emerald-600 mt-0.5" />
                      <div>
                        <span className="text-sm font-medium">Typical Stages:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {analysis.performance_trends.typical_stages.map((stage, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {stage}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Strategic Insights */}
          {analysis.insights?.length > 0 && (
            <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-900">
                  <Sparkles className="w-5 h-5" />
                  Strategic Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analysis.insights.map((insight, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-white rounded">
                      <Award className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-slate-700">{insight}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            {closedDeals.length === 0 ? (
              <>
                <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No closed deals yet to analyze</p>
              </>
            ) : (
              <>
                <Brain className="w-12 h-12 text-indigo-300 mx-auto mb-4" />
                <p className="text-slate-600 mb-2">
                  Analyze {closedDeals.length} closed deal{closedDeals.length > 1 ? 's' : ''} to discover insights
                </p>
                <Button
                  onClick={analyzeDealHistory}
                  disabled={analyzing}
                  className="mt-4"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Start Analysis
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Deals List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Deals</CardTitle>
        </CardHeader>
        <CardContent>
          {firmDeals.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No deals recorded</p>
          ) : (
            <div className="space-y-2">
              {firmDeals.slice(0, 10).map((deal) => (
                <div key={deal.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{deal.deal_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={cn(
                        deal.deal_stage === 'Closed' && "bg-emerald-100 text-emerald-800",
                        deal.deal_stage === 'Passed' && "bg-red-100 text-red-800"
                      )}>
                        {deal.deal_stage}
                      </Badge>
                      {deal.deal_type && (
                        <Badge variant="secondary" className="text-xs">{deal.deal_type}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {deal.expected_amount && (
                      <p className="font-semibold text-slate-900">
                        ${(deal.expected_amount / 1000000).toFixed(1)}M
                      </p>
                    )}
                    {deal.expected_close_date && (
                      <p className="text-xs text-slate-500">
                        {new Date(deal.expected_close_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}