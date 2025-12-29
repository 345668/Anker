import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { 
  Calendar as CalendarIcon, 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  Clock,
  MapPin,
  Users,
  Video,
  Mail,
  Link as LinkIcon,
  Trash2,
  Edit2,
  FolderOpen,
  GitBranch,
  Briefcase,
  RefreshCw,
  Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import type { CalendarMeeting, Investor, InvestmentFirm, UserEmailSettings } from "@shared/schema";

const subNavItems = [
  { label: "Deal Rooms", href: "/app/deal-rooms", icon: FolderOpen },
  { label: "Pipeline", href: "/app/pipeline", icon: GitBranch },
  { label: "Deal Flow", href: "/app/deal-flow", icon: Briefcase },
  { label: "Calendar", href: "/app/calendar", icon: CalendarIcon },
];

const meetingTypes = [
  { value: "networking", label: "Networking", color: "bg-[rgb(142,132,247)]" },
  { value: "pitch", label: "Pitch Meeting", color: "bg-[rgb(251,194,213)]" },
  { value: "due_diligence", label: "Due Diligence", color: "bg-[rgb(254,212,92)]" },
  { value: "follow_up", label: "Follow-up", color: "bg-[rgb(196,227,230)]" },
];

function SubNavigation() {
  const [location] = useLocation();
  
  return (
    <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
      {subNavItems.map((item) => {
        const isActive = location === item.href;
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href}>
            <button
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/10'
              }`}
              data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          </Link>
        );
      })}
    </div>
  );
}

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [createMeetingOpen, setCreateMeetingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<CalendarMeeting | null>(null);
  
  const [meetingForm, setMeetingForm] = useState({
    title: "",
    description: "",
    startTime: "",
    endTime: "",
    location: "",
    meetingLink: "",
    meetingType: "networking",
    attendeeEmail: "",
  });

  const [emailForm, setEmailForm] = useState({
    senderEmail: "",
    senderName: "",
  });
  
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: meetings = [], isLoading: loadingMeetings } = useQuery<CalendarMeeting[]>({
    queryKey: ["/api/calendar/meetings"],
  });

  const { data: emailSettings } = useQuery<UserEmailSettings>({
    queryKey: ["/api/user/email-settings"],
  });

  const { data: investors = [] } = useQuery<Investor[]>({
    queryKey: ["/api/investors"],
  });

  const { data: firms = [] } = useQuery<InvestmentFirm[]>({
    queryKey: ["/api/firms"],
  });

  const createMeetingMutation = useMutation({
    mutationFn: async (data: typeof meetingForm) => {
      return apiRequest("POST", "/api/calendar/meetings", {
        title: data.title,
        description: data.description,
        startTime: new Date(data.startTime).toISOString(),
        endTime: new Date(data.endTime).toISOString(),
        location: data.location,
        meetingLink: data.meetingLink,
        meetingType: data.meetingType,
        attendees: data.attendeeEmail ? [{ email: data.attendeeEmail, status: 'pending' }] : [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/meetings"] });
      setCreateMeetingOpen(false);
      setMeetingForm({
        title: "",
        description: "",
        startTime: "",
        endTime: "",
        location: "",
        meetingLink: "",
        meetingType: "networking",
        attendeeEmail: "",
      });
      toast({ title: "Meeting scheduled", description: "Your meeting has been added to the calendar." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to schedule meeting", description: error.message, variant: "destructive" });
    },
  });

  const deleteMeetingMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/calendar/meetings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/meetings"] });
      setSelectedMeeting(null);
      toast({ title: "Meeting deleted" });
    },
  });

  const updateEmailSettingsMutation = useMutation({
    mutationFn: async (data: typeof emailForm) => {
      return apiRequest("POST", "/api/user/email-settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/email-settings"] });
      setSettingsOpen(false);
      toast({ title: "Email settings saved", description: "Your sender email has been configured." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save settings", description: error.message, variant: "destructive" });
    },
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getMeetingsForDay = (day: Date) => {
    return meetings.filter(meeting => {
      const meetingDate = new Date(meeting.startTime);
      return isSameDay(meetingDate, day);
    });
  };

  const handleOpenCreateMeeting = (date?: Date) => {
    if (date) {
      const dateStr = format(date, "yyyy-MM-dd");
      setMeetingForm(prev => ({
        ...prev,
        startTime: `${dateStr}T09:00`,
        endTime: `${dateStr}T10:00`,
      }));
    }
    setCreateMeetingOpen(true);
  };

  if (loadingMeetings) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout
      title="Calendar"
      subtitle="Manage your networking meetings and investor calls"
      heroHeight="30vh"
      videoUrl={videoBackgrounds.networking}
    >
      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <SubNavigation />

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="bg-white/5 border border-white/10 text-white hover:bg-white/10"
                  onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                  data-testid="button-prev-month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-xl font-medium text-white min-w-[200px] text-center">
                  {format(currentDate, "MMMM yyyy")}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="bg-white/5 border border-white/10 text-white hover:bg-white/10"
                  onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                  data-testid="button-next-month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/20 text-white/70 hover:bg-white/10 ml-4"
                  onClick={() => setCurrentDate(new Date())}
                  data-testid="button-today"
                >
                  Today
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/20 text-white/70 hover:bg-white/10"
                  onClick={() => {
                    setEmailForm({
                      senderEmail: emailSettings?.senderEmail || "",
                      senderName: emailSettings?.senderName || user?.firstName || "",
                    });
                    setSettingsOpen(true);
                  }}
                  data-testid="button-email-settings"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Email Settings
                </Button>
                <Button
                  onClick={() => handleOpenCreateMeeting()}
                  className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                  data-testid="button-schedule-meeting"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Schedule Meeting
                </Button>
              </div>
            </div>

            {!emailSettings?.senderEmail && (
              <div className="mb-8 p-4 rounded-xl bg-[rgb(254,212,92)]/10 border border-[rgb(254,212,92)]/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-[rgb(254,212,92)]" />
                  <p className="text-white/80">
                    <span className="font-medium text-white">Configure your sender email</span> to send meeting invites and outreach emails.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[rgb(254,212,92)]/50 text-[rgb(254,212,92)] hover:bg-[rgb(254,212,92)]/10"
                  onClick={() => {
                    setEmailForm({
                      senderEmail: "",
                      senderName: user?.firstName || "",
                    });
                    setSettingsOpen(true);
                  }}
                  data-testid="button-configure-email"
                >
                  Configure Email
                </Button>
              </div>
            )}

            <div className="grid grid-cols-7 gap-px bg-white/10 rounded-xl overflow-hidden">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                <div key={day} className="p-3 bg-white/5 text-center text-sm font-medium text-white/60">
                  {day}
                </div>
              ))}
              
              {calendarDays.map((day, index) => {
                const dayMeetings = getMeetingsForDay(day);
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isToday = isSameDay(day, new Date());
                
                return (
                  <div
                    key={index}
                    className={`min-h-[120px] p-2 bg-[rgb(18,18,18)] transition-colors cursor-pointer hover:bg-white/5 ${
                      !isCurrentMonth ? 'opacity-40' : ''
                    }`}
                    onClick={() => handleOpenCreateMeeting(day)}
                    data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
                  >
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full mb-1 ${
                      isToday 
                        ? 'bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-bold' 
                        : 'text-white/70'
                    }`}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-1">
                      {dayMeetings.slice(0, 2).map(meeting => {
                        const typeConfig = meetingTypes.find(t => t.value === meeting.meetingType) || meetingTypes[0];
                        return (
                          <div
                            key={meeting.id}
                            className={`text-xs p-1 rounded ${typeConfig.color} text-white truncate`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMeeting(meeting);
                            }}
                            data-testid={`meeting-${meeting.id}`}
                          >
                            {format(new Date(meeting.startTime), "HH:mm")} {meeting.title}
                          </div>
                        );
                      })}
                      {dayMeetings.length > 2 && (
                        <div className="text-xs text-white/50 pl-1">
                          +{dayMeetings.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {meetings.length === 0 && (
              <div className="mt-8 p-12 rounded-xl bg-white/5 border border-white/10 text-center">
                <CalendarIcon className="h-16 w-16 mx-auto text-[rgb(142,132,247)] mb-4" />
                <h3 className="text-xl font-medium text-white mb-2">No meetings scheduled</h3>
                <p className="text-white/50 mb-6 max-w-md mx-auto">
                  Schedule networking meetings with investors and track your investor relations calendar.
                </p>
                <Button
                  onClick={() => handleOpenCreateMeeting()}
                  className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Schedule Your First Meeting
                </Button>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      <Dialog open={createMeetingOpen} onOpenChange={setCreateMeetingOpen}>
        <DialogContent className="bg-[rgb(24,24,24)] border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule Meeting</DialogTitle>
            <DialogDescription className="text-white/50">
              Create a new meeting and optionally invite attendees
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-white/70">Meeting Title</Label>
              <Input
                value={meetingForm.title}
                onChange={e => setMeetingForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Intro call with Sequoia"
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-meeting-title"
              />
            </div>
            <div>
              <Label className="text-white/70">Meeting Type</Label>
              <Select value={meetingForm.meetingType} onValueChange={v => setMeetingForm(prev => ({ ...prev, meetingType: v }))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-meeting-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {meetingTypes.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-white/70">Start Time</Label>
                <Input
                  type="datetime-local"
                  value={meetingForm.startTime}
                  onChange={e => setMeetingForm(prev => ({ ...prev, startTime: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                  data-testid="input-start-time"
                />
              </div>
              <div>
                <Label className="text-white/70">End Time</Label>
                <Input
                  type="datetime-local"
                  value={meetingForm.endTime}
                  onChange={e => setMeetingForm(prev => ({ ...prev, endTime: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                  data-testid="input-end-time"
                />
              </div>
            </div>
            <div>
              <Label className="text-white/70">Location / Meeting Link</Label>
              <Input
                value={meetingForm.location || meetingForm.meetingLink}
                onChange={e => setMeetingForm(prev => ({ ...prev, location: e.target.value, meetingLink: e.target.value.startsWith('http') ? e.target.value : '' }))}
                placeholder="e.g., Zoom link or office address"
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-meeting-location"
              />
            </div>
            <div>
              <Label className="text-white/70">Attendee Email (optional)</Label>
              <Input
                type="email"
                value={meetingForm.attendeeEmail}
                onChange={e => setMeetingForm(prev => ({ ...prev, attendeeEmail: e.target.value }))}
                placeholder="investor@firm.com"
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-attendee-email"
              />
            </div>
            <div>
              <Label className="text-white/70">Description</Label>
              <Textarea
                value={meetingForm.description}
                onChange={e => setMeetingForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Meeting agenda or notes..."
                rows={3}
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-meeting-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateMeetingOpen(false)} className="border-white/20 text-white/70">
              Cancel
            </Button>
            <Button
              onClick={() => createMeetingMutation.mutate(meetingForm)}
              disabled={!meetingForm.title || !meetingForm.startTime || !meetingForm.endTime || createMeetingMutation.isPending}
              className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
              data-testid="button-create-meeting"
            >
              Schedule Meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedMeeting} onOpenChange={() => setSelectedMeeting(null)}>
        <DialogContent className="bg-[rgb(24,24,24)] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>{selectedMeeting?.title}</DialogTitle>
          </DialogHeader>
          {selectedMeeting && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 text-white/70">
                <Clock className="h-4 w-4" />
                <span>
                  {format(new Date(selectedMeeting.startTime), "MMM d, yyyy 'at' h:mm a")} - 
                  {format(new Date(selectedMeeting.endTime), " h:mm a")}
                </span>
              </div>
              {(selectedMeeting.location || selectedMeeting.meetingLink) && (
                <div className="flex items-center gap-3 text-white/70">
                  {selectedMeeting.meetingLink ? (
                    <>
                      <Video className="h-4 w-4" />
                      <a href={selectedMeeting.meetingLink} target="_blank" rel="noopener noreferrer" className="text-[rgb(142,132,247)] hover:underline">
                        Join Meeting
                      </a>
                    </>
                  ) : (
                    <>
                      <MapPin className="h-4 w-4" />
                      <span>{selectedMeeting.location}</span>
                    </>
                  )}
                </div>
              )}
              {selectedMeeting.attendees && (selectedMeeting.attendees as any[]).length > 0 && (
                <div className="flex items-start gap-3 text-white/70">
                  <Users className="h-4 w-4 mt-1" />
                  <div>
                    {(selectedMeeting.attendees as any[]).map((attendee, i) => (
                      <div key={i}>{attendee.email}</div>
                    ))}
                  </div>
                </div>
              )}
              {selectedMeeting.description && (
                <div className="p-3 rounded-lg bg-white/5 text-white/70">
                  {selectedMeeting.description}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Badge className={`${meetingTypes.find(t => t.value === selectedMeeting.meetingType)?.color || 'bg-white/20'} text-white`}>
                  {meetingTypes.find(t => t.value === selectedMeeting.meetingType)?.label || 'Meeting'}
                </Badge>
                <Badge variant="outline" className="bg-white/5 text-white/60 border-white/20">
                  {selectedMeeting.status}
                </Badge>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              className="border-red-400/50 text-red-400 hover:bg-red-400/10"
              onClick={() => selectedMeeting && deleteMeetingMutation.mutate(selectedMeeting.id)}
              data-testid="button-delete-meeting"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
            <Button variant="outline" onClick={() => setSelectedMeeting(null)} className="border-white/20 text-white/70">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="bg-[rgb(24,24,24)] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Email Settings</DialogTitle>
            <DialogDescription className="text-white/50">
              Configure your email address for sending meeting invites and outreach emails
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-white/70">Your Gmail Address</Label>
              <Input
                type="email"
                value={emailForm.senderEmail}
                onChange={e => setEmailForm(prev => ({ ...prev, senderEmail: e.target.value }))}
                placeholder="yourname@gmail.com"
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-sender-email"
              />
              <p className="text-xs text-white/40 mt-1">This email will be used as the sender for all outreach</p>
            </div>
            <div>
              <Label className="text-white/70">Display Name</Label>
              <Input
                value={emailForm.senderName}
                onChange={e => setEmailForm(prev => ({ ...prev, senderName: e.target.value }))}
                placeholder="Your Name"
                className="bg-white/5 border-white/10 text-white"
                data-testid="input-sender-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)} className="border-white/20 text-white/70">
              Cancel
            </Button>
            <Button
              onClick={() => updateEmailSettingsMutation.mutate(emailForm)}
              disabled={!emailForm.senderEmail || updateEmailSettingsMutation.isPending}
              className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white border-0"
              data-testid="button-save-email-settings"
            >
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
