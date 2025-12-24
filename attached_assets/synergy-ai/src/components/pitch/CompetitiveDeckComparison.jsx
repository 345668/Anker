import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Upload, Loader2, CheckCircle, XCircle, TrendingUp, Target,
  AlertCircle, Lightbulb
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
import PitchDeckUploader from './PitchDeckUploader';
import { cn } from "@/lib/utils";

export default function CompetitiveDeckComparison({ yourDeckData }) {
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(false);
  const [competitiveDeckUrl, setCompetitiveDeckUrl] = useState('');

  const handleCompetitiveDeckUpload = (url) => {
    setCompetitiveDeckUrl(url);
  };

  const compareDecks = async () => {
    if (!competitiveDeckUrl) return;

    setLoading(true);
    try {
      // First extract data from competitive deck
      const competitiveAnalysis = await base44.integrations.Core.InvokeLLM({
        prompt: 'Extract key information from this pitch deck for comparison analysis.',
        file_urls: [competitiveDeckUrl],
        response_json_schema: {
          type: 'object',
          properties: {
            company_name: { type: 'string' },
            industry: { type: 'string' },
            problem: { type: 'string' },
            solution: { type: 'string' },
            market_size: { type: 'string' },
            business_model: { type: 'string' },
            traction: { type: 'string' },
            team: { type: 'string' },
            competitive_advantage: { type: 'string' },
            key_strengths: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      // Compare using Mistral
      const response = await base44.functions.invoke('mistralPitchAnalysis', {
        analysisType: 'competitive_comparison',
        deckData: yourDeckData,
        competitiveDeckData: competitiveAnalysis
      });

      if (response.data.success) {
        setComparison({
          ...response.data.analysis,
          competitive_company: competitiveAnalysis.company_name
        });
      }
    } catch (error) {
      console.error('Error comparing decks:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            Competitive Deck Comparison
          </CardTitle>
          <CardDescription>
            Upload a competitor's pitch deck to see how you compare
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <PitchDeckUploader
              onUploadComplete={handleCompetitiveDeckUpload}
              currentUrl={competitiveDeckUrl}
            />
            
            {competitiveDeckUrl && (
              <Button 
                onClick={compareDecks}
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Comparing with AI...
                  </>
                ) : (
                  <>
                    <Target className="w-4 h-4 mr-2" />
                    Compare Decks
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {comparison && (
        <>
          {/* Competitive Summary */}
          <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-indigo-900">
                Comparison Summary: You vs {comparison.competitive_company || 'Competitor'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700 leading-relaxed">
                {comparison.summary}
              </p>
            </CardContent>
          </Card>

          {/* What They Do Better */}
          {comparison.what_they_do_better?.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-red-800">
                  <AlertCircle className="w-5 h-5" />
                  What They Do Better
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {comparison.what_they_do_better.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-red-800">
                      <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* What You Do Better */}
          {comparison.what_you_do_better?.length > 0 && (
            <Card className="border-emerald-200 bg-emerald-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-emerald-800">
                  <CheckCircle className="w-5 h-5" />
                  What You Do Better
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {comparison.what_you_do_better.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-emerald-800">
                      <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Key Differentiators */}
          {comparison.key_differentiators?.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="w-5 h-5 text-purple-600" />
                  Your Key Differentiators
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {comparison.key_differentiators.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <TrendingUp className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Areas to Improve */}
          {comparison.areas_to_improve?.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                  <Lightbulb className="w-5 h-5" />
                  Areas to Improve Based on Their Approach
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {comparison.areas_to_improve.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                      <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Competitive Positioning Insights */}
          {comparison.competitive_positioning_insights && (
            <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-blue-900">
                  Competitive Positioning Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {comparison.competitive_positioning_insights}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Relative Strengths & Weaknesses */}
          {comparison.relative_strengths_weaknesses && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Detailed Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {comparison.relative_strengths_weaknesses.map((category, i) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-sm font-medium text-slate-900 mb-2">{category.category}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-emerald-700 font-medium mb-1">Your Approach</p>
                          <p className="text-xs text-slate-600">{category.your_approach}</p>
                        </div>
                        <div>
                          <p className="text-xs text-red-700 font-medium mb-1">Their Approach</p>
                          <p className="text-xs text-slate-600">{category.their_approach}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}