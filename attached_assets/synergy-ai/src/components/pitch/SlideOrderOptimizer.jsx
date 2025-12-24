import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ArrowUpDown, Loader2, CheckCircle, MoveVertical } from 'lucide-react';
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

export default function SlideOrderOptimizer({ startup, analysis }) {
  const [optimizing, setOptimizing] = useState(false);
  const [optimizedOrder, setOptimizedOrder] = useState(null);

  const currentSections = analysis?.section_scores
    ?.filter(s => s.present)
    .map(s => s.section) || [];

  const optimizeSlideOrder = async () => {
    setOptimizing(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Optimize the slide order for maximum investor impact. Consider psychological flow, narrative arc, and investor expectations.

**STARTUP CONTEXT:**
Company: ${startup.company_name}
Stage: ${startup.stage}
Industry: ${startup.industry?.join(', ')}
Current Slides: ${currentSections.join(', ')}

**OPTIMIZATION CRITERIA:**
1. **Opening Hook** - Start with most compelling insight (problem/traction/vision)
2. **Logical Flow** - Each slide should naturally lead to the next
3. **Peak Placement** - Put strongest differentiator in prime position (slide 6-8)
4. **Investor Psychology** - Address concerns before they arise
5. **Strong Close** - End with momentum (ask, team, or traction)

**STANDARD BEST PRACTICES:**
- Lead with problem if it's urgent/massive
- Lead with traction if it's exceptional
- Team early if founders are rockstars
- Market size after problem validation
- Competition after solution showcase
- Financials near the end but before ask

**STAGE-SPECIFIC CONSIDERATIONS:**
- Pre-seed/Seed: Team + Vision + Early Traction
- Series A: Traction + Unit Economics + Scaling Plan
- Series B+: Metrics + Market Position + Execution

Provide optimized order with clear rationale for each placement decision.`,
        response_json_schema: {
          type: 'object',
          properties: {
            optimized_order: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  position: { type: 'number' },
                  section: { type: 'string' },
                  rationale: { type: 'string' },
                  timing_suggestion: { type: 'string' },
                  key_message: { type: 'string' }
                }
              }
            },
            narrative_flow: { type: 'string' },
            opening_strategy: { type: 'string' },
            closing_strategy: { type: 'string' },
            improvements: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      setOptimizedOrder(result);
    } catch (error) {
      console.error('Optimization error:', error);
    } finally {
      setOptimizing(false);
    }
  };

  const getCurrentPosition = (section) => {
    return currentSections.indexOf(section) + 1;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowUpDown className="w-5 h-5 text-purple-600" />
          AI Slide Order Optimizer
        </CardTitle>
        <CardDescription>
          Optimize your deck's flow for maximum investor impact
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!optimizedOrder ? (
          <Button 
            onClick={optimizeSlideOrder}
            disabled={optimizing || currentSections.length === 0}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            {optimizing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing optimal flow...
              </>
            ) : (
              <>
                <MoveVertical className="w-4 h-4 mr-2" />
                Optimize Slide Order
              </>
            )}
          </Button>
        ) : (
          <div className="space-y-6">
            {/* Strategy Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                <p className="text-xs font-medium text-emerald-700 mb-1">Opening Strategy</p>
                <p className="text-sm text-slate-700">{optimizedOrder.opening_strategy}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <p className="text-xs font-medium text-blue-700 mb-1">Closing Strategy</p>
                <p className="text-sm text-slate-700">{optimizedOrder.closing_strategy}</p>
              </div>
            </div>

            {/* Narrative Flow */}
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <p className="text-sm font-medium text-purple-900 mb-2">Narrative Flow</p>
              <p className="text-sm text-slate-700 leading-relaxed">{optimizedOrder.narrative_flow}</p>
            </div>

            {/* Optimized Order */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900 mb-3">Recommended Order:</p>
              {optimizedOrder.optimized_order?.map((slide, i) => {
                const currentPos = getCurrentPosition(slide.section);
                const moved = currentPos !== slide.position;
                
                return (
                  <div key={i} className={cn(
                    "p-4 rounded-lg border-2 transition-colors",
                    moved ? "bg-amber-50 border-amber-300" : "bg-slate-50 border-slate-200"
                  )}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Badge className={cn(
                          "text-lg font-bold w-8 h-8 flex items-center justify-center",
                          moved ? "bg-amber-600" : "bg-slate-600"
                        )}>
                          {slide.position}
                        </Badge>
                        <div>
                          <p className="font-semibold text-slate-900">{slide.section}</p>
                          {moved && (
                            <p className="text-xs text-amber-700">
                              Moved from position {currentPos}
                            </p>
                          )}
                        </div>
                      </div>
                      {!moved && <CheckCircle className="w-5 h-5 text-emerald-600" />}
                    </div>

                    <div className="space-y-2 mt-3 pl-11">
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase">Why here?</p>
                        <p className="text-sm text-slate-700">{slide.rationale}</p>
                      </div>

                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase">Key Message</p>
                        <p className="text-sm text-indigo-700 font-medium">{slide.key_message}</p>
                      </div>

                      {slide.timing_suggestion && (
                        <div className="bg-white rounded p-2 border border-slate-200">
                          <p className="text-xs font-medium text-slate-500">Timing: {slide.timing_suggestion}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Key Improvements */}
            {optimizedOrder.improvements?.length > 0 && (
              <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
                <p className="text-sm font-medium text-indigo-900 mb-2">Key Improvements:</p>
                <ul className="space-y-1">
                  {optimizedOrder.improvements.map((improvement, i) => (
                    <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                      <span className="text-indigo-600 mt-1">✓</span>
                      <span>{improvement}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button 
              variant="outline" 
              size="sm"
              onClick={optimizeSlideOrder}
              disabled={optimizing}
              className="w-full"
            >
              Re-optimize
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}