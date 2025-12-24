import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Building2, User, Mail, Calendar } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import FollowUpSequencer from '@/components/crm/FollowUpSequencer';
import OptimalTimingAnalyzer from '@/components/crm/OptimalTimingAnalyzer';
import ABTestingAnalytics from '@/components/crm/ABTestingAnalytics';
import AIResponseAssistant from '@/components/crm/AIResponseAssistant';

export default function OutreachDetails() {
  const [outreachId, setOutreachId] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOutreachId(params.get('id'));
  }, []);

  const { data: outreach, isLoading } = useQuery({
    queryKey: ['outreach', outreachId],
    queryFn: async () => {
      const results = await base44.entities.Outreach.filter({ id: outreachId });
      return results[0];
    },
    enabled: !!outreachId,
  });

  const { data: contact } = useQuery({
    queryKey: ['contact', outreach?.contact_id],
    queryFn: async () => {
      const results = await base44.entities.Contact.filter({ id: outreach.contact_id });
      return results[0];
    },
    enabled: !!outreach?.contact_id,
  });

  const { data: firm } = useQuery({
    queryKey: ['firm', outreach?.firm_id],
    queryFn: async () => {
      const results = await base44.entities.InvestorFirm.filter({ id: outreach.firm_id });
      return results[0];
    },
    enabled: !!outreach?.firm_id,
  });

  const { data: allOutreaches = [] } = useQuery({
    queryKey: ['allOutreaches'],
    queryFn: () => base44.entities.Outreach.list('-created_date', 200),
    enabled: !!outreach,
  });

  const { data: interactions = [] } = useQuery({
    queryKey: ['interactions', outreach?.id],
    queryFn: () => base44.entities.InteractionLog.filter({ outreach_id: outreach.id }),
    enabled: !!outreach?.id,
  });

  if (isLoading || !outreach) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to={createPageUrl('Outreach')}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Outreach Details</h1>
          <p className="text-slate-500 mt-1">AI-powered insights and automation</p>
        </div>
      </div>

      {/* Outreach Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Contact</p>
                <p className="font-medium text-slate-900">{contact?.full_name}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Firm</p>
                <p className="font-medium text-slate-900">{firm?.company_name}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Sent</p>
                <p className="font-medium text-slate-900">
                  {new Date(outreach.sent_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Email Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Subject</p>
            <p className="text-sm text-slate-900">{outreach.email_subject}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Message</p>
            <div className="text-sm text-slate-700 whitespace-pre-wrap p-3 bg-slate-50 rounded-lg">
              {outreach.email_body}
            </div>
          </div>
          <div className="flex gap-2">
            {outreach.opened_at && (
              <Badge className="bg-emerald-100 text-emerald-700">Opened</Badge>
            )}
            {outreach.clicked_at && (
              <Badge className="bg-blue-100 text-blue-700">Clicked</Badge>
            )}
            {outreach.replied_at && (
              <Badge className="bg-purple-100 text-purple-700">Replied</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI Response Assistant */}
      <AIResponseAssistant 
        outreach={outreach}
        contact={contact}
        firm={firm}
        investorReply={outreach.investor_reply}
        interactions={interactions}
      />

      {/* AI Automation Features */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FollowUpSequencer 
          outreach={outreach}
          contact={contact}
          firm={firm}
          onSequenceGenerated={(sequence) => {
            console.log('Follow-up sequence generated:', sequence);
          }}
        />
        <OptimalTimingAnalyzer 
          outreaches={allOutreaches}
          contact={contact}
          firm={firm}
        />
      </div>

      {/* A/B Testing Analytics */}
      <ABTestingAnalytics outreaches={allOutreaches} />
    </div>
  );
}