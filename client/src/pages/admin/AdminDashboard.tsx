import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  Upload, Users, Settings, BarChart3, Database, Activity,
  ChevronRight, RefreshCw
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import AdminLayout from "./AdminLayout";

const modules = [
  { 
    path: "/admin/import", 
    label: "Data Import", 
    icon: Upload, 
    description: "Import investors from CSV files or Folk CRM integration",
    color: "rgb(142,132,247)"
  },
  { 
    path: "/admin/users", 
    label: "User Management", 
    icon: Users, 
    description: "Manage user accounts, roles, and permissions",
    color: "rgb(251,194,213)"
  },
  { 
    path: "/admin/settings", 
    label: "System Settings", 
    icon: Settings, 
    description: "Configure application settings and integrations",
    color: "rgb(142,132,247)"
  },
  { 
    path: "/admin/analytics", 
    label: "Analytics", 
    icon: BarChart3, 
    description: "View system-wide analytics and performance metrics",
    color: "rgb(196,227,230)"
  },
  { 
    path: "/admin/database", 
    label: "Database", 
    icon: Database, 
    description: "Manage entities, contacts, and investor firms",
    color: "rgb(142,132,247)"
  },
  { 
    path: "/admin/activity", 
    label: "Activity Logs", 
    icon: Activity, 
    description: "Monitor user activities and system events",
    color: "rgb(254,212,92)"
  },
];

export default function AdminDashboard() {
  const { data: analytics, isLoading } = useQuery<{
    counts: Record<string, number>;
    recentActivity: any[];
    recentSyncs: any[];
  }>({
    queryKey: ["/api/admin/analytics"],
  });

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
          <p className="text-white/60">Manage your platform settings and data</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-[rgb(142,132,247)] animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
              {analytics?.counts && Object.entries(analytics.counts).map(([key, value]) => (
                <div 
                  key={key}
                  className="bg-white/5 rounded-xl p-4 border border-white/10"
                >
                  <div className="text-2xl font-bold text-white">{value}</div>
                  <div className="text-white/50 text-sm capitalize">{key}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {modules.map((module) => (
                <Link key={module.path} href={module.path}>
                  <Card 
                    className="bg-white/5 border-white/10 hover:bg-white/10 transition-all duration-200 cursor-pointer group"
                    data-testid={`card-admin-${module.label.toLowerCase().replace(' ', '-')}`}
                  >
                    <CardContent className="p-6">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                        style={{ backgroundColor: `${module.color}20` }}
                      >
                        <module.icon 
                          className="w-6 h-6" 
                          style={{ color: module.color }}
                        />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">{module.label}</h3>
                      <p className="text-white/50 text-sm mb-4">{module.description}</p>
                      <div className="flex items-center text-white/60 text-sm group-hover:text-[rgb(142,132,247)] transition-colors">
                        Open <ChevronRight className="w-4 h-4 ml-1" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            {analytics?.recentSyncs && analytics.recentSyncs.length > 0 && (
              <div className="mt-8">
                <h2 className="text-xl font-semibold text-white mb-4">Recent Syncs</h2>
                <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Source</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Type</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Status</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Records</th>
                        <th className="text-left text-white/50 text-sm font-medium px-4 py-3">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.recentSyncs.map((sync: any) => (
                        <tr key={sync.id} className="border-b border-white/5">
                          <td className="px-4 py-3 text-white capitalize">{sync.source}</td>
                          <td className="px-4 py-3 text-white/60">{sync.syncType}</td>
                          <td className="px-4 py-3">
                            <span className={`
                              px-2 py-1 rounded-full text-xs font-medium
                              ${sync.status === 'completed' ? 'bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)]' : ''}
                              ${sync.status === 'in_progress' ? 'bg-[rgb(254,212,92)]/20 text-[rgb(254,212,92)]' : ''}
                              ${sync.status === 'failed' ? 'bg-[rgb(251,194,213)]/20 text-[rgb(251,194,213)]' : ''}
                            `}>
                              {sync.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-white/60">{sync.recordsProcessed || 0}</td>
                          <td className="px-4 py-3 text-white/40 text-sm">
                            {sync.startedAt && new Date(sync.startedAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
