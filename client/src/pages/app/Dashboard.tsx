import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  LayoutDashboard, 
  TrendingUp, 
  Target, 
  Users, 
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  DollarSign,
  Briefcase,
  Calendar,
  Bell,
  LogOut,
  ChevronDown,
  Search,
  Menu,
  Zap
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Dashboard() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = "/app";
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-600">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const stats = [
    { 
      title: "Total Pipeline", 
      value: "$2.4M", 
      change: "+12.5%", 
      trend: "up",
      icon: DollarSign,
      color: "text-green-600",
      bgColor: "bg-green-100"
    },
    { 
      title: "Active Deals", 
      value: "24", 
      change: "+3", 
      trend: "up",
      icon: Briefcase,
      color: "text-blue-600",
      bgColor: "bg-blue-100"
    },
    { 
      title: "Investor Matches", 
      value: "156", 
      change: "+28", 
      trend: "up",
      icon: Target,
      color: "text-purple-600",
      bgColor: "bg-purple-100"
    },
    { 
      title: "Response Rate", 
      value: "68%", 
      change: "-2%", 
      trend: "down",
      icon: Activity,
      color: "text-orange-600",
      bgColor: "bg-orange-100"
    },
  ];

  const recentActivity = [
    { type: "match", title: "New investor match", description: "Sequoia Capital matched with your profile", time: "2 hours ago" },
    { type: "meeting", title: "Meeting scheduled", description: "Call with Andreessen Horowitz", time: "4 hours ago" },
    { type: "document", title: "Document viewed", description: "Pitch deck viewed by Accel Partners", time: "Yesterday" },
    { type: "outreach", title: "Outreach response", description: "Reply from Index Ventures", time: "Yesterday" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 sticky top-0 z-30">
        <a href="/app/dashboard" className="flex items-center gap-2 mr-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-slate-900">Anker Platform</span>
        </a>

        <div className="flex-1 max-w-xl">
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg text-slate-500">
            <Search className="w-4 h-4" />
            <span className="text-sm">Search investors, startups, contacts...</span>
          </div>
        </div>

        <div className="flex items-center gap-4 ml-auto">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="w-5 h-5 text-slate-600" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs">
                    {user.firstName?.charAt(0) || user.email?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout()} className="text-red-600" data-testid="button-logout">
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-welcome">
              Welcome back, {user.firstName || 'there'}
            </h1>
            <p className="text-slate-600">Here's what's happening with your fundraising</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                        <stat.icon className={`w-5 h-5 ${stat.color}`} />
                      </div>
                      <div className={`flex items-center gap-1 text-sm ${stat.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                        {stat.trend === 'up' ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <ArrowDownRight className="w-4 h-4" />
                        )}
                        {stat.change}
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                    <div className="text-sm text-slate-500">{stat.title}</div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Your latest updates and notifications</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivity.map((item, index) => (
                    <div key={index} className="flex items-start gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <Activity className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="text-sm text-slate-500 truncate">{item.description}</p>
                      </div>
                      <span className="text-xs text-slate-400 whitespace-nowrap">{item.time}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common tasks and shortcuts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  <Button variant="outline" className="justify-start h-auto py-4" data-testid="button-browse-investors">
                    <Users className="w-5 h-5 mr-3 text-purple-600" />
                    <div className="text-left">
                      <div className="font-medium">Browse Investors</div>
                      <div className="text-xs text-slate-500">Find matching investors for your startup</div>
                    </div>
                  </Button>
                  <Button variant="outline" className="justify-start h-auto py-4" data-testid="button-schedule-meeting">
                    <Calendar className="w-5 h-5 mr-3 text-blue-600" />
                    <div className="text-left">
                      <div className="font-medium">Schedule Meeting</div>
                      <div className="text-xs text-slate-500">Book time with potential investors</div>
                    </div>
                  </Button>
                  <Button variant="outline" className="justify-start h-auto py-4" data-testid="button-view-pipeline">
                    <TrendingUp className="w-5 h-5 mr-3 text-green-600" />
                    <div className="text-left">
                      <div className="font-medium">View Pipeline</div>
                      <div className="text-xs text-slate-500">Track your fundraising progress</div>
                    </div>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
