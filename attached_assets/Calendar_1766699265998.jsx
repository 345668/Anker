import React from 'react';
import CalendarView from '@/components/networking/CalendarView';

export default function Calendar() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Meeting Calendar</h1>
        <p className="text-slate-600 mt-2">View and manage your investor meetings synced with Google Calendar</p>
      </div>
      
      <CalendarView />
    </div>
  );
}