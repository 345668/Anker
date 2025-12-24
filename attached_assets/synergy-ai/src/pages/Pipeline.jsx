import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { 
  Loader2, Building2, Mail, Eye, MessageSquare, Calendar, 
  CheckCircle, XCircle, MoreHorizontal, ExternalLink
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from 'date-fns';

const stages = [
  { id: 'pitch_sent', label: 'Sent', icon: Mail, color: 'bg-blue-500' },
  { id: 'opened', label: 'Opened', icon: Eye, color: 'bg-amber-500' },
  { id: 'replied', label: 'Replied', icon: MessageSquare, color: 'bg-emerald-500' },
  { id: 'call_scheduled', label: 'Call Set', icon: Calendar, color: 'bg-violet-500' },
  { id: 'in_negotiation', label: 'Negotiating', icon: CheckCircle, color: 'bg-indigo-500' },
  { id: 'funded', label: 'Funded', icon: CheckCircle, color: 'bg-green-600' },
  { id: 'passed', label: 'Passed', icon: XCircle, color: 'bg-red-500' },
];

export default function Pipeline() {
  const queryClient = useQueryClient();

  const { data: outreaches = [], isLoading } = useQuery({
    queryKey: ['outreaches'],
    queryFn: () => base44.entities.Outreach.list('-created_date', 500),
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.list('-created_date', 1000),
  });

  const { data: firms = [] } = useQuery({
    queryKey: ['firms'],
    queryFn: () => base44.entities.InvestorFirm.list('-created_date', 1000),
  });

  const contactsMap = contacts.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});
  const firmsMap = firms.reduce((acc, f) => ({ ...acc, [f.id]: f }), {});

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Outreach.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(['outreaches']),
  });

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const { draggableId, destination } = result;
    const newStage = destination.droppableId;

    updateMutation.mutate({
      id: draggableId,
      data: { 
        stage: newStage,
        ...(newStage === 'opened' && { opened_at: new Date().toISOString() }),
        ...(newStage === 'replied' && { replied_at: new Date().toISOString() }),
      }
    });
  };

  const getOutreachesForStage = (stageId) => {
    return outreaches.filter(o => o.stage === stageId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
        <p className="text-slate-500 mt-1">Drag and drop to update outreach status</p>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const stageOutreaches = getOutreachesForStage(stage.id);
            const StageIcon = stage.icon;

            return (
              <div key={stage.id} className="flex-shrink-0 w-72">
                {/* Column header */}
                <div className="flex items-center justify-between mb-3 px-2">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", stage.color)} />
                    <span className="font-medium text-slate-900">{stage.label}</span>
                    <Badge variant="secondary" className="text-xs">
                      {stageOutreaches.length}
                    </Badge>
                  </div>
                </div>

                {/* Droppable area */}
                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "bg-slate-100 rounded-xl p-2 min-h-[500px] transition-colors",
                        snapshot.isDraggingOver && "bg-indigo-50"
                      )}
                    >
                      {stageOutreaches.map((outreach, index) => {
                        const contact = contactsMap[outreach.contact_id];
                        const firm = firmsMap[outreach.firm_id];

                        return (
                          <Draggable 
                            key={outreach.id} 
                            draggableId={outreach.id} 
                            index={index}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={cn(
                                  "bg-white rounded-lg p-3 mb-2 shadow-sm border border-slate-200",
                                  "hover:shadow-md transition-shadow cursor-grab",
                                  snapshot.isDragging && "shadow-lg rotate-2"
                                )}
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
                                      <Building2 className="w-4 h-4 text-slate-500" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-slate-900 line-clamp-1">
                                        {firm?.company_name || 'Unknown'}
                                      </p>
                                      <p className="text-xs text-slate-500 line-clamp-1">
                                        {contact?.full_name}
                                      </p>
                                    </div>
                                  </div>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-6 w-6">
                                        <MoreHorizontal className="w-3 h-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {contact?.linkedin_url && (
                                        <DropdownMenuItem asChild>
                                          <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer">
                                            <ExternalLink className="w-4 h-4 mr-2" />
                                            LinkedIn
                                          </a>
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem asChild>
                                        <a href={`mailto:${contact?.work_email}`}>
                                          <Mail className="w-4 h-4 mr-2" />
                                          Send Email
                                        </a>
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>

                                {/* Engagement stats */}
                                <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                                  {outreach.open_count > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Eye className="w-3 h-3" />
                                      {outreach.open_count}
                                    </span>
                                  )}
                                  {outreach.click_count > 0 && (
                                    <span className="flex items-center gap-1">
                                      <MessageSquare className="w-3 h-3" />
                                      {outreach.click_count}
                                    </span>
                                  )}
                                </div>

                                {/* Time */}
                                <p className="text-xs text-slate-400">
                                  {outreach.sent_at 
                                    ? formatDistanceToNow(new Date(outreach.sent_at), { addSuffix: true })
                                    : 'Not sent'}
                                </p>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}

                      {stageOutreaches.length === 0 && (
                        <div className="text-center py-8 text-slate-400 text-sm">
                          Drop items here
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}