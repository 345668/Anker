import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Sparkles, Loader2, TrendingUp, Building2, Target, CheckCircle,
  X, Eye, ArrowRight, RefreshCw, Brain, ExternalLink, Plus
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function AIDealSourcing({ firms, onLeadsGenerated }) {
  const [isSourcing, setIsSourcing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [leads, setLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);

  const queryClient = useQueryClient();

  const convertLeadMutation = useMutation({
    mutationFn: async ({ lead, firmId }) => {
      const selectedFirm = firms.find(f => f.id === firmId);
      
      // Create the actual deal
      const deal = await base44.entities.InvestmentDeal.create({
        deal_name: `${lead.company_name} - ${lead.stage || 'Investment'}`,
        firm_id: firmId,
        firm_name: selectedFirm?.company_name,
        deal_stage: 'Initial Contact',
        expected_amount: lead.funding_amount,
        status: 'Active',
        notes: `AI-sourced deal from ${lead.source}\n\n${lead.description}`,
        deal_source: lead.source,
      });

      // Update lead status
      await base44.entities.DealLead.update(lead.id, { 
        status: 'converted' 
      });

      return deal;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['deals']);
      queryClient.invalidateQueries(['deal-leads']);
      toast.success('Deal created successfully');
      setShowReviewDialog(false);
    },
  });

  const dismissLeadMutation = useMutation({
    mutationFn: (leadId) => base44.entities.DealLead.update(leadId, { status: 'dismissed' }),
    onSuccess: () => {
      queryClient.invalidateQueries(['deal-leads']);
      toast.success('Lead dismissed');
      setShowReviewDialog(false);
    },
  });

  const sourceDealLeads = async () => {
    setIsSourcing(true);
    setProgress(0);
    setLeads([]);

    try {
      toast.info('AI is searching for potential deals...');
      setProgress(20);

      // Step 1: Use AI to find recent funding announcements and deals from multiple sources
      let dealData;
      try {
        dealData = await base44.integrations.Core.InvokeLLM({
        prompt: `Search multiple data sources for recent startup funding announcements and investment deals from the past 7 days.

**DATA SOURCES TO SEARCH:**
1. Tech News: TechCrunch, VentureBeat, The Information, Axios, Bloomberg
2. Social Media: Twitter/X trending funding announcements, LinkedIn company updates
3. Industry Reports: CB Insights, PitchBook mentions, Crunchbase News
4. Press Releases: Company blogs, PR Newswire
5. Investor Updates: VC firm portfolio announcements

**FOCUS ON:**
- Series A, Series B, Seed funding announcements
- Notable startup launches with funding
- Acquisition and exit news
- Investment rounds in various sectors
- Social media buzz and validation
- Industry analyst mentions

**FOR EACH DEAL, EXTRACT:**
- Company name
- Website URL
- Industry/sector (specific, not generic)
- Funding stage (Pre-seed, Seed, Series A, B, etc.)
- Funding amount (in USD)
- Brief description of what the company does
- Lead investor(s) if mentioned
- Social media sentiment (positive/neutral/negative)
- Market trend relevance
- Source URLs (news, social, reports)
- Key market signals

Find 5-8 real, recent deals with strong validation across multiple sources.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            deals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  company_name: { type: 'string' },
                  website: { type: 'string' },
                  industry: { type: 'array', items: { type: 'string' } },
                  stage: { type: 'string' },
                  funding_amount: { type: 'number' },
                  description: { type: 'string' },
                  source_url: { type: 'string' },
                  lead_investors: { type: 'array', items: { type: 'string' } },
                  social_sentiment: { type: 'string' },
                  market_trend: { type: 'string' },
                  data_sources: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          }
        }
      });
      } catch (llmError) {
        console.error('LLM call failed:', llmError);
        toast.error('Failed to fetch deals from AI. Please try again.');
        setIsSourcing(false);
        return;
      }

      setProgress(50);

      if (!dealData.deals || dealData.deals.length === 0) {
        toast.error('No deals found');
        setIsSourcing(false);
        return;
      }

      toast.info(`Found ${dealData.deals.length} potential deals. Analyzing...`);

      // Step 2: For each deal, generate tags and match with firms
      const enrichedLeads = [];
      
      for (let i = 0; i < dealData.deals.length; i++) {
        const deal = dealData.deals[i];
        setProgress(50 + (i / dealData.deals.length) * 40);

        try {
          // Generate tags, match existing firms, discover new potential investors, predict closing likelihood, and analyze market trends
          let analysis;
          try {
            analysis = await base44.integrations.Core.InvokeLLM({
            prompt: `Comprehensive analysis of this startup deal including investor matching (existing + new discovery), closing prediction, and market trends.

**DEAL INFORMATION:**
Company: ${deal.company_name}
Industry: ${deal.industry?.join(', ')}
Stage: ${deal.stage}
Amount: $${deal.funding_amount?.toLocaleString() || 'Unknown'}
Description: ${deal.description}
Lead Investors: ${deal.lead_investors?.join(', ') || 'Unknown'}
Social Sentiment: ${deal.social_sentiment || 'Unknown'}
Market Trend: ${deal.market_trend || 'Unknown'}
Data Sources: ${deal.data_sources?.join(', ') || 'Unknown'}

**EXISTING INVESTOR FIRMS IN DATABASE:**
${firms.slice(0, 30).map(f => `
- ${f.company_name} (Type: ${f.firm_type}, Focus: ${f.investment_focus?.join(', ')}, Stages: ${f.investment_stages?.join(', ')}, Geography: ${f.preferred_geography?.join(', ')}, Check Size: $${f.check_size_min || '?'}-${f.check_size_max || '?'})
`).join('\n')}

**COMPREHENSIVE ANALYSIS TASKS:**

1. **DEAL CATEGORIZATION:**
   - Generate 5-8 specific tags (e.g., "B2B SaaS", "AI-Powered", "Series A", "US-Based", "High-Growth")

2. **EXISTING INVESTOR MATCHING:**
   - Identify TOP 3 most relevant investor firms from the database above
   - For each matched firm provide:
     * Match score (0-100)
     * 2-3 specific reasons why they're a good match
     * Risk factors for the match

3. **NEW INVESTOR DISCOVERY (CRITICAL):**
   - Search the web for 3-5 NEW investor firms NOT in the database above that would be excellent matches
   - Look for firms that:
     * Recently invested in similar companies/sectors
     * Are actively investing in this stage (${deal.stage})
     * Have participated in comparable deals
     * Are trending in this space based on recent news
   - For each new firm provide:
     * Firm name
     * Website URL
     * Type (VC, CVC, Family Office, etc.)
     * Why they're a strong match (2-3 specific reasons)
     * Recent similar investments (actual company names)
     * Match score (0-100)
     * Check size range if available
   - Use Crunchbase, news, recent funding announcements, LinkedIn

4. **CLOSING LIKELIHOOD PREDICTION:**
   - Predict probability of deal closing successfully (0-100)
   - Key factors supporting the prediction
   - Risk factors that could prevent closing
   - Recommended actions to increase likelihood

5. **MARKET TREND ANALYSIS:**
   - Current market trend for this industry/sector
   - Is this sector hot, warm, or cooling?
   - Recent comparable deals and their outcomes
   - Market timing assessment (good/neutral/poor)
   - Competitive landscape insights
   - Investment thesis strength

6. **OVERALL ASSESSMENT:**
   - Confidence in deal quality (0-100)
   - Investment recommendation (strong/moderate/weak)

IMPORTANT: For new investor discovery, find REAL firms with verifiable recent activity. Use web search extensively.`,
            response_json_schema: {
              type: 'object',
              properties: {
                tags: { type: 'array', items: { type: 'string' } },
                matched_firms: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      firm_name: { type: 'string' },
                      match_score: { type: 'number' },
                      match_reasons: { type: 'array', items: { type: 'string' } },
                      risk_factors: { type: 'array', items: { type: 'string' } }
                    }
                  }
                },
                confidence: { type: 'number' },
                closing_prediction: {
                  type: 'object',
                  properties: {
                    likelihood: { type: 'number' },
                    supporting_factors: { type: 'array', items: { type: 'string' } },
                    risk_factors: { type: 'array', items: { type: 'string' } },
                    recommended_actions: { type: 'array', items: { type: 'string' } }
                  }
                },
                market_analysis: {
                  type: 'object',
                  properties: {
                    trend_direction: { type: 'string' },
                    market_temperature: { type: 'string' },
                    comparable_deals: { type: 'array', items: { type: 'string' } },
                    timing_assessment: { type: 'string' },
                    competitive_landscape: { type: 'string' },
                    investment_thesis: { type: 'string' }
                  }
                },
                investment_recommendation: { type: 'string' },
                new_investor_suggestions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      firm_name: { type: 'string' },
                      website: { type: 'string' },
                      firm_type: { type: 'string' },
                      match_reasons: { type: 'array', items: { type: 'string' } },
                      recent_investments: { type: 'array', items: { type: 'string' } },
                      match_score: { type: 'number' },
                      check_size_range: { type: 'string' }
                    }
                  }
                }
              }
            }
          });
          } catch (analysisError) {
            console.error('Analysis failed for:', deal.company_name, analysisError);
            // Continue with partial data
            analysis = { 
              tags: [], 
              matched_firms: [], 
              confidence: 50,
              closing_prediction: { likelihood: 50, supporting_factors: [], risk_factors: [], recommended_actions: [] },
              market_analysis: { trend_direction: 'Unknown', market_temperature: 'neutral', comparable_deals: [], timing_assessment: 'neutral', competitive_landscape: '', investment_thesis: '' },
              investment_recommendation: 'moderate',
              new_investor_suggestions: []
            };
          }

          // Match firm names to IDs
          const matchedFirmsWithIds = analysis.matched_firms?.map(match => {
            const firm = firms.find(f => 
              f.company_name?.toLowerCase() === match.firm_name?.toLowerCase()
            );
            return {
              firm_id: firm?.id,
              firm_name: match.firm_name,
              match_score: match.match_score,
              match_reasons: match.match_reasons
            };
          }).filter(m => m.firm_id);

          // Create the lead
          let lead;
          try {
            lead = await base44.entities.DealLead.create({
            company_name: deal.company_name,
            website: deal.website,
            industry: deal.industry,
            stage: deal.stage,
            funding_amount: deal.funding_amount,
            description: deal.description,
            source: 'AI Web Search',
            source_url: deal.source_url,
            ai_generated_tags: analysis.tags || [],
            matched_firms: matchedFirmsWithIds || [],
            status: 'pending',
            ai_confidence: analysis.confidence || 70,
            raw_data: {
              ...dealData,
              closing_prediction: analysis.closing_prediction,
              market_analysis: analysis.market_analysis,
              investment_recommendation: analysis.investment_recommendation,
              new_investor_suggestions: analysis.new_investor_suggestions || []
            }
          });
          
          enrichedLeads.push(lead);
          } catch (createError) {
            console.error('Failed to create lead:', deal.company_name, createError);
          }
        } catch (error) {
          console.error('Error processing deal:', deal.company_name, error);
        }
      }

      setProgress(100);
      setLeads(enrichedLeads);
      queryClient.invalidateQueries(['deal-leads']);
      toast.success(`Generated ${enrichedLeads.length} deal leads!`);
      
      if (onLeadsGenerated) onLeadsGenerated(enrichedLeads);
    } catch (error) {
      console.error('Deal sourcing error:', error);
      toast.error(`Failed to source deals: ${error.message}`);
    } finally {
      setIsSourcing(false);
    }
  };

  const handleReviewLead = (lead) => {
    setSelectedLead(lead);
    setShowReviewDialog(true);
  };

  const handleConvertLead = (firmId) => {
    if (selectedLead) {
      convertLeadMutation.mutate({ lead: selectedLead, firmId });
    }
  };

  const handleDismissLead = () => {
    if (selectedLead) {
      dismissLeadMutation.mutate(selectedLead.id);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-indigo-600" />
            AI Deal Sourcing
          </CardTitle>
          <CardDescription>
            Automatically discover and match potential deals from external sources
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isSourcing && leads.length === 0 && (
            <div className="text-center py-6">
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-indigo-600" />
                </div>
              </div>
              <p className="text-slate-600 mb-4">
                Let AI scan the web for recent funding announcements and match them with your investor firms
              </p>
              <Button 
                onClick={sourceDealLeads}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Brain className="w-4 h-4 mr-2" />
                Start AI Sourcing
              </Button>
            </div>
          )}

          {isSourcing && (
            <div className="space-y-4 py-6">
              <div className="flex items-center justify-center mb-4">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Searching for deals...</span>
                  <span className="font-medium text-slate-900">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
              <p className="text-xs text-center text-slate-500">
                Analyzing news feeds, funding announcements, and matching with investor profiles
              </p>
            </div>
          )}

          {leads.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  <span className="font-medium text-slate-900">
                    {leads.length} Deal Leads Found
                  </span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={sourceDealLeads}
                  disabled={isSourcing}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Refresh
                </Button>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {leads.map((lead) => (
                  <div 
                    key={lead.id}
                    className="p-4 border border-slate-200 rounded-lg bg-white hover:border-indigo-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-slate-900">{lead.company_name}</h4>
                          {lead.website && (
                            <a
                              href={lead.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-700"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 line-clamp-2">{lead.description}</p>
                      </div>
                      <Badge className={cn(
                        "ml-2",
                        lead.ai_confidence >= 80 ? "bg-emerald-100 text-emerald-800" :
                        lead.ai_confidence >= 60 ? "bg-blue-100 text-blue-800" :
                        "bg-amber-100 text-amber-800"
                      )}>
                        {lead.ai_confidence}% confidence
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      {lead.stage && (
                        <Badge variant="secondary" className="text-xs">
                          {lead.stage}
                        </Badge>
                      )}
                      {lead.funding_amount && (
                        <Badge variant="secondary" className="text-xs">
                          ${(lead.funding_amount / 1000000).toFixed(1)}M
                        </Badge>
                      )}
                      {lead.industry?.slice(0, 2).map((ind, i) => (
                        <Badge key={i} className="bg-indigo-100 text-indigo-800 text-xs">
                          {ind}
                        </Badge>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {lead.raw_data?.closing_prediction?.likelihood && (
                        <div className="p-2 bg-blue-50 rounded">
                          <div className="text-xs text-blue-600 mb-1 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            Close Likelihood
                          </div>
                          <div className="font-semibold text-blue-900">
                            {lead.raw_data.closing_prediction.likelihood}%
                          </div>
                        </div>
                      )}
                      {lead.raw_data?.market_analysis?.market_temperature && (
                        <div className="p-2 bg-purple-50 rounded">
                          <div className="text-xs text-purple-600 mb-1">Market</div>
                          <Badge className={cn(
                            "text-xs",
                            lead.raw_data.market_analysis.market_temperature === 'hot' && "bg-red-100 text-red-800",
                            lead.raw_data.market_analysis.market_temperature === 'warm' && "bg-orange-100 text-orange-800",
                            lead.raw_data.market_analysis.market_temperature === 'neutral' && "bg-slate-100 text-slate-800",
                            lead.raw_data.market_analysis.market_temperature === 'cooling' && "bg-blue-100 text-blue-800"
                          )}>
                            {lead.raw_data.market_analysis.market_temperature}
                          </Badge>
                        </div>
                      )}
                    </div>

                    {lead.matched_firms?.length > 0 && (
                      <div className="mb-3 p-2 bg-slate-50 rounded">
                        <div className="text-xs text-slate-600 mb-2 flex items-center gap-1">
                          <Target className="w-3 h-3" />
                          Matched Firms:
                        </div>
                        <div className="space-y-1">
                          {lead.matched_firms.slice(0, 2).map((match, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-700">{match.firm_name}</span>
                              <span className="text-emerald-600">{match.match_score}% match</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleReviewLead(lead)}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Review & Convert
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => dismissLeadMutation.mutate(lead.id)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Deal Lead</DialogTitle>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-6">
              {/* Company Info */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-bold text-slate-900">{selectedLead.company_name}</h3>
                  {selectedLead.website && (
                    <a
                      href={selectedLead.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-700"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
                <p className="text-slate-600">{selectedLead.description}</p>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                {selectedLead.stage && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Stage</p>
                    <Badge>{selectedLead.stage}</Badge>
                  </div>
                )}
                {selectedLead.funding_amount && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Funding Amount</p>
                    <p className="font-semibold text-slate-900">
                      ${(selectedLead.funding_amount / 1000000).toFixed(1)}M
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-500 mb-1">AI Confidence</p>
                  <Badge className={cn(
                    selectedLead.ai_confidence >= 80 ? "bg-emerald-100 text-emerald-800" :
                    selectedLead.ai_confidence >= 60 ? "bg-blue-100 text-blue-800" :
                    "bg-amber-100 text-amber-800"
                  )}>
                    {selectedLead.ai_confidence}%
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Source</p>
                  {selectedLead.source_url ? (
                    <a
                      href={selectedLead.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      View Source <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <p className="text-xs text-slate-600">{selectedLead.source}</p>
                  )}
                </div>
              </div>

              {/* Tags */}
              {selectedLead.ai_generated_tags?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">AI-Generated Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedLead.ai_generated_tags.map((tag, i) => (
                      <Badge key={i} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Predictions & Market Insights */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Closing Prediction */}
                {selectedLead.raw_data?.closing_prediction && (
                  <div className="p-4 border border-blue-200 rounded-lg bg-blue-50">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                      <h4 className="font-semibold text-blue-900">Closing Prediction</h4>
                    </div>
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-blue-700">Likelihood</span>
                        <span className="text-2xl font-bold text-blue-900">
                          {selectedLead.raw_data.closing_prediction.likelihood}%
                        </span>
                      </div>
                      <Progress 
                        value={selectedLead.raw_data.closing_prediction.likelihood} 
                        className="h-2"
                      />
                    </div>
                    {selectedLead.raw_data.closing_prediction.supporting_factors?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs font-medium text-blue-700 mb-1">Supporting:</p>
                        {selectedLead.raw_data.closing_prediction.supporting_factors.slice(0, 2).map((factor, i) => (
                          <p key={i} className="text-xs text-blue-800 flex items-start gap-1">
                            <span className="text-emerald-600">✓</span> {factor}
                          </p>
                        ))}
                      </div>
                    )}
                    {selectedLead.raw_data.closing_prediction.risk_factors?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-blue-700 mb-1">Risks:</p>
                        {selectedLead.raw_data.closing_prediction.risk_factors.slice(0, 2).map((risk, i) => (
                          <p key={i} className="text-xs text-blue-800 flex items-start gap-1">
                            <span className="text-amber-600">!</span> {risk}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Market Analysis */}
                {selectedLead.raw_data?.market_analysis && (
                  <div className="p-4 border border-purple-200 rounded-lg bg-purple-50">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="w-5 h-5 text-purple-600" />
                      <h4 className="font-semibold text-purple-900">Market Insights</h4>
                    </div>
                    <div className="space-y-2">
                      {selectedLead.raw_data.market_analysis.market_temperature && (
                        <div>
                          <span className="text-xs text-purple-700">Temperature:</span>
                          <Badge className={cn(
                            "ml-2",
                            selectedLead.raw_data.market_analysis.market_temperature === 'hot' && "bg-red-100 text-red-800",
                            selectedLead.raw_data.market_analysis.market_temperature === 'warm' && "bg-orange-100 text-orange-800",
                            selectedLead.raw_data.market_analysis.market_temperature === 'neutral' && "bg-slate-100 text-slate-800"
                          )}>
                            {selectedLead.raw_data.market_analysis.market_temperature}
                          </Badge>
                        </div>
                      )}
                      {selectedLead.raw_data.market_analysis.trend_direction && (
                        <p className="text-xs text-purple-800">
                          <span className="font-medium">Trend:</span> {selectedLead.raw_data.market_analysis.trend_direction}
                        </p>
                      )}
                      {selectedLead.raw_data.market_analysis.timing_assessment && (
                        <p className="text-xs text-purple-800">
                          <span className="font-medium">Timing:</span> {selectedLead.raw_data.market_analysis.timing_assessment}
                        </p>
                      )}
                      {selectedLead.raw_data.market_analysis.comparable_deals?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-purple-700 mb-1">Comparable Deals:</p>
                          {selectedLead.raw_data.market_analysis.comparable_deals.slice(0, 2).map((deal, i) => (
                            <p key={i} className="text-xs text-purple-800">• {deal}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Investment Recommendation */}
              {selectedLead.raw_data?.investment_recommendation && (
                <div className={cn(
                  "p-3 rounded-lg border-2",
                  selectedLead.raw_data.investment_recommendation === 'strong' && "bg-emerald-50 border-emerald-300",
                  selectedLead.raw_data.investment_recommendation === 'moderate' && "bg-blue-50 border-blue-300",
                  selectedLead.raw_data.investment_recommendation === 'weak' && "bg-amber-50 border-amber-300"
                )}>
                  <p className="text-sm font-semibold">
                    Investment Recommendation: 
                    <span className="ml-2 capitalize">{selectedLead.raw_data.investment_recommendation}</span>
                  </p>
                </div>
              )}

              {/* New Investor Suggestions */}
              {selectedLead.raw_data?.new_investor_suggestions?.length > 0 && (
                <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg border-2 border-purple-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                    <h4 className="font-semibold text-purple-900">
                      AI-Discovered New Investors ({selectedLead.raw_data.new_investor_suggestions.length})
                    </h4>
                  </div>
                  <p className="text-xs text-purple-700 mb-4">
                    These firms are not in your database but are strong matches based on recent market activity
                  </p>
                  <div className="space-y-3">
                    {selectedLead.raw_data.new_investor_suggestions.map((suggestion, i) => (
                      <div key={i} className="p-3 bg-white rounded-lg border border-purple-200">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Building2 className="w-4 h-4 text-purple-600" />
                              <span className="font-semibold text-slate-900">{suggestion.firm_name}</span>
                              <Badge className="bg-purple-600 text-white text-xs">NEW</Badge>
                            </div>
                            {suggestion.website && (
                              <a
                                href={suggestion.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                              >
                                {suggestion.website} <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                            {suggestion.firm_type && (
                              <Badge variant="secondary" className="text-xs mt-1">
                                {suggestion.firm_type}
                              </Badge>
                            )}
                          </div>
                          <Badge className="bg-purple-100 text-purple-800">
                            {suggestion.match_score}% match
                          </Badge>
                        </div>

                        {suggestion.match_reasons?.length > 0 && (
                          <div className="mb-2">
                            <p className="text-xs font-medium text-slate-700 mb-1">Why they're a match:</p>
                            <div className="space-y-1">
                              {suggestion.match_reasons.map((reason, j) => (
                                <p key={j} className="text-xs text-slate-600 flex items-start gap-2">
                                  <span className="text-purple-600 mt-0.5">✓</span>
                                  {reason}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {suggestion.recent_investments?.length > 0 && (
                          <div className="mb-2 p-2 bg-purple-50 rounded">
                            <p className="text-xs font-medium text-purple-700 mb-1">Recent Investments:</p>
                            <div className="flex flex-wrap gap-1">
                              {suggestion.recent_investments.slice(0, 3).map((inv, j) => (
                                <Badge key={j} variant="outline" className="text-xs">
                                  {inv}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {suggestion.check_size_range && (
                          <p className="text-xs text-slate-600">
                            <span className="font-medium">Check Size:</span> {suggestion.check_size_range}
                          </p>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full mt-3 border-purple-300 text-purple-700 hover:bg-purple-50"
                          onClick={async () => {
                            try {
                              const newFirm = await base44.entities.InvestorFirm.create({
                                company_name: suggestion.firm_name,
                                website: suggestion.website,
                                firm_type: suggestion.firm_type,
                                enrichment_status: 'pending',
                                tags: ['AI-Discovered', selectedLead.industry?.[0]].filter(Boolean)
                              });
                              toast.success(`${suggestion.firm_name} added to your database`);
                              queryClient.invalidateQueries(['firms']);
                            } catch (error) {
                              toast.error('Failed to add firm');
                            }
                          }}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Add to Database
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Matched Firms from Database */}
              {selectedLead.matched_firms?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-3">
                    Matched Firms (From Your Database)
                  </p>
                  <div className="space-y-3">
                    {selectedLead.matched_firms.map((match, i) => (
                      <div key={i} className="p-3 border border-slate-200 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-slate-400" />
                            <span className="font-medium text-slate-900">{match.firm_name}</span>
                          </div>
                          <Badge className="bg-emerald-100 text-emerald-800">
                            {match.match_score}% match
                          </Badge>
                        </div>
                        <div className="space-y-1 mb-2">
                          {match.match_reasons?.map((reason, j) => (
                            <p key={j} className="text-xs text-slate-600 flex items-start gap-2">
                              <span className="text-emerald-600 mt-0.5">✓</span>
                              {reason}
                            </p>
                          ))}
                        </div>
                        {match.risk_factors?.length > 0 && (
                          <div className="mb-2 pb-2 border-t pt-2">
                            <p className="text-xs font-medium text-slate-600 mb-1">Risks:</p>
                            {match.risk_factors.map((risk, j) => (
                              <p key={j} className="text-xs text-amber-700 flex items-start gap-2">
                                <span className="mt-0.5">⚠</span>
                                {risk}
                              </p>
                            ))}
                          </div>
                        )}
                        <Button
                          size="sm"
                          onClick={() => handleConvertLead(match.firm_id)}
                          disabled={convertLeadMutation.isPending}
                          className="w-full mt-2"
                        >
                          {convertLeadMutation.isPending ? (
                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                          ) : (
                            <ArrowRight className="w-3 h-3 mr-2" />
                          )}
                          Create Deal with {match.firm_name}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handleDismissLead}
                  disabled={dismissLeadMutation.isPending}
                >
                  <X className="w-4 h-4 mr-2" />
                  Dismiss Lead
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowReviewDialog(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}