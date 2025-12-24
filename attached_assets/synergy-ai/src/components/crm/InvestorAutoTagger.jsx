import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Tags, Loader2, Sparkles, CheckCircle, Building2, RefreshCw
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

export default function InvestorAutoTagger({ firms, onTagsUpdated }) {
  const [isTagging, setIsTagging] = useState(false);
  const [progress, setProgress] = useState({ 
    current: 0, 
    total: 0, 
    currentBatch: 0, 
    totalBatches: 0 
  });
  const [results, setResults] = useState([]);

  const autoTagInvestors = async () => {
    setIsTagging(true);
    setResults([]);

    // Split into batches of 5
    const BATCH_SIZE = 5;
    const batches = [];
    for (let i = 0; i < firms.length; i += BATCH_SIZE) {
      batches.push(firms.slice(i, i + BATCH_SIZE));
    }

    const total = firms.length;
    const totalBatches = batches.length;
    setProgress({ current: 0, total, currentBatch: 0, totalBatches });

    const newResults = [];
    let processedCount = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      setProgress({ 
        current: processedCount, 
        total, 
        currentBatch: batchIndex + 1, 
        totalBatches 
      });

      const batchPromises = batch.map(async (firm) => {
      
      try {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `Analyze this investor firm and generate relevant, specific tags for categorization and matchmaking.

**FIRM DETAILS:**
Firm: ${firm.company_name}
Type: ${firm.firm_type || 'Unknown'}
Investment Focus: ${firm.investment_focus?.join(', ') || 'Not specified'}
Investment Stages: ${firm.investment_stages?.join(', ') || 'Not specified'}
Geographic Focus: ${firm.preferred_geography?.join(', ') || 'Not specified'}
Check Size: $${firm.check_size_min ? (firm.check_size_min / 1000000).toFixed(1) : '?'}M - $${firm.check_size_max ? (firm.check_size_max / 1000000).toFixed(1) : '?'}M
Investment Thesis: ${firm.investment_thesis || 'Not specified'}
Website: ${firm.website || 'N/A'}

**TAGGING INSTRUCTIONS:**
Generate 5-10 highly specific, actionable tags based on:

1. **Firm Type Tags** - Based on firm_type:
   - Example: "Venture Capital" → ["VC", "Early-Stage VC", "Series A Lead"]
   - Example: "Family Office" → ["Family Office", "Direct Investments", "Long-Term Capital"]
   
2. **Investment Focus Tags** - Based on investment_focus sectors:
   - Be SPECIFIC: "Enterprise SaaS", "AI Infrastructure", "Climate Tech", "Fintech B2B"
   - Include sub-sectors and niche areas
   
3. **Stage Tags** - Based on investment_stages:
   - Use exact stages: "Pre-Seed", "Seed", "Series A", "Series B", "Growth"
   - Add descriptors: "Pre-Product", "Post-Revenue", "Scaling Stage"
   
4. **Geographic Tags** - Based on geographic focus:
   - Specific regions: "US-Only", "Global", "Europe-Focused", "MENA", "Southeast Asia"
   
5. **Deal Characteristics**:
   - Based on check sizes: "Micro-VC" (<$500K), "Seed-Check" ($500K-$2M), "Large-Check" (>$5M)
   - Investment style: "Lead Investor", "Follow-On", "Syndicate-Friendly"

6. **Specialty Tags**:
   - "Technical Founders", "Repeat Founders", "Diverse Teams"
   - "Operator-Led", "Thesis-Driven", "Hands-On Support"

Return ONLY the most relevant, specific tags. No generic tags like "Technology" or "Investor".`,
          response_json_schema: {
            type: 'object',
            properties: {
              firm_type_tags: { type: 'array', items: { type: 'string' } },
              focus_tags: { type: 'array', items: { type: 'string' } },
              stage_tags: { type: 'array', items: { type: 'string' } },
              geographic_tags: { type: 'array', items: { type: 'string' } },
              deal_characteristic_tags: { type: 'array', items: { type: 'string' } },
              specialty_tags: { type: 'array', items: { type: 'string' } },
              all_tags: { type: 'array', items: { type: 'string' } }
            }
          }
        });

        if (result?.all_tags) {
          await base44.entities.InvestorFirm.update(firm.id, {
            tags: result.all_tags,
            enrichment_status: 'enriched',
            last_enriched: new Date().toISOString(),
          });

          newResults.push({
            firm: firm.company_name,
            tags: result.all_tags,
            categories: {
              firm_type: result.firm_type_tags || [],
              focus: result.focus_tags || [],
              stage: result.stage_tags || [],
              geographic: result.geographic_tags || [],
              deal: result.deal_characteristic_tags || [],
              specialty: result.specialty_tags || []
            },
            success: true,
            });
            } else {
            return {
            firm: firm.company_name,
            error: 'No tags returned',
            success: false,
            };
            }
            } catch (error) {
            return {
            firm: firm.company_name,
            error: error.message,
            success: false,
            };
            }
            });

            const batchResults = await Promise.all(batchPromises);
            newResults.push(...batchResults);
            processedCount += batch.length;

            setProgress({ 
            current: processedCount, 
            total, 
            currentBatch: batchIndex + 1, 
            totalBatches 
            });
            setResults([...newResults]);
            }

            setIsTagging(false);
            if (onTagsUpdated) onTagsUpdated();
            };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tags className="w-5 h-5 text-indigo-600" />
          AI Auto-Tagger
        </CardTitle>
        <CardDescription>
          Automatically categorize and tag investors based on their profiles
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isTagging && results.length === 0 && (
          <div className="text-center py-6">
            <p className="text-slate-500 mb-4">
              Run AI analysis on {firms.length} investors to generate smart tags
            </p>
            <Button 
              onClick={autoTagInvestors}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Start Auto-Tagging
            </Button>
          </div>
        )}

        {isTagging && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-slate-600">Processing batch {progress.currentBatch} of {progress.totalBatches}</span>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-sm font-medium">{progress.current} / {progress.total}</span>
                <span className="text-xs text-slate-500">Batch {progress.currentBatch}/{progress.totalBatches}</span>
              </div>
            </div>
            <Progress value={(progress.current / progress.total) * 100} className="h-2" />
            <p className="text-xs text-slate-500">Processing in batches of 5 for optimal performance...</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <span className="font-medium">
                  {results.filter(r => r.success).length} of {results.length} tagged
                </span>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={autoTagInvestors}
                disabled={isTagging}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Re-run
              </Button>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2">
              {results.slice(-10).map((result, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "p-3 rounded-lg",
                    result.success ? "bg-slate-50" : "bg-red-50"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    <span className="font-medium text-sm">{result.firm}</span>
                  </div>
                  {result.success ? (
                    <div className="space-y-2">
                      {result.categories && (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {result.categories.firm_type?.length > 0 && (
                            <div>
                              <span className="text-slate-500 font-medium">Type:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {result.categories.firm_type.map((tag, j) => (
                                  <Badge key={j} className="bg-indigo-100 text-indigo-800 text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {result.categories.focus?.length > 0 && (
                            <div>
                              <span className="text-slate-500 font-medium">Focus:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {result.categories.focus.map((tag, j) => (
                                  <Badge key={j} className="bg-emerald-100 text-emerald-800 text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {result.categories.stage?.length > 0 && (
                            <div>
                              <span className="text-slate-500 font-medium">Stage:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {result.categories.stage.map((tag, j) => (
                                  <Badge key={j} className="bg-blue-100 text-blue-800 text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {result.categories.specialty?.length > 0 && (
                            <div>
                              <span className="text-slate-500 font-medium">Specialty:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {result.categories.specialty.map((tag, j) => (
                                  <Badge key={j} className="bg-purple-100 text-purple-800 text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1 pt-2 border-t">
                        <span className="text-xs text-slate-500 font-medium mr-2">All Tags:</span>
                        {result.tags.slice(0, 6).map((tag, j) => (
                          <Badge key={j} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {result.tags.length > 6 && (
                          <Badge variant="outline" className="text-xs">
                            +{result.tags.length - 6} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-red-600">{result.error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}