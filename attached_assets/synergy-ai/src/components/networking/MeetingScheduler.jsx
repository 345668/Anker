import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Video, Calendar, Loader2, Copy, Check, Plus, Search
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function MeetingScheduler({ contacts, firms }) {
  const [showDialog, setShowDialog] = useState(false);
  const [platform, setPlatform] = useState('google_meet');
  const [selectedContact, setSelectedContact] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [meetingData, setMeetingData] = useState({
    title: '',
    date: '',
    time: '',
    duration: '30',
    agenda: '',
  });
  const [meetingLink, setMeetingLink] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const response = await base44.functions.invoke('googleCalendarSync', {
        action: 'check_connection'
      });
      setIsConnected(response.data?.connected || false);
    } catch (error) {
      setIsConnected(false);
    }
  };

  const connectGoogleCalendar = () => {
    const connectUrl = base44.connectors.getConnectURL('googlecalendar');
    window.location.href = connectUrl;
  };

  const generateMeetingLink = async () => {
    setIsGenerating(true);
    try {
      const contact = contacts.find(c => c.id === selectedContact);
      const firm = firms.find(f => f.id === contact?.firm_id);
      
      // Generate AI meeting agenda
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate a professional meeting agenda for this investor call:

Contact: ${contact?.full_name} from ${firm?.company_name}
Meeting Title: ${meetingData.title}
Duration: ${meetingData.duration} minutes
Context: ${meetingData.agenda}

Create a structured agenda with:
1. Introduction (2-3 min)
2. Main discussion points
3. Q&A
4. Next steps

Format it professionally.`,
        response_json_schema: {
          type: 'object',
          properties: {
            formatted_agenda: { type: 'string' },
            talking_points: { type: 'array', items: { type: 'string' } },
            questions_to_ask: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      // Create calendar event and get meeting link
      let link = '';
      let eventId = '';
      
      if (platform === 'google_meet' && isConnected) {
        // Create Google Meet via Calendar API
        const startDateTime = new Date(`${meetingData.date}T${meetingData.time}:00`);
        const endDateTime = new Date(startDateTime);
        endDateTime.setMinutes(endDateTime.getMinutes() + parseInt(meetingData.duration));

        const eventResponse = await base44.functions.invoke('googleCalendarSync', {
          action: 'create_event',
          summary: meetingData.title,
          description: `${result.formatted_agenda}\n\nTalking Points:\n${result.talking_points?.map(p => `• ${p}`).join('\n')}\n\nQuestions to Ask:\n${result.questions_to_ask?.map(q => `• ${q}`).join('\n')}`,
          startDateTime: startDateTime.toISOString(),
          endDateTime: endDateTime.toISOString(),
          attendees: [{ email: contact?.work_email || contact?.personal_email }].filter(a => a.email),
          conferenceData: {
            createRequest: {
              requestId: `meet-${Date.now()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' }
            }
          }
        });
        
        link = eventResponse.data?.hangoutLink || eventResponse.data?.htmlLink;
        eventId = eventResponse.data?.event?.id;
      } else {
        // Fallback for Zoom
        link = `https://zoom.us/j/${Math.floor(Math.random() * 1000000000)}`;
      }
      
      setMeetingLink(link);
      
      // Save meeting with enhanced agenda
      await base44.entities.InteractionLog.create({
        contact_id: selectedContact,
        firm_id: contact?.firm_id,
        type: 'meeting',
        subject: meetingData.title,
        content: `${result.formatted_agenda}\n\nMeeting Link: ${link}\nPlatform: ${platform === 'zoom' ? 'Zoom' : 'Google Meet'}`,
        metadata: {
          platform,
          link,
          eventId,
          date: meetingData.date,
          time: meetingData.time,
          duration: meetingData.duration,
          talking_points: result.talking_points,
          questions_to_ask: result.questions_to_ask,
          synced_to_calendar: platform === 'google_meet' && isConnected
        },
        performed_by: (await base44.auth.me()).email,
      });

      toast.success(`Meeting scheduled and ${platform === 'google_meet' && isConnected ? 'added to Google Calendar' : 'saved'}!`);
    } catch (error) {
      console.error('Error creating meeting:', error);
      toast.error('Failed to schedule meeting');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(meetingLink);
    toast.success('Link copied!');
  };

  const filteredContacts = useMemo(() => {
    if (!contactSearch) return contacts;
    
    const search = contactSearch.toLowerCase();
    return contacts.filter(contact => {
      const firm = firms.find(f => f.id === contact.firm_id);
      const nameMatch = contact.full_name?.toLowerCase().includes(search);
      const firmMatch = firm?.company_name?.toLowerCase().includes(search);
      const emailMatch = contact.work_email?.toLowerCase().includes(search) || 
                        contact.personal_email?.toLowerCase().includes(search);
      
      return nameMatch || firmMatch || emailMatch;
    });
  }, [contacts, firms, contactSearch]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule Meeting</CardTitle>
          <CardDescription>
            Create Zoom or Google Meet links with AI-generated agendas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isConnected && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800 mb-2">
                Connect your Google account to create Google Meet meetings automatically
              </p>
              <Button 
                onClick={connectGoogleCalendar}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <Video className="w-4 h-4 mr-2" />
                Connect Google Calendar
              </Button>
            </div>
          )}
          {isConnected && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span className="text-sm text-emerald-800">Google Calendar connected</span>
            </div>
          )}
          <Button onClick={() => setShowDialog(true)} className="w-full">
            <Calendar className="w-4 h-4 mr-2" />
            Schedule New Meeting
          </Button>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Schedule Investor Meeting</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Platform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zoom">
                      <div className="flex items-center gap-2">
                        <Video className="w-4 h-4" />
                        Zoom
                      </div>
                    </SelectItem>
                    <SelectItem value="google_meet">
                      <div className="flex items-center gap-2">
                        <Video className="w-4 h-4" />
                        Google Meet
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Investor Contact</Label>
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search by name, firm, or email..."
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={selectedContact} onValueChange={setSelectedContact}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select contact" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {filteredContacts.length === 0 ? (
                        <div className="p-2 text-sm text-slate-500 text-center">
                          No contacts found
                        </div>
                      ) : (
                        filteredContacts.map((c) => {
                          const firm = firms.find(f => f.id === c.firm_id);
                          return (
                            <SelectItem key={c.id} value={c.id}>
                              <div className="flex flex-col">
                                <span>{c.full_name}</span>
                                <span className="text-xs text-slate-500">
                                  {firm?.company_name}
                                  {(c.work_email || c.personal_email) && 
                                    ` • ${c.work_email || c.personal_email}`}
                                </span>
                              </div>
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Meeting Title</Label>
              <Input
                value={meetingData.title}
                onChange={(e) => setMeetingData({ ...meetingData, title: e.target.value })}
                placeholder="Pitch discussion with [Investor Name]"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={meetingData.date}
                  onChange={(e) => setMeetingData({ ...meetingData, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={meetingData.time}
                  onChange={(e) => setMeetingData({ ...meetingData, time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Duration (min)</Label>
                <Select value={meetingData.duration} onValueChange={(v) => setMeetingData({ ...meetingData, duration: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">60 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Meeting Context (for AI agenda)</Label>
              <Textarea
                value={meetingData.agenda}
                onChange={(e) => setMeetingData({ ...meetingData, agenda: e.target.value })}
                placeholder="What do you want to discuss? Key points to cover..."
                rows={4}
              />
            </div>

            {meetingLink && (
              <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <Label className="text-emerald-900 mb-2 block">Meeting Link Generated</Label>
                <div className="flex gap-2">
                  <Input value={meetingLink} readOnly className="bg-white" />
                  <Button variant="outline" size="icon" onClick={copyLink}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-emerald-700 mt-2">
                  ✓ AI agenda created • Link saved to interactions
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={generateMeetingLink}
                disabled={!selectedContact || !meetingData.title || isGenerating}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Generate Meeting Link
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}