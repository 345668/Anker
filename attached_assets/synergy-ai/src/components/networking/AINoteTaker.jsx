import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Mic, Loader2, FileText, Download, Sparkles, AlertCircle,
  CheckCircle, Upload
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function AINoteTaker() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcriptFile, setTranscriptFile] = useState(null);
  const [notes, setNotes] = useState(null);

  const processTranscript = async (file) => {
    setIsProcessing(true);
    try {
      // Upload transcript file
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      // Process with AI
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an expert AI note taker for investor meetings. Analyze this meeting transcript and extract key information.

Provide:
1. Executive Summary (2-3 sentences)
2. Key Discussion Points
3. Investor Questions & Concerns
4. Investor Feedback (positive/negative)
5. Action Items with owners and deadlines
6. Next Steps
7. Deal Temperature (hot/warm/cold)
8. Red Flags (if any)
9. Opportunities identified

Be specific and actionable.`,
        file_urls: [file_url],
        response_json_schema: {
          type: 'object',
          properties: {
            executive_summary: { type: 'string' },
            key_points: { type: 'array', items: { type: 'string' } },
            investor_questions: { type: 'array', items: { type: 'string' } },
            investor_feedback: {
              type: 'object',
              properties: {
                positive: { type: 'array', items: { type: 'string' } },
                concerns: { type: 'array', items: { type: 'string' } }
              }
            },
            action_items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  task: { type: 'string' },
                  owner: { type: 'string' },
                  deadline: { type: 'string' },
                  priority: { type: 'string', enum: ['high', 'medium', 'low'] }
                }
              }
            },
            next_steps: { type: 'array', items: { type: 'string' } },
            deal_temperature: { type: 'string', enum: ['hot', 'warm', 'cold'] },
            red_flags: { type: 'array', items: { type: 'string' } },
            opportunities: { type: 'array', items: { type: 'string' } },
            sentiment_score: { type: 'number' },
            follow_up_recommendations: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      setNotes(result);
      toast.success('Meeting notes generated!');
    } catch (error) {
      console.error('Error processing transcript:', error);
      toast.error('Failed to process transcript');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTranscriptFile(file);
    processTranscript(file);
  };

  const downloadNotes = () => {
    if (!notes) return;
    
    const content = `
MEETING NOTES - AI GENERATED
===========================

EXECUTIVE SUMMARY
${notes.executive_summary}

KEY DISCUSSION POINTS
${notes.key_points?.map((p, i) => `${i + 1}. ${p}`).join('\n')}

INVESTOR QUESTIONS
${notes.investor_questions?.map((q, i) => `${i + 1}. ${q}`).join('\n')}

INVESTOR FEEDBACK
Positive:
${notes.investor_feedback?.positive?.map(p => `• ${p}`).join('\n')}

Concerns:
${notes.investor_feedback?.concerns?.map(c => `• ${c}`).join('\n')}

ACTION ITEMS
${notes.action_items?.map((a, i) => `${i + 1}. ${a.task} (Owner: ${a.owner}, Deadline: ${a.deadline}, Priority: ${a.priority})`).join('\n')}

NEXT STEPS
${notes.next_steps?.map((s, i) => `${i + 1}. ${s}`).join('\n')}

DEAL TEMPERATURE: ${notes.deal_temperature?.toUpperCase()}
SENTIMENT SCORE: ${notes.sentiment_score}/100

${notes.red_flags?.length > 0 ? `RED FLAGS\n${notes.red_flags.map(r => `⚠️ ${r}`).join('\n')}` : ''}

${notes.opportunities?.length > 0 ? `OPPORTUNITIES\n${notes.opportunities.map(o => `💡 ${o}`).join('\n')}` : ''}

FOLLOW-UP RECOMMENDATIONS
${notes.follow_up_recommendations?.map((r, i) => `${i + 1}. ${r}`).join('\n')}
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-notes-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const temperatureConfig = {
    hot: { color: 'bg-red-100 text-red-700', icon: '🔥' },
    warm: { color: 'bg-orange-100 text-orange-700', icon: '☀️' },
    cold: { color: 'bg-blue-100 text-blue-700', icon: '❄️' },
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mic className="w-5 h-5 text-indigo-600" />
            AI Meeting Note Taker
          </CardTitle>
          <CardDescription>
            Upload Zoom/Google Meet transcripts for AI-powered meeting analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-indigo-300 transition-colors">
              <label htmlFor="transcript-upload" className="cursor-pointer">
                <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                <p className="text-sm text-slate-600 mb-1">
                  {transcriptFile ? transcriptFile.name : 'Upload meeting transcript'}
                </p>
                <p className="text-xs text-slate-500">
                  Supports .txt, .vtt, .srt files from Zoom or Google Meet
                </p>
                <input
                  id="transcript-upload"
                  type="file"
                  accept=".txt,.vtt,.srt"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isProcessing}
                />
              </label>
            </div>

            {isProcessing && (
              <div className="flex items-center justify-center gap-2 p-4 bg-indigo-50 rounded-lg">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                <span className="text-sm text-indigo-700">
                  Processing transcript with AI...
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {notes && (
        <div className="space-y-4">
          {/* Header */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Badge className={temperatureConfig[notes.deal_temperature]?.color || 'bg-slate-100'}>
                    {temperatureConfig[notes.deal_temperature]?.icon} {notes.deal_temperature?.toUpperCase()}
                  </Badge>
                  <div>
                    <p className="text-sm text-slate-500">Sentiment Score</p>
                    <p className="text-2xl font-bold text-slate-900">{notes.sentiment_score}/100</p>
                  </div>
                </div>
                <Button onClick={downloadNotes}>
                  <Download className="w-4 h-4 mr-2" />
                  Download Notes
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Executive Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700">{notes.executive_summary}</p>
            </CardContent>
          </Card>

          {/* Key Points & Questions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Key Discussion Points</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {notes.key_points?.map((point, i) => (
                    <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      {point}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Investor Questions</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {notes.investor_questions?.map((q, i) => (
                    <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                      <span className="text-indigo-500 font-bold">Q:</span>
                      {q}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Feedback */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-emerald-200 bg-emerald-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-emerald-900">Positive Feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {notes.investor_feedback?.positive?.map((p, i) => (
                    <li key={i} className="text-sm text-emerald-700">✓ {p}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-amber-900">Concerns</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {notes.investor_feedback?.concerns?.map((c, i) => (
                    <li key={i} className="text-sm text-amber-700">⚠️ {c}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Action Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Action Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {notes.action_items?.map((item, i) => (
                  <div key={i} className="p-3 border rounded-lg">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">{item.task}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Owner: {item.owner} • Due: {item.deadline}
                        </p>
                      </div>
                      <Badge className={
                        item.priority === 'high' ? 'bg-red-100 text-red-700' :
                        item.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }>
                        {item.priority}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Red Flags */}
          {notes.red_flags?.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-red-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Red Flags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {notes.red_flags.map((flag, i) => (
                    <li key={i} className="text-sm text-red-700">🚩 {flag}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Follow-up */}
          <Card className="bg-gradient-to-br from-indigo-50 to-violet-50 border-indigo-200">
            <CardHeader>
              <CardTitle className="text-base text-indigo-900">Follow-up Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {notes.follow_up_recommendations?.map((rec, i) => (
                  <li key={i} className="text-sm text-indigo-700 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}