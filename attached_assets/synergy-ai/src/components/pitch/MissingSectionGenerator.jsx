import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, Plus, Copy } from 'lucide-react';
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";

export default function MissingSectionGenerator({ startup, analysis }) {
  const [generating, setGenerating] = useState(false);
  const [generatedSections, setGeneratedSections] = useState(null);

  const missingSections = analysis?.section_scores
    ?.filter(s => !s.present || s.score < 50)
    .map(s => s.section) || [];

  const generateMissingSections = async () => {
    setGenerating(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate comprehensive content for missing pitch deck sections. Use the startup's existing data to create compelling, investor-ready content.

**STARTUP INFORMATION:**
Company: ${startup.company_name}
Industry: ${startup.industry?.join(', ') || 'Not specified'}
Stage: ${startup.stage}
Problem: ${startup.problem || 'Not specified'}
Solution: ${startup.solution || 'Not specified'}
Business Model: ${startup.business_model || 'Not specified'}
Traction: ${JSON.stringify(startup.traction_metrics) || 'Not specified'}
Team: ${startup.team_bios?.map(t => `${t.name} - ${t.role}`).join(', ') || 'Not specified'}

**MISSING/WEAK SECTIONS TO GENERATE:**
${missingSections.join(', ')}

For each missing section, generate:
1. **Headline** - Punchy, memorable title (5-10 words)
2. **Key Points** - 3-5 bullet points with specific data/facts
3. **Narrative** - 2-3 sentences connecting to investor value
4. **Visual Suggestion** - What chart/image would work best

**CONTENT GUIDELINES:**
- Use specific numbers and metrics where possible
- Address investor concerns directly
- Create FOMO (fear of missing out) where appropriate
- Be concise but compelling
- Focus on traction, market size, and competitive advantages

Generate professional, investor-grade content that tells a cohesive story.`,
        response_json_schema: {
          type: 'object',
          properties: {
            sections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  section_name: { type: 'string' },
                  headline: { type: 'string' },
                  key_points: { type: 'array', items: { type: 'string' } },
                  narrative: { type: 'string' },
                  visual_suggestion: { type: 'string' },
                  talking_points: { type: 'array', items: { type: 'string' } },
                  data_needed: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          }
        }
      });

      setGeneratedSections(result);
      toast.success('Content generated for missing sections!');
    } catch (error) {
      console.error('Generation error:', error);
      toast.error('Failed to generate sections');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  if (missingSections.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="py-6 text-center">
          <p className="text-emerald-800 font-medium">✓ All sections present and strong!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          AI Section Generator
        </CardTitle>
        <CardDescription>
          Generate professional content for {missingSections.length} missing/weak sections
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <p className="text-sm text-slate-600 mb-2">Sections to generate:</p>
          <div className="flex flex-wrap gap-2">
            {missingSections.map((section, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {section}
              </Badge>
            ))}
          </div>
        </div>

        {!generatedSections ? (
          <Button 
            onClick={generateMissingSections}
            disabled={generating}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating content...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Generate Missing Sections
              </>
            )}
          </Button>
        ) : (
          <div className="space-y-4">
            <Accordion type="multiple" className="w-full">
              {generatedSections.sections?.map((section, i) => (
                <AccordionItem key={i} value={`section-${i}`}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-indigo-100 text-indigo-700">
                        {section.section_name}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      {/* Headline */}
                      <div className="bg-slate-50 rounded-lg p-3">
                        <div className="flex items-start justify-between mb-1">
                          <p className="text-xs font-medium text-slate-500 uppercase">Headline</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(section.headline)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                        <p className="text-lg font-bold text-slate-900">{section.headline}</p>
                      </div>

                      {/* Key Points */}
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase mb-2">Key Points</p>
                        <ul className="space-y-2">
                          {section.key_points?.map((point, j) => (
                            <li key={j} className="flex items-start gap-2 text-sm text-slate-700">
                              <span className="text-indigo-600 mt-1">•</span>
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Narrative */}
                      <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200">
                        <p className="text-xs font-medium text-indigo-700 uppercase mb-2">Narrative</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{section.narrative}</p>
                      </div>

                      {/* Visual Suggestion */}
                      <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                        <p className="text-xs font-medium text-amber-700 uppercase mb-2">Visual Suggestion</p>
                        <p className="text-sm text-slate-700">{section.visual_suggestion}</p>
                      </div>

                      {/* Talking Points */}
                      {section.talking_points?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase mb-2">Talking Points</p>
                          <ul className="space-y-1">
                            {section.talking_points.map((point, j) => (
                              <li key={j} className="text-xs text-slate-600 pl-4">→ {point}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Data Needed */}
                      {section.data_needed?.length > 0 && (
                        <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                          <p className="text-xs font-medium text-red-700 uppercase mb-2">Additional Data Needed</p>
                          <ul className="space-y-1">
                            {section.data_needed.map((data, j) => (
                              <li key={j} className="text-xs text-red-700">• {data}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            <Button 
              variant="outline" 
              size="sm"
              onClick={generateMissingSections}
              disabled={generating}
              className="w-full"
            >
              Regenerate Content
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}