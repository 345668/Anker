import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, Calendar, Mail, CheckCircle } from 'lucide-react';
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

export default function FollowUpSequencer({ outreach, contact, firm, onSequenceGenerated }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [sequence, setSequence] = useState(null);

  const generateSequence = async () => {
    setIsGenerating(true);

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate an intelligent follow-up email sequence based on this outreach data.

OUTREACH DETAILS:
- Contact: ${contact?.full_name} at ${firm?.company_name}
- Initial email sent: ${outreach.sent_at}
- Opened: ${outreach.opened_at ? 'Yes' : 'No'}
- Clicked: ${outreach.clicked_at ? 'Yes' : 'No'}  
- Replied: ${outreach.replied_at ? 'Yes' : 'No'}
- Open count: ${outreach.open_count || 0}
- Current stage: ${outreach.stage}

SENTIMENT ANALYSIS:
${JSON.stringify(outreach.sentiment_analysis || 'No sentiment data')}

ENGAGEMENT PATTERN:
- If opened but no reply: They're interested but need a nudge
- If not opened: Need attention-grabbing subject line
- If clicked but no reply: Very interested, need clear CTA
- If replied: Focus on next steps

Generate a sequence of 3-5 follow-up emails with:
1. Appropriate timing (days after previous email)
2. Subject lines tailored to engagement level
3. Email content that builds on previous interaction
4. Different approach for each follow-up (value-add, urgency, social proof, etc.)
5. Sentiment-based tone adjustment`,
        response_json_schema: {
          type: 'object',
          properties: {
            sequence_name: { type: 'string' },
            recommendation: { type: 'string' },
            followups: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  step: { type: 'number' },
                  days_after_previous: { type: 'number' },
                  subject: { type: 'string' },
                  body: { type: 'string' },
                  strategy: { type: 'string' },
                  expected_response_rate: { type: 'number' }
                }
              }
            }
          }
        }
      });

      setSequence(result);
      if (onSequenceGenerated) {
        onSequenceGenerated(result);
      }
    } catch (error) {
      console.error('Sequence generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!sequence) {
    return (
      <Card className="border-indigo-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            AI Follow-Up Sequence
          </CardTitle>
          <CardDescription>
            Generate intelligent follow-up emails based on engagement patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={generateSequence}
            disabled={isGenerating}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
            size="sm"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Sequence...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Follow-Ups
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            {sequence.sequence_name}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={generateSequence}>
            Regenerate
          </Button>
        </div>
        <CardDescription>{sequence.recommendation}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sequence.followups?.map((followup, i) => (
          <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Step {followup.step}</Badge>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <Calendar className="w-3 h-3" />
                  Wait {followup.days_after_previous} days
                </div>
              </div>
              <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                {followup.expected_response_rate}% response rate
              </Badge>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Subject</p>
                <p className="text-sm font-medium text-slate-900">{followup.subject}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Strategy</p>
                <p className="text-xs text-slate-600">{followup.strategy}</p>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-indigo-600 font-medium">View email body</summary>
                <div className="mt-2 p-2 bg-white rounded border text-slate-700 whitespace-pre-wrap">
                  {followup.body}
                </div>
              </details>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}