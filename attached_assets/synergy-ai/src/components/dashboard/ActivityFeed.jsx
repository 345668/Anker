import { formatDistanceToNow } from 'date-fns';
import { Mail, Eye, MessageSquare, Calendar, CheckCircle } from 'lucide-react';
import { cn } from "@/lib/utils";

const activityIcons = {
  email_sent: Mail,
  email_opened: Eye,
  email_replied: MessageSquare,
  call_scheduled: Calendar,
  status_change: CheckCircle,
};

const activityColors = {
  email_sent: 'bg-blue-100 text-blue-600',
  email_opened: 'bg-amber-100 text-amber-600',
  email_replied: 'bg-emerald-100 text-emerald-600',
  call_scheduled: 'bg-violet-100 text-violet-600',
  status_change: 'bg-slate-100 text-slate-600',
};

export default function ActivityFeed({ activities = [] }) {
  if (activities.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Recent Activity</h3>
        <div className="text-center py-8">
          <p className="text-slate-500 text-sm">No recent activity</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Recent Activity</h3>
      <div className="space-y-4">
        {activities.map((activity, index) => {
          const Icon = activityIcons[activity.type] || Mail;
          const colorClass = activityColors[activity.type] || activityColors.email_sent;
          
          return (
            <div key={activity.id || index} className="flex items-start gap-3">
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0", colorClass)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900">{activity.subject || activity.content}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatDistanceToNow(new Date(activity.created_date), { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}