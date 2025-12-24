import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Sparkles, Loader2, Mail, Calendar, Clock, TrendingUp,
  CheckCircle, ArrowRight, Copy, RefreshCw
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function OutreachSuggestions({ startup, investor, contact, pastOutreaches, onApplyTemplate }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState(null);

  const generateSuggestions = async () => {
    setIsGenerating(true);

    try {
      // Analyze past successful interactions
      const successfulOutreaches = pastOutreaches?.filter(o => 
        o.replied_at || o.stage === 'call_scheduled' || o.stage === 'funded'
      ) || [];

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate personalized outreach strategy for this investor-startup pair.

STARTUP:
Name: ${startup.company_name}
Industry: ${startup.industry?.join(', ')}
Stage: ${startup.stage}
Problem: ${startup.problem}
Solution: ${startup.solution}
Traction: ${JSON.stringify(startup.traction_metrics)}

INVESTOR:
Firm: ${investor?.company_name}
Type: ${investor?.firm_type}
Focus: ${investor?.investment_focus?.join(', ')}
Thesis: ${investor?.investment_thesis}
Past Investments: ${investor?.portfolio_companies?.slice(0, 5).join(', ')}

CONTACT:
Name: ${contact?.full_name}
Title: ${contact?.title}

PAST SUCCESSFUL PATTERNS:
${JSON.stringify(successfulOutreaches.slice(0, 5).map(o => ({
  subject: o.email_subject,
  opened: !!o.opened_at,
  replied: !!o.replied_at
})))}

Generate:
1. 3 personalized email templates (cold intro, warm intro, follow-up)
2. Optimal send timing
3. Subject line variations
4. Key talking points
5. Follow-up schedule
6. Engagement predictions`,
        response_json_schema: {
          type: 'object',
          properties: {
            templates: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  subject: { type: 'string' },
                  body: { type: 'string' },
                  predicted_open_rate: { type: 'number' },
                  predicted_reply_rate: { type: 'number' }
                }
              }
            },
            optimal_timing: {
              type: 'object',
              properties: {
                best_day: { type: 'string' },
                best_time: { type: 'string' },
                timezone_note: { type: 'string' }
              }
            },
            subject_variations: { type: 'array', items: { type: 'string' } },
            talking_points: { type: 'array', items: { type: 'string' } },
            follow_up_schedule: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  days_after: { type: 'number' },
                  action: { type: 'string' },
                  template_type: { type: 'string' }
                }
              }
            },
            personalization_tips: { type: 'array', items: { type: 'string' } }
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

  const copyTemplate = (template) => {
    navigator.clipboard.writeText(`Subject: ${template.subject}\n\n${template.body}`);
    toast.success('Template copied to clipboard');
  };

  if (!suggestions) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            AI Outreach Strategy
          </CardTitle>
          <CardDescription>
            Get personalized email templates and optimal timing recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={generateSuggestions}
            disabled={isGenerating}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Strategy...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Outreach Strategy
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Optimal Timing */}
      <Card className="border-indigo-100">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            Optimal Send Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="font-medium">{suggestions.optimal_timing?.best_day}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="font-medium">{suggestions.optimal_timing?.best_time}</span>
            </div>
          </div>
          {suggestions.optimal_timing?.timezone_note && (
            <p className="text-xs text-slate-500 mt-2">{suggestions.optimal_timing.timezone_note}</p>
          )}
        </CardContent>
      </Card>

      {/* Email Templates */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-indigo-600" />
              Personalized Templates
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={generateSuggestions}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Regenerate
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {suggestions.templates?.map((template, i) => (
            <div key={i} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <Badge variant="secondary">{template.type}</Badge>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-500">
                    Open: <span className="font-medium text-emerald-600">{template.predicted_open_rate}%</span>
                  </span>
                  <span className="text-slate-500">
                    Reply: <span className="font-medium text-indigo-600">{template.predicted_reply_rate}%</span>
                  </span>
                </div>
              </div>
              
              <div className="mb-3">
                <p className="text-xs text-slate-500 mb-1">Subject</p>
                <p className="font-medium text-slate-900">{template.subject}</p>
              </div>
              
              <div className="mb-4">
                <p className="text-xs text-slate-500 mb-1">Body</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap line-clamp-4">{template.body}</p>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => copyTemplate(template)}
                >
                  <Copy className="w-4 h-4 mr-1" />
                  Copy
                </Button>
                {onApplyTemplate && (
                  <Button 
                    size="sm"
                    onClick={() => onApplyTemplate(template)}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    Use Template
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Subject Line Variations */}
      {suggestions.subject_variations?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Subject Line Variations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {suggestions.subject_variations.map((subject, i) => (
                <div 
                  key={i}
                  className="flex items-center justify-between p-2 bg-slate-50 rounded-lg"
                >
                  <span className="text-sm text-slate-700">{subject}</span>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      navigator.clipboard.writeText(subject);
                      toast.success('Copied');
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Follow-up Schedule */}
      {suggestions.follow_up_schedule?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              Recommended Follow-up Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {suggestions.follow_up_schedule.map((step, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-20 flex-shrink-0">
                    <Badge variant="outline">Day {step.days_after}</Badge>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{step.action}</p>
                    <p className="text-xs text-slate-500">{step.template_type}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Talking Points */}
      {suggestions.talking_points?.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Key Talking Points</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {suggestions.talking_points.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}