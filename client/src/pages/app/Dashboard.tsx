import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  Rocket,
  Building2,
  Mail,
  Eye,
  MessageSquare,
  Zap,
  Plus,
  ArrowRight
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "wouter";

export default function Dashboard() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        window.location.href = "/app";
      } else if (user && !user.onboardingCompleted) {
        window.location.href = "/app/onboarding";
      }
    }
  }, [isLoading, isAuthenticated, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-600 dark:text-slate-400">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isFounder = user.userType === 'founder';
  const isInvestor = user.userType === 'investor';

  const founderStats = [
    { 
      title: "Pipeline Value", 
      value: "$2.4M", 
      change: "+12%", 
      trend: "up",
      icon: DollarSign,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100 dark:bg-emerald-900/30"
    },
    { 
      title: "Active Investors", 
      value: "24", 
      change: "+3", 
      trend: "up",
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-100 dark:bg-blue-900/30"
    },
    { 
      title: "Matches", 
      value: "156", 
      change: "+28", 
      trend: "up",
      icon: Target,
      color: "text-purple-600",
      bgColor: "bg-purple-100 dark:bg-purple-900/30"
    },
    { 
      title: "Response Rate", 
      value: "68%", 
      change: "+5%", 
      trend: "up",
      icon: Mail,
      color: "text-orange-600",
      bgColor: "bg-orange-100 dark:bg-orange-900/30"
    },
  ];

  const investorStats = [
    { 
      title: "Portfolio Value", 
      value: "$12.8M", 
      change: "+8%", 
      trend: "up",
      icon: DollarSign,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100 dark:bg-emerald-900/30"
    },
    { 
      title: "Deal Flow", 
      value: "47", 
      change: "+12", 
      trend: "up",
      icon: Briefcase,
      color: "text-blue-600",
      bgColor: "bg-blue-100 dark:bg-blue-900/30"
    },
    { 
      title: "Active Deals", 
      value: "8", 
      change: "+2", 
      trend: "up",
      icon: Target,
      color: "text-purple-600",
      bgColor: "bg-purple-100 dark:bg-purple-900/30"
    },
    { 
      title: "Portfolio Cos", 
      value: "15", 
      change: "+1", 
      trend: "up",
      icon: Building2,
      color: "text-orange-600",
      bgColor: "bg-orange-100 dark:bg-orange-900/30"
    },
  ];

  const stats = isFounder ? founderStats : investorStats;

  const pipelineStages = isFounder ? [
    { label: "Identified", count: 156, color: "bg-slate-400" },
    { label: "Contacted", count: 89, color: "bg-blue-500" },
    { label: "Responded", count: 45, color: "bg-purple-500" },
    { label: "Meeting Set", count: 24, color: "bg-orange-500" },
    { label: "Due Diligence", count: 8, color: "bg-emerald-500" },
    { label: "Term Sheet", count: 3, color: "bg-green-600" },
  ] : [
    { label: "Sourced", count: 47, color: "bg-slate-400" },
    { label: "First Review", count: 28, color: "bg-blue-500" },
    { label: "Deep Dive", count: 12, color: "bg-purple-500" },
    { label: "Due Diligence", count: 8, color: "bg-orange-500" },
    { label: "Term Sheet", count: 4, color: "bg-emerald-500" },
    { label: "Closed", count: 2, color: "bg-green-600" },
  ];

  const maxPipeline = Math.max(...pipelineStages.map(s => s.count));

  const recentActivity = [
    { type: "match", title: "New investor match", description: isFounder ? "Sequoia Capital matched with your profile" : "TechStartup AI matched your criteria", time: "2 hours ago", icon: Target },
    { type: "meeting", title: "Meeting scheduled", description: isFounder ? "Call with Andreessen Horowitz" : "Call with Founder Labs", time: "4 hours ago", icon: Calendar },
    { type: "document", title: "Document viewed", description: isFounder ? "Pitch deck viewed by Accel Partners" : "Data room accessed by team", time: "Yesterday", icon: Eye },
    { type: "outreach", title: isFounder ? "Outreach response" : "New pitch received", description: isFounder ? "Reply from Index Ventures" : "SaaS startup in your focus area", time: "Yesterday", icon: MessageSquare },
  ];

  const quickActions = isFounder ? [
    { title: "Browse Investors", description: "Find matching investors for your startup", icon: Users, color: "text-purple-600", href: "/app/investors" },
    { title: "Schedule Meeting", description: "Book time with potential investors", icon: Calendar, color: "text-blue-600", href: "/app/calendar" },
    { title: "View Pipeline", description: "Track your fundraising progress", icon: TrendingUp, color: "text-emerald-600", href: "/app/pipeline" },
    { title: "Update Pitch Deck", description: "Keep your materials fresh", icon: Briefcase, color: "text-orange-600", href: "/app/documents" },
  ] : [
    { title: "Browse Deals", description: "Explore new investment opportunities", icon: Rocket, color: "text-purple-600", href: "/app/deals" },
    { title: "Review Pipeline", description: "Manage your active deals", icon: TrendingUp, color: "text-blue-600", href: "/app/pipeline" },
    { title: "Portfolio", description: "Track your investments", icon: Building2, color: "text-emerald-600", href: "/app/portfolio" },
    { title: "Schedule", description: "Manage meetings with founders", icon: Calendar, color: "text-orange-600", href: "/app/calendar" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center px-6 sticky top-0 z-30">
        <Link href="/app/dashboard" className="flex items-center gap-2 mr-8" data-testid="link-dashboard-home">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-slate-900 dark:text-white">Anker Platform</span>
        </Link>

        <div className="flex-1 max-w-xl">
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
            <Search className="w-4 h-4" />
            <span className="text-sm">Search {isFounder ? 'investors, contacts...' : 'startups, deals...'}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 ml-auto">
          <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
            <Bell className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2" data-testid="button-user-menu">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs">
                    {user.firstName?.charAt(0) || user.email?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:block">
                  {user.firstName}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user.firstName} {user.lastName}</p>
                <p className="text-xs text-slate-500">{user.email}</p>
                <Badge variant="secondary" className="mt-1 text-xs">
                  {user.userType === 'founder' ? 'Founder' : 'Investor'}
                </Badge>
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="text-welcome">
                Welcome back, {user.firstName || 'there'}
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                {isFounder ? "Here's your fundraising progress" : "Here's your deal flow overview"}
              </p>
            </div>
            <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700" data-testid="button-primary-action">
              <Plus className="w-4 h-4 mr-2" />
              {isFounder ? 'Add Investor' : 'Add Deal'}
            </Button>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <Card className="dark:bg-slate-800 dark:border-slate-700">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                        <stat.icon className={`w-5 h-5 ${stat.color}`} />
                      </div>
                      <div className={`flex items-center gap-1 text-sm ${stat.trend === 'up' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {stat.trend === 'up' ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <ArrowDownRight className="w-4 h-4" />
                        )}
                        {stat.change}
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">{stat.title}</div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3 mb-8">
            <Card className="lg:col-span-2 dark:bg-slate-800 dark:border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="dark:text-white">Pipeline Overview</CardTitle>
                    <CardDescription className="dark:text-slate-400">
                      {isFounder ? 'Your fundraising funnel' : 'Deal flow stages'}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="dark:border-slate-600 dark:text-slate-300">
                    <Activity className="w-3 h-3 mr-1" />
                    Live
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pipelineStages.map((stage) => (
                    <div key={stage.label} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{stage.label}</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{stage.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${stage.color} transition-all duration-500`}
                          style={{ width: `${(stage.count / maxPipeline) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="dark:bg-slate-800 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="dark:text-white">Recent Activity</CardTitle>
                <CardDescription className="dark:text-slate-400">Latest updates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivity.map((item, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                        <item.icon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.description}</p>
                        <span className="text-xs text-slate-400 dark:text-slate-500">{item.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Quick Actions</CardTitle>
              <CardDescription className="dark:text-slate-400">Common tasks and shortcuts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {quickActions.map((action, index) => (
                  <Link key={index} href={action.href}>
                    <Button
                      variant="outline"
                      className="w-full justify-start h-auto py-4 px-4 dark:border-slate-700 dark:hover:bg-slate-700"
                      data-testid={`button-action-${action.title.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <action.icon className={`w-5 h-5 mr-3 ${action.color}`} />
                      <div className="text-left">
                        <div className="font-medium text-slate-900 dark:text-white">{action.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{action.description}</div>
                      </div>
                    </Button>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
