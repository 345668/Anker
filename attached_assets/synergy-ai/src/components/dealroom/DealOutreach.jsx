import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Mail, Eye, MessageSquare, Calendar, ExternalLink } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDistanceToNow } from 'date-fns';
import { cn } from "@/lib/utils";

const stageConfig = {
  pitch_sent: { label: 'Sent', color: 'bg-blue-100 text-blue-700' },
  opened: { label: 'Opened', color: 'bg-amber-100 text-amber-700' },
  replied: { label: 'Replied', color: 'bg-emerald-100 text-emerald-700' },
  call_scheduled: { label: 'Call Set', color: 'bg-violet-100 text-violet-700' },
};

export default function DealOutreach({ dealRoom, outreaches, firms, contacts }) {
  const dealOutreaches = outreaches.filter(o => dealRoom.outreach_ids?.includes(o.id));

  if (dealOutreaches.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-12 text-center">
          <Mail className="w-12 h-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No Outreach Yet</h3>
          <p className="text-slate-500 text-sm max-w-md">
            Start reaching out to investors to track communications in this deal room
          </p>
        </CardContent>
      </Card>
    );
  }

  const stats = {
    sent: dealOutreaches.length,
    opened: dealOutreaches.filter(o => o.opened_at).length,
    replied: dealOutreaches.filter(o => o.replied_at).length,
    scheduled: dealOutreaches.filter(o => o.stage === 'call_scheduled').length,
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <Mail className="w-6 h-6 text-blue-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-slate-900">{stats.sent}</p>
            <p className="text-xs text-slate-500">Sent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Eye className="w-6 h-6 text-amber-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-slate-900">{stats.opened}</p>
            <p className="text-xs text-slate-500">Opened</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <MessageSquare className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-slate-900">{stats.replied}</p>
            <p className="text-xs text-slate-500">Replied</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Calendar className="w-6 h-6 text-violet-600 mx-auto mb-2" />
            <p className="text-2xl font-bold text-slate-900">{stats.scheduled}</p>
            <p className="text-xs text-slate-500">Calls</p>
          </CardContent>
        </Card>
      </div>

      {/* Outreach List */}
      <div className="space-y-3">
        {dealOutreaches.map((outreach) => {
          const firm = firms.find(f => f.id === outreach.firm_id);
          const contact = contacts.find(c => c.id === outreach.contact_id);
          const stage = stageConfig[outreach.stage] || stageConfig.pitch_sent;

          return (
            <Card key={outreach.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div>
                        <h4 className="font-medium text-slate-900">{contact?.full_name}</h4>
                        <p className="text-sm text-slate-500">{firm?.company_name}</p>
                      </div>
                      <Badge className={stage.color}>{stage.label}</Badge>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm text-slate-700">
                        <span className="font-medium">Subject:</span> {outreach.email_subject}
                      </p>
                      
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        {outreach.sent_at && (
                          <span>Sent {formatDistanceToNow(new Date(outreach.sent_at), { addSuffix: true })}</span>
                        )}
                        {outreach.open_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            Opened {outreach.open_count}x
                          </span>
                        )}
                        {outreach.replied_at && (
                          <span className="flex items-center gap-1 text-emerald-600">
                            <MessageSquare className="w-3 h-3" />
                            Replied
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button variant="ghost" size="sm" asChild>
                    <Link to={createPageUrl(`OutreachDetails?id=${outreach.id}`)}>
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}