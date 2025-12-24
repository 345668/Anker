import { cn } from "@/lib/utils";

export default function StatCard({ title, value, change, changeType, icon: Icon, iconColor }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
          {change && (
            <div className="flex items-center gap-1 mt-2">
              <span className={cn(
                "text-sm font-medium",
                changeType === 'positive' ? 'text-emerald-600' : 'text-red-500'
              )}>
                {changeType === 'positive' ? '+' : ''}{change}
              </span>
              <span className="text-xs text-slate-400">vs last month</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center",
            iconColor || "bg-indigo-100"
          )}>
            <Icon className={cn(
              "w-6 h-6",
              iconColor?.includes('indigo') ? 'text-indigo-600' : 
              iconColor?.includes('emerald') ? 'text-emerald-600' :
              iconColor?.includes('amber') ? 'text-amber-600' :
              iconColor?.includes('violet') ? 'text-violet-600' :
              'text-indigo-600'
            )} />
          </div>
        )}
      </div>
    </div>
  );
}