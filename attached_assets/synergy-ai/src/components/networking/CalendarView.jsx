import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, 
  Video, Clock, Users, RefreshCw, Loader2, ExternalLink
} from 'lucide-react';
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
import { toast } from "sonner";

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isConnected, setIsConnected] = useState(false);

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

  const { data: events = [], isLoading, refetch } = useQuery({
    queryKey: ['calendar-events', currentDate.getMonth(), currentDate.getFullYear()],
    queryFn: async () => {
      if (!isConnected) return [];
      
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      const response = await base44.functions.invoke('googleCalendarSync', {
        action: 'list_events',
        timeMin: startOfMonth.toISOString(),
        timeMax: endOfMonth.toISOString()
      });
      
      return response.data?.events || [];
    },
    enabled: isConnected,
  });

  const connectGoogleCalendar = () => {
    const connectUrl = base44.connectors.getConnectURL('googlecalendar');
    window.location.href = connectUrl;
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    return { daysInMonth, startingDayOfWeek };
  };

  const getEventsForDate = (date) => {
    return events.filter(event => {
      const eventDate = new Date(event.start.dateTime || event.start.date);
      return eventDate.toDateString() === date.toDateString();
    });
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate);
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const selectedDateEvents = getEventsForDate(selectedDate);

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Meeting Calendar</CardTitle>
          <CardDescription>Connect Google Calendar to view and manage meetings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-6 text-center border-2 border-dashed rounded-lg">
            <CalendarIcon className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-sm text-slate-600 mb-4">
              Connect your Google Calendar to sync meeting schedules
            </p>
            <Button onClick={connectGoogleCalendar}>
              <Video className="w-4 h-4 mr-2" />
              Connect Google Calendar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Meeting Calendar</CardTitle>
              <CardDescription>Google Calendar synced meetings</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
              Sync
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h3>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={nextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-xs font-medium text-slate-500 py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startingDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
              const dayEvents = getEventsForDate(date);
              const isSelected = date.toDateString() === selectedDate.toDateString();
              const isToday = date.toDateString() === new Date().toDateString();
              
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(date)}
                  className={cn(
                    "aspect-square p-1 rounded-lg border transition-all relative",
                    isSelected && "border-indigo-500 bg-indigo-50",
                    !isSelected && "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                    isToday && "border-indigo-300 font-semibold"
                  )}
                >
                  <div className={cn(
                    "text-sm",
                    isToday && "text-indigo-600",
                    isSelected && "text-indigo-700"
                  )}>
                    {day}
                  </div>
                  {dayEvents.length > 0 && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {dayEvents.slice(0, 3).map((_, i) => (
                        <div key={i} className="w-1 h-1 bg-indigo-500 rounded-full" />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Date Events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </CardTitle>
          <CardDescription>
            {selectedDateEvents.length} meeting{selectedDateEvents.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedDateEvents.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <CalendarIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No meetings scheduled</p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDateEvents.map((event) => {
                const startTime = new Date(event.start.dateTime || event.start.date);
                const endTime = new Date(event.end.dateTime || event.end.date);
                const hasGoogleMeet = event.hangoutLink || event.conferenceData?.entryPoints?.some(e => e.entryPointType === 'video');
                
                return (
                  <div key={event.id} className="p-4 border rounded-lg hover:border-indigo-200 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1">
                        <h4 className="font-medium text-slate-900">{event.summary}</h4>
                        <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                          <Clock className="w-3.5 h-3.5" />
                          {startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          {' - '}
                          {endTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                      {hasGoogleMeet && (
                        <Badge className="bg-green-100 text-green-700">
                          <Video className="w-3 h-3 mr-1" />
                          Google Meet
                        </Badge>
                      )}
                    </div>
                    
                    {event.description && (
                      <p className="text-xs text-slate-600 mb-2 line-clamp-2">
                        {event.description}
                      </p>
                    )}
                    
                    {event.attendees && event.attendees.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                        <Users className="w-3.5 h-3.5" />
                        {event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}
                      </div>
                    )}
                    
                    <div className="flex gap-2">
                      {event.hangoutLink && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={event.hangoutLink} target="_blank" rel="noopener noreferrer">
                            <Video className="w-3.5 h-3.5 mr-1.5" />
                            Join Meeting
                          </a>
                        </Button>
                      )}
                      {event.htmlLink && (
                        <Button size="sm" variant="ghost" asChild>
                          <a href={event.htmlLink} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                            View in Calendar
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}