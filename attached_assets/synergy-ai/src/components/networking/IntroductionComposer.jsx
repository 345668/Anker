import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Send, Loader2, Copy, Sparkles, MessageSquare, CheckCircle
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function IntroductionComposer({ startups, matches, firms, contacts }) {
  const [selectedStartup, setSelectedStartup] = useState('');
  const [selectedMatch, setSelectedMatch] = useState('');
  const [draftStyle, setDraftStyle] = useState('professional');
  const [drafts, setDrafts] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const queryClient = useQueryClient();

  const createOutreachMutation = useMutation({
    mutationFn: (data) => base44.entities.Outreach.create(data),
    onSuccess: () => queryClient.invalidateQueries(['outreaches']),
  });

  const generateDrafts = async () => {
    if (!selectedStartup || !selectedMatch) return;
    setIsGenerating(true);

    try {
      const startup = startups.find(s => s.id === selectedStartup);
      const match = matches.find(m => m.id === selectedMatch);
      const firm = firms.find(f => f.id === match.firm_id);
      const contact = contacts.find(c => c.id === match.contact_id);

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an expert at crafting compelling investor introduction emails. Create 3 personalized introduction drafts in different styles.

STARTUP:
Name: ${startup.company_name}
Industry: ${startup.industry?.join(', ')}
Stage: ${startup.stage}
Problem: ${startup.problem}
Solution: ${startup.solution}
One-liner: ${startup.one_liner}
Traction: ${JSON.stringify(startup.traction_metrics || {})}

INVESTOR:
Name: ${contact?.full_name}
Firm: ${firm?.company_name}
Type: ${firm?.firm_type}
Focus: ${firm?.investment_focus?.join(', ')}
Stages: ${firm?.investment_stages?.join(', ')}

MATCH REASONS:
${match.match_reasons?.join('\n- ')}

REQUIREMENTS:
1. Create 3 email drafts: Professional, Warm & Personal, Data-Driven
2. Each should be 150-250 words
3. Include compelling subject lines
4. Reference specific match reasons
5. Highlight relevant traction/proof points
6. End with clear call to action
7. Personalize to investor's focus areas
8. No generic template language

Focus on the "${draftStyle}" style primarily.`,
        response_json_schema: {
          type: 'object',
          properties: {
            professional: {
              type: 'object',
              properties: {
                subject: { type: 'string' },
                body: { type: 'string' },
                tone_note: { type: 'string' }
              }
            },
            warm: {
              type: 'object',
              properties: {
                subject: { type: 'string' },
                body: { type: 'string' },
                tone_note: { type: 'string' }
              }
            },
            data_driven: {
              type: 'object',
              properties: {
                subject: { type: 'string' },
                body: { type: 'string' },
                tone_note: { type: 'string' }
              }
            },
            tips: { type: 'array', items: { type: 'string' } },
            best_time_to_send: { type: 'string' }
          }
        }
      });

      setDrafts(result);
    } catch (error) {
      console.error('Error generating drafts:', error);
      toast.error('Failed to generate drafts');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const sendEmail = async (draft) => {
    if (!selectedMatch) return;

    const match = matches.find(m => m.id === selectedMatch);
    const startup = startups.find(s => s.id === selectedStartup);

    await createOutreachMutation.mutateAsync({
      startup_id: startup.id,
      contact_id: match.contact_id,
      firm_id: match.firm_id,
      match_id: match.id,
      email_subject: draft.subject,
      email_body: draft.body,
      stage: 'pitch_sent',
      sent_at: new Date().toISOString(),
    });

    toast.success('Email sent successfully!');
  };

  const availableMatches = matches.filter(m => {
    if (!selectedStartup) return false;
    const startup = startups.find(s => s.id === selectedStartup);
    return m.startup_id === startup?.id;
  });

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Introduction Composer</CardTitle>
          <CardDescription>
            Generate personalized introduction messages for investor outreach
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Select Startup</Label>
              <Select value={selectedStartup} onValueChange={(v) => {
                setSelectedStartup(v);
                setSelectedMatch('');
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose startup" />
                </SelectTrigger>
                <SelectContent>
                  {startups.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Select Investor Match</Label>
              <Select value={selectedMatch} onValueChange={setSelectedMatch} disabled={!selectedStartup}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose investor" />
                </SelectTrigger>
                <SelectContent>
                  {availableMatches.map((m) => {
                    const firm = firms.find(f => f.id === m.firm_id);
                    return (
                      <SelectItem key={m.id} value={m.id}>
                        {firm?.company_name} ({m.match_score}%)
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button 
            onClick={generateDrafts}
            disabled={!selectedStartup || !selectedMatch || isGenerating}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Drafts...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Introduction Drafts
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Drafts */}
      {drafts && (
        <>
          {/* Tips */}
          {drafts.tips?.length > 0 && (
            <Card className="bg-indigo-50 border-indigo-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-indigo-900">💡 Tips for Success</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {drafts.tips.map((tip, i) => (
                    <li key={i} className="text-sm text-indigo-700 flex items-start gap-2">
                      <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
                {drafts.best_time_to_send && (
                  <p className="text-xs text-indigo-600 mt-3">
                    ⏰ Best time to send: {drafts.best_time_to_send}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Draft Tabs */}
          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="professional">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="professional">Professional</TabsTrigger>
                  <TabsTrigger value="warm">Warm & Personal</TabsTrigger>
                  <TabsTrigger value="data_driven">Data-Driven</TabsTrigger>
                </TabsList>

                <TabsContent value="professional" className="space-y-4 mt-4">
                  <DraftDisplay 
                    draft={drafts.professional}
                    onCopy={copyToClipboard}
                    onSend={sendEmail}
                    isSending={createOutreachMutation.isPending}
                  />
                </TabsContent>

                <TabsContent value="warm" className="space-y-4 mt-4">
                  <DraftDisplay 
                    draft={drafts.warm}
                    onCopy={copyToClipboard}
                    onSend={sendEmail}
                    isSending={createOutreachMutation.isPending}
                  />
                </TabsContent>

                <TabsContent value="data_driven" className="space-y-4 mt-4">
                  <DraftDisplay 
                    draft={drafts.data_driven}
                    onCopy={copyToClipboard}
                    onSend={sendEmail}
                    isSending={createOutreachMutation.isPending}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}

      {!drafts && !isGenerating && (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <MessageSquare className="w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No Drafts Yet</h3>
            <p className="text-slate-500 text-sm max-w-md">
              Select a startup and investor match to generate personalized introduction emails
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DraftDisplay({ draft, onCopy, onSend, isSending }) {
  if (!draft) return null;

  return (
    <>
      {draft.tone_note && (
        <div className="p-2 bg-slate-50 rounded text-xs text-slate-600 italic">
          {draft.tone_note}
        </div>
      )}
      
      <div className="space-y-2">
        <Label>Subject Line</Label>
        <div className="flex gap-2">
          <Input value={draft.subject} readOnly className="flex-1" />
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => onCopy(draft.subject)}
          >
            <Copy className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Email Body</Label>
        <div className="relative">
          <Textarea 
            value={draft.body}
            readOnly
            rows={12}
            className="pr-12"
          />
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => onCopy(draft.body)}
            className="absolute top-2 right-2"
          >
            <Copy className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button 
          variant="outline"
          onClick={() => onCopy(`${draft.subject}\n\n${draft.body}`)}
        >
          <Copy className="w-4 h-4 mr-2" />
          Copy All
        </Button>
        <Button 
          onClick={() => onSend(draft)}
          disabled={isSending}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          Send Email
        </Button>
      </div>
    </>
  );
}