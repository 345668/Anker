import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, Mail, ThumbsUp, ThumbsDown, Copy, Send, MessageSquare, AlertCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";

export default function AIResponseAssistant({ outreach, contact, firm, investorReply, interactions = [] }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [selectedDraft, setSelectedDraft] = useState(0);

  const generateResponse = async () => {
    setIsGenerating(true);

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an expert startup advisor helping craft personalized investor responses.

CONTEXT:
Contact: ${contact?.full_name}, ${contact?.title} at ${firm?.company_name}
Firm Type: ${firm?.firm_type}
Investment Focus: ${firm?.investment_focus?.join(', ')}
Investment Stages: ${firm?.investment_stages?.join(', ')}

OUTREACH HISTORY:
- Initial email sent: ${outreach.sent_at}
- Subject: ${outreach.email_subject}
- Body: ${outreach.email_body}
- Opened: ${outreach.open_count || 0} times
- Stage: ${outreach.stage}

INVESTOR REPLY:
${investorReply || 'No reply yet - analyzing engagement patterns'}

PAST INTERACTIONS:
${interactions.map(i => `${i.type}: ${i.content || i.subject}`).join('\n')}

SENTIMENT ANALYSIS:
${JSON.stringify(outreach.sentiment_analysis || {}, null, 2)}

TASK:
1. Analyze the investor's sentiment and intent
2. Identify key points they care about
3. Draft 3 different response options (enthusiastic, professional, concise)
4. Suggest optimal follow-up actions
5. Highlight any red flags or opportunities

Be specific, reference their firm's focus, and personalize based on their communication style.
Use real web research about ${firm?.company_name} to add relevant context.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            sentiment: {
              type: 'object',
              properties: {
                overall: { type: 'string', enum: ['very_positive', 'positive', 'neutral', 'negative', 'very_negative'] },
                confidence: { type: 'number' },
                tone: { type: 'string' },
                urgency_level: { type: 'string', enum: ['high', 'medium', 'low'] }
              }
            },
            key_points: {
              type: 'array',
              items: { type: 'string' }
            },
            investor_interests: {
              type: 'array',
              items: { type: 'string' }
            },
            red_flags: {
              type: 'array',
              items: { type: 'string' }
            },
            opportunities: {
              type: 'array',
              items: { type: 'string' }
            },
            response_drafts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tone: { type: 'string' },
                  subject: { type: 'string' },
                  body: { type: 'string' },
                  rationale: { type: 'string' }
                }
              }
            },
            recommended_actions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  action: { type: 'string' },
                  priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                  timing: { type: 'string' },
                  rationale: { type: 'string' }
                }
              }
            },
            summary: { type: 'string' },
            next_best_step: { type: 'string' }
          }
        }
      });

      setAnalysis(result);
    } catch (error) {
      console.error('Response generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const sentimentConfig = {
    very_positive: { label: 'Very Positive', color: 'bg-emerald-100 text-emerald-700', icon: ThumbsUp },
    positive: { label: 'Positive', color: 'bg-green-100 text-green-700', icon: ThumbsUp },
    neutral: { label: 'Neutral', color: 'bg-slate-100 text-slate-700', icon: MessageSquare },
    negative: { label: 'Negative', color: 'bg-orange-100 text-orange-700', icon: ThumbsDown },
    very_negative: { label: 'Very Negative', color: 'bg-red-100 text-red-700', icon: ThumbsDown }
  };

  if (!analysis) {
    return (
      <Card className="border-indigo-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            AI Response Assistant
          </CardTitle>
          <CardDescription>
            Get AI-powered response drafts, sentiment analysis, and follow-up suggestions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={generateResponse}
            disabled={isGenerating}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing & Drafting...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate AI Response
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const sentConfig = sentimentConfig[analysis.sentiment?.overall] || sentimentConfig.neutral;
  const SentIcon = sentConfig.icon;

  return (
    <div className="space-y-6">
      {/* Sentiment & Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Interaction Analysis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge className={cn("text-sm", sentConfig.color)}>
                <SentIcon className="w-3.5 h-3.5 mr-1.5" />
                {sentConfig.label}
              </Badge>
              <span className="text-xs text-slate-500">
                {analysis.sentiment?.confidence}% confidence
              </span>
              {analysis.sentiment?.urgency_level === 'high' && (
                <Badge variant="destructive" className="text-xs">Urgent</Badge>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={generateResponse}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-700">{analysis.summary}</p>
          </div>

          {analysis.sentiment?.tone && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Tone:</span>
              <Badge variant="outline" className="text-xs">{analysis.sentiment.tone}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Key Insights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {analysis.key_points?.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-blue-700">
                <MessageSquare className="w-4 h-4" />
                Key Points
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {analysis.key_points.map((point, i) => (
                  <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    {point}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {analysis.opportunities?.length > 0 && (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-emerald-700">
                <ThumbsUp className="w-4 h-4" />
                Opportunities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {analysis.opportunities.map((opp, i) => (
                  <li key={i} className="text-xs text-emerald-700 flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5">✓</span>
                    {opp}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {analysis.red_flags?.length > 0 && (
          <Card className="border-red-200 bg-red-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                <AlertCircle className="w-4 h-4" />
                Red Flags
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {analysis.red_flags.map((flag, i) => (
                  <li key={i} className="text-xs text-red-700 flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">!</span>
                    {flag}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Response Drafts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Response Drafts</CardTitle>
          <CardDescription>AI-generated responses tailored to the investor's tone</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedDraft.toString()} onValueChange={(v) => setSelectedDraft(parseInt(v))}>
            <TabsList className="grid w-full grid-cols-3">
              {analysis.response_drafts?.map((draft, i) => (
                <TabsTrigger key={i} value={i.toString()} className="text-xs">
                  {draft.tone}
                </TabsTrigger>
              ))}
            </TabsList>
            {analysis.response_drafts?.map((draft, i) => (
              <TabsContent key={i} value={i.toString()} className="space-y-3">
                <div className="p-3 bg-indigo-50 rounded-lg">
                  <p className="text-xs text-indigo-700 mb-1 font-medium">Why this approach:</p>
                  <p className="text-xs text-indigo-600">{draft.rationale}</p>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-slate-500">Subject</label>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => copyToClipboard(draft.subject)}
                      className="h-7 text-xs"
                    >
                      <Copy className="w-3 h-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border text-sm text-slate-900">
                    {draft.subject}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-slate-500">Email Body</label>
                    <div className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => copyToClipboard(draft.body)}
                        className="h-7 text-xs"
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copy
                      </Button>
                      <Button 
                        size="sm" 
                        className="h-7 bg-indigo-600 hover:bg-indigo-700 text-xs"
                      >
                        <Send className="w-3 h-3 mr-1" />
                        Use This
                      </Button>
                    </div>
                  </div>
                  <Textarea 
                    value={draft.body}
                    readOnly
                    className="min-h-[200px] text-sm font-mono"
                  />
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Recommended Actions */}
      <Card className="bg-gradient-to-br from-violet-50 to-indigo-50 border-indigo-200">
        <CardHeader>
          <CardTitle className="text-base text-indigo-900">Recommended Next Steps</CardTitle>
          <p className="text-sm text-indigo-700 font-medium mt-2">{analysis.next_best_step}</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {analysis.recommended_actions?.map((action, i) => {
              const priorityColors = {
                high: 'bg-red-100 text-red-700',
                medium: 'bg-amber-100 text-amber-700',
                low: 'bg-blue-100 text-blue-700'
              };
              return (
                <div key={i} className="p-3 bg-white rounded-lg border border-indigo-100">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-xs", priorityColors[action.priority])}>
                        {action.priority} priority
                      </Badge>
                      <span className="text-xs text-slate-500">{action.timing}</span>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-slate-900 mb-1">{action.action}</p>
                  <p className="text-xs text-slate-600">{action.rationale}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}