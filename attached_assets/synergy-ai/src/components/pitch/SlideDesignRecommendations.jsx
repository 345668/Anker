import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Palette, Loader2, Eye, Lightbulb } from 'lucide-react';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export default function SlideDesignRecommendations({ startup, analysis }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [recommendations, setRecommendations] = useState(null);

  const analyzeDesign = async () => {
    setAnalyzing(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Provide professional design recommendations to enhance pitch deck visual appeal and clarity. Focus on layout, typography, color, data visualization, and visual hierarchy.

**STARTUP CONTEXT:**
Company: ${startup.company_name}
Industry: ${startup.industry?.join(', ')}
Stage: ${startup.stage}
Sections: ${analysis?.section_scores?.filter(s => s.present).map(s => s.section).join(', ')}

**DESIGN AUDIT AREAS:**
1. **Visual Hierarchy** - Information prioritization and flow
2. **Typography** - Font choices, sizes, readability
3. **Color Palette** - Brand consistency, emotional impact
4. **Data Visualization** - Chart types, clarity, impact
5. **White Space** - Balance, breathing room, focus
6. **Imagery** - Quality, relevance, message reinforcement
7. **Consistency** - Template uniformity, style guide adherence

**PROVIDE SPECIFIC RECOMMENDATIONS FOR:**

**Overall Deck Design:**
- Color scheme suggestions (3-4 colors max)
- Typography hierarchy (heading, body, accent fonts)
- Slide template consistency
- Brand personality alignment

**Section-Specific Design:**
For each major section, suggest:
- Optimal layout (e.g., split screen, full bleed, grid)
- Chart/visual types (bar, line, pie, infographic)
- Text density (words per slide)
- Visual metaphors or icons

**Common Design Pitfalls to Avoid:**
- Text-heavy slides
- Poor contrast
- Inconsistent styling
- Cluttered layouts
- Low-quality images

**Industry-Specific Considerations:**
Tailor design recommendations to the startup's industry and stage.`,
        response_json_schema: {
          type: 'object',
          properties: {
            overall_design: {
              type: 'object',
              properties: {
                color_palette: {
                  type: 'object',
                  properties: {
                    primary: { type: 'string' },
                    secondary: { type: 'string' },
                    accent: { type: 'string' },
                    background: { type: 'string' },
                    rationale: { type: 'string' }
                  }
                },
                typography: {
                  type: 'object',
                  properties: {
                    heading_font: { type: 'string' },
                    body_font: { type: 'string' },
                    font_sizes: { type: 'string' },
                    recommendations: { type: 'array', items: { type: 'string' } }
                  }
                },
                layout_principles: { type: 'array', items: { type: 'string' } }
              }
            },
            section_designs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  section: { type: 'string' },
                  layout_type: { type: 'string' },
                  visual_elements: { type: 'array', items: { type: 'string' } },
                  chart_suggestions: { type: 'array', items: { type: 'string' } },
                  text_density: { type: 'string' },
                  design_tips: { type: 'array', items: { type: 'string' } }
                }
              }
            },
            pitfalls_to_avoid: { type: 'array', items: { type: 'string' } },
            quick_wins: { type: 'array', items: { type: 'string' } },
            advanced_techniques: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      setRecommendations(result);
    } catch (error) {
      console.error('Design analysis error:', error);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-pink-600" />
          AI Design Recommendations
        </CardTitle>
        <CardDescription>
          Professional design guidance to enhance visual appeal and clarity
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!recommendations ? (
          <Button 
            onClick={analyzeDesign}
            disabled={analyzing}
            className="w-full bg-pink-600 hover:bg-pink-700"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing design...
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 mr-2" />
                Get Design Recommendations
              </>
            )}
          </Button>
        ) : (
          <Tabs defaultValue="overall" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overall">Overall</TabsTrigger>
              <TabsTrigger value="sections">By Section</TabsTrigger>
              <TabsTrigger value="tips">Quick Tips</TabsTrigger>
            </TabsList>

            <TabsContent value="overall" className="space-y-4 mt-4">
              {/* Color Palette */}
              {recommendations.overall_design?.color_palette && (
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
                  <p className="text-sm font-medium text-purple-900 mb-3">Recommended Color Palette</p>
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <div>
                      <div 
                        className="h-16 rounded-lg border-2 border-white shadow-sm"
                        style={{ backgroundColor: recommendations.overall_design.color_palette.primary }}
                      />
                      <p className="text-xs text-center mt-1 text-slate-600">Primary</p>
                    </div>
                    <div>
                      <div 
                        className="h-16 rounded-lg border-2 border-white shadow-sm"
                        style={{ backgroundColor: recommendations.overall_design.color_palette.secondary }}
                      />
                      <p className="text-xs text-center mt-1 text-slate-600">Secondary</p>
                    </div>
                    <div>
                      <div 
                        className="h-16 rounded-lg border-2 border-white shadow-sm"
                        style={{ backgroundColor: recommendations.overall_design.color_palette.accent }}
                      />
                      <p className="text-xs text-center mt-1 text-slate-600">Accent</p>
                    </div>
                    <div>
                      <div 
                        className="h-16 rounded-lg border-2 border-slate-300 shadow-sm"
                        style={{ backgroundColor: recommendations.overall_design.color_palette.background }}
                      />
                      <p className="text-xs text-center mt-1 text-slate-600">Background</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700">{recommendations.overall_design.color_palette.rationale}</p>
                </div>
              )}

              {/* Typography */}
              {recommendations.overall_design?.typography && (
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="text-sm font-medium text-slate-900 mb-3">Typography Guidelines</p>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded p-3">
                        <p className="text-xs text-slate-500 mb-1">Heading Font</p>
                        <p className="font-semibold text-slate-900">{recommendations.overall_design.typography.heading_font}</p>
                      </div>
                      <div className="bg-white rounded p-3">
                        <p className="text-xs text-slate-500 mb-1">Body Font</p>
                        <p className="text-slate-900">{recommendations.overall_design.typography.body_font}</p>
                      </div>
                    </div>
                    <div className="bg-white rounded p-3">
                      <p className="text-xs text-slate-500 mb-1">Size Hierarchy</p>
                      <p className="text-sm text-slate-700">{recommendations.overall_design.typography.font_sizes}</p>
                    </div>
                    {recommendations.overall_design.typography.recommendations?.length > 0 && (
                      <ul className="space-y-1 mt-2">
                        {recommendations.overall_design.typography.recommendations.map((rec, i) => (
                          <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                            <span className="text-indigo-600">•</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {/* Layout Principles */}
              {recommendations.overall_design?.layout_principles?.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <p className="text-sm font-medium text-blue-900 mb-2">Layout Principles</p>
                  <ul className="space-y-2">
                    {recommendations.overall_design.layout_principles.map((principle, i) => (
                      <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                        <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        {principle}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </TabsContent>

            <TabsContent value="sections" className="space-y-3 mt-4">
              {recommendations.section_designs?.map((section, i) => (
                <div key={i} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className="bg-indigo-600">{section.section}</Badge>
                    <Badge variant="outline">{section.layout_type}</Badge>
                  </div>

                  <div className="space-y-3">
                    {section.visual_elements?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase mb-1">Visual Elements</p>
                        <div className="flex flex-wrap gap-1">
                          {section.visual_elements.map((element, j) => (
                            <Badge key={j} variant="secondary" className="text-xs">
                              {element}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {section.chart_suggestions?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase mb-1">Chart Suggestions</p>
                        <ul className="space-y-1">
                          {section.chart_suggestions.map((chart, j) => (
                            <li key={j} className="text-xs text-slate-600 pl-3">→ {chart}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="bg-white rounded p-2">
                      <p className="text-xs text-slate-500">Text Density: <span className="font-medium text-slate-900">{section.text_density}</span></p>
                    </div>

                    {section.design_tips?.length > 0 && (
                      <ul className="space-y-1">
                        {section.design_tips.map((tip, j) => (
                          <li key={j} className="text-xs text-slate-600 flex items-start gap-1">
                            <span className="text-pink-600">✓</span>
                            {tip}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="tips" className="space-y-4 mt-4">
              {/* Quick Wins */}
              {recommendations.quick_wins?.length > 0 && (
                <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                  <p className="text-sm font-medium text-emerald-900 mb-2 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" />
                    Quick Wins (Implement Today)
                  </p>
                  <ul className="space-y-2">
                    {recommendations.quick_wins.map((win, i) => (
                      <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">✓</span>
                        {win}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Pitfalls to Avoid */}
              {recommendations.pitfalls_to_avoid?.length > 0 && (
                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                  <p className="text-sm font-medium text-red-900 mb-2">Common Pitfalls to Avoid</p>
                  <ul className="space-y-1">
                    {recommendations.pitfalls_to_avoid.map((pitfall, i) => (
                      <li key={i} className="text-sm text-red-800 flex items-start gap-2">
                        <span>✗</span>
                        {pitfall}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Advanced Techniques */}
              {recommendations.advanced_techniques?.length > 0 && (
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <p className="text-sm font-medium text-purple-900 mb-2">Advanced Techniques</p>
                  <ul className="space-y-2">
                    {recommendations.advanced_techniques.map((technique, i) => (
                      <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                        <span className="text-purple-600">→</span>
                        {technique}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}