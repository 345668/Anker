import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Users, Building2, Briefcase, Target, UserPlus, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AdminLayout from "./AdminLayout";

const statIcons: Record<string, any> = {
  users: Users,
  investors: UserPlus,
  startups: Building2,
  deals: Target,
  contacts: Users,
  firms: Briefcase,
};

const statColors: Record<string, string> = {
  users: "rgb(142,132,247)",
  investors: "rgb(196,227,230)",
  startups: "rgb(254,212,92)",
  deals: "rgb(251,194,213)",
  contacts: "rgb(142,132,247)",
  firms: "rgb(196,227,230)",
};

export default function Analytics() {
  const { data: analytics, isLoading } = useQuery<{
    counts: Record<string, number>;
    recentActivity: any[];
    recentSyncs: any[];
  }>({
    queryKey: ["/api/admin/analytics"],
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 text-[rgb(142,132,247)] animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Analytics</h1>
          <p className="text-white/60">View system-wide analytics and performance metrics</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {analytics?.counts && Object.entries(analytics.counts).map(([key, value]) => {
            const Icon = statIcons[key] || Database;
            const color = statColors[key] || "rgb(142,132,247)";
            
            return (
              <Card 
                key={key}
                className="bg-white/5 border-white/10"
                data-testid={`stat-${key}`}
              >
                <CardContent className="p-4">
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                    style={{ backgroundColor: `${color}20` }}
                  >
                    <Icon className="w-5 h-5" style={{ color }} />
                  </div>
                  <div className="text-3xl font-bold text-white">{value}</div>
                  <div className="text-white/50 text-sm capitalize">{key}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {analytics?.recentActivity && analytics.recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {analytics.recentActivity.map((activity: any) => (
                    <div 
                      key={activity.id}
                      className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                    >
                      <div>
                        <div className="text-white capitalize">
                          {activity.action} {activity.entityType}
                        </div>
                        <div className="text-white/40 text-sm">{activity.description}</div>
                      </div>
                      <div className="text-white/40 text-xs">
                        {activity.createdAt && new Date(activity.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-white/40">
                  No recent activity
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Data Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {analytics?.counts && (
                <div className="space-y-4">
                  {Object.entries(analytics.counts).map(([key, value]) => {
                    const total = Object.values(analytics.counts).reduce((a, b) => a + b, 0);
                    const percentage = total > 0 ? (value / total) * 100 : 0;
                    const color = statColors[key] || "rgb(142,132,247)";
                    
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-white/60 capitalize text-sm">{key}</span>
                          <span className="text-white text-sm">{value}</span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-500"
                            style={{ 
                              width: `${percentage}%`,
                              backgroundColor: color
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
