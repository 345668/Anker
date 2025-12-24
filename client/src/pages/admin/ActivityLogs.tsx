import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Activity, Search } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AdminLayout from "./AdminLayout";
import type { ActivityLog } from "@shared/schema";

const actionColors: Record<string, string> = {
  created: "rgb(196,227,230)",
  updated: "rgb(254,212,92)",
  deleted: "rgb(251,194,213)",
  imported: "rgb(142,132,247)",
  synced: "rgb(142,132,247)",
};

export default function ActivityLogs() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading } = useQuery<{ logs: ActivityLog[]; total: number }>({
    queryKey: ["/api/admin/activity-logs"],
  });

  const filteredLogs = data?.logs?.filter(log => {
    const query = searchQuery.toLowerCase();
    return (
      log.action?.toLowerCase().includes(query) ||
      log.entityType?.toLowerCase().includes(query) ||
      log.description?.toLowerCase().includes(query)
    );
  });

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Activity Logs</h1>
          <p className="text-white/60">Monitor user activities and system events</p>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <Input
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
              data-testid="input-search-logs"
            />
          </div>
          <div className="text-white/40 text-sm">
            {data?.total || 0} total events
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-[rgb(142,132,247)] animate-spin" />
          </div>
        ) : filteredLogs && filteredLogs.length > 0 ? (
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-0">
              <div className="divide-y divide-white/5">
                {filteredLogs.map((log) => (
                  <div 
                    key={log.id}
                    className="flex items-start gap-4 p-4"
                    data-testid={`log-${log.id}`}
                  >
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-1"
                      style={{ 
                        backgroundColor: `${actionColors[log.action] || 'rgb(142,132,247)'}20`
                      }}
                    >
                      <Activity 
                        className="w-5 h-5" 
                        style={{ color: actionColors[log.action] || 'rgb(142,132,247)' }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          className="capitalize border-0"
                          style={{ 
                            backgroundColor: `${actionColors[log.action] || 'rgb(142,132,247)'}20`,
                            color: actionColors[log.action] || 'rgb(142,132,247)'
                          }}
                        >
                          {log.action}
                        </Badge>
                        <span className="text-white/60 text-sm capitalize">{log.entityType}</span>
                        {log.entityId && (
                          <span className="text-white/40 text-xs font-mono">
                            #{log.entityId.slice(0, 8)}
                          </span>
                        )}
                      </div>
                      {log.description && (
                        <p className="text-white/80 text-sm">{log.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                        <span>
                          {log.createdAt && new Date(log.createdAt).toLocaleString()}
                        </span>
                        {log.userId && (
                          <span>User: {log.userId.slice(0, 8)}...</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-white/5 border-white/10">
            <CardContent className="py-12 text-center">
              <Activity className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/40">No activity logs found</p>
              <p className="text-white/30 text-sm mt-1">
                Activity will appear here as actions are performed
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
