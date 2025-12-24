import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { 
  Mail, Eye, MousePointer, MessageSquare, Calendar, 
  MoreHorizontal, ExternalLink, Send, Clock, Sparkles
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const stageConfig = {
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-700', icon: Clock },
  pitch_sent: { label: 'Sent', color: 'bg-blue-100 text-blue-700', icon: Send },
  opened: { label: 'Opened', color: 'bg-amber-100 text-amber-700', icon: Eye },
  clicked: { label: 'Clicked', color: 'bg-orange-100 text-orange-700', icon: MousePointer },
  replied: { label: 'Replied', color: 'bg-emerald-100 text-emerald-700', icon: MessageSquare },
  call_scheduled: { label: 'Call Set', color: 'bg-violet-100 text-violet-700', icon: Calendar },
  in_negotiation: { label: 'Negotiating', color: 'bg-indigo-100 text-indigo-700', icon: MessageSquare },
  passed: { label: 'Passed', color: 'bg-red-100 text-red-700', icon: Mail },
  funded: { label: 'Funded', color: 'bg-emerald-100 text-emerald-700', icon: Mail },
};

export default function OutreachTable({ 
  outreaches = [], 
  contacts = {}, 
  firms = {}, 
  onStatusChange,
  onViewDetails,
  isLoading 
}) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8">
        <div className="flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (outreaches.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <Mail className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900 mb-1">No outreach yet</h3>
        <p className="text-slate-500 text-sm">Start reaching out to investors to see your outreach here</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Contact</TableHead>
            <TableHead>Firm</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Engagement</TableHead>
            <TableHead>Last Activity</TableHead>
            <TableHead>AI Tools</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {outreaches.map((outreach) => {
            const contact = contacts[outreach.contact_id];
            const firm = firms[outreach.firm_id];
            const stage = stageConfig[outreach.stage] || stageConfig.draft;
            const StageIcon = stage.icon;

            return (
              <TableRow 
                key={outreach.id} 
                className="group cursor-pointer hover:bg-slate-50"
                onClick={() => onViewDetails?.(outreach)}
              >
                <TableCell>
                  <div>
                    <p className="font-medium text-slate-900">{contact?.full_name || 'Unknown'}</p>
                    <p className="text-xs text-slate-500">{contact?.title}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-700">{firm?.company_name || 'Unknown'}</span>
                    {firm?.linkedin_url && (
                      <a 
                        href={firm.linkedin_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-slate-400 hover:text-indigo-600"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={cn("font-medium", stage.color)}>
                    <StageIcon className="w-3 h-3 mr-1" />
                    {stage.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    {outreach.open_count > 0 && (
                      <span className="flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" />
                        {outreach.open_count}
                      </span>
                    )}
                    {outreach.click_count > 0 && (
                      <span className="flex items-center gap-1">
                        <MousePointer className="w-3.5 h-3.5" />
                        {outreach.click_count}
                      </span>
                    )}
                    {outreach.open_count === 0 && outreach.click_count === 0 && (
                      <span>No engagement yet</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-slate-500">
                    {outreach.sent_at ? formatDistanceToNow(new Date(outreach.sent_at), { addSuffix: true }) : '—'}
                  </span>
                </TableCell>
                <TableCell>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    asChild
                    onClick={(e) => e.stopPropagation()}
                    className="text-indigo-600 hover:text-indigo-700"
                  >
                    <Link to={createPageUrl(`OutreachDetails?id=${outreach.id}`)}>
                      <Sparkles className="w-3.5 h-3.5 mr-1" />
                      Automate
                    </Link>
                  </Button>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onStatusChange?.(outreach, 'replied')}>
                        Mark as Replied
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onStatusChange?.(outreach, 'call_scheduled')}>
                        Mark Call Scheduled
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onStatusChange?.(outreach, 'passed')}>
                        Mark as Passed
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}