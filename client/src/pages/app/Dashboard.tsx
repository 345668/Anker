import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Link } from "wouter";
import AppLayout from "@/components/AppLayout";
import { 
  TrendingUp, 
  Target, 
  Users, 
  ArrowUpRight,
  DollarSign,
  Briefcase,
  Calendar,
  Mail,
  Eye,
  MessageSquare,
  Plus,
  Rocket,
  Building2,
  BookUser,
  FolderOpen,
  ArrowRight
} from "lucide-react";

export default function Dashboard() {
  const { user, isLoading, isAuthenticated } = useAuth();

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
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isFounder = user.userType === 'founder';

  const founderStats = [
    { title: "Pipeline Value", value: "$2.4M", change: "+12%", icon: DollarSign, color: "rgb(196, 227, 230)" },
    { title: "Active Investors", value: "24", change: "+3", icon: Users, color: "rgb(142, 132, 247)" },
    { title: "Matches", value: "156", change: "+28", icon: Target, color: "rgb(251, 194, 213)" },
    { title: "Response Rate", value: "68%", change: "+5%", icon: Mail, color: "rgb(254, 212, 92)" },
  ];

  const investorStats = [
    { title: "Portfolio Value", value: "$12.8M", change: "+8%", icon: DollarSign, color: "rgb(196, 227, 230)" },
    { title: "Deal Flow", value: "47", change: "+12", icon: Briefcase, color: "rgb(142, 132, 247)" },
    { title: "Active Deals", value: "8", change: "+2", icon: Target, color: "rgb(251, 194, 213)" },
    { title: "Portfolio Cos", value: "15", change: "+1", icon: Building2, color: "rgb(254, 212, 92)" },
  ];

  const stats = isFounder ? founderStats : investorStats;

  const pipelineStages = isFounder ? [
    { label: "Identified", count: 156, color: "rgb(142, 132, 247)" },
    { label: "Contacted", count: 89, color: "rgb(196, 227, 230)" },
    { label: "Responded", count: 45, color: "rgb(251, 194, 213)" },
    { label: "Meeting Set", count: 24, color: "rgb(254, 212, 92)" },
    { label: "Due Diligence", count: 8, color: "rgb(142, 132, 247)" },
    { label: "Term Sheet", count: 3, color: "rgb(196, 227, 230)" },
  ] : [
    { label: "Sourced", count: 47, color: "rgb(142, 132, 247)" },
    { label: "First Review", count: 28, color: "rgb(196, 227, 230)" },
    { label: "Deep Dive", count: 12, color: "rgb(251, 194, 213)" },
    { label: "Due Diligence", count: 8, color: "rgb(254, 212, 92)" },
    { label: "Term Sheet", count: 4, color: "rgb(142, 132, 247)" },
    { label: "Closed", count: 2, color: "rgb(196, 227, 230)" },
  ];

  const maxPipeline = Math.max(...pipelineStages.map(s => s.count));

  const recentActivity = [
    { type: "match", title: "New investor match", description: isFounder ? "Sequoia Capital matched with your profile" : "TechStartup AI matched your criteria", time: "2 hours ago", icon: Target },
    { type: "meeting", title: "Meeting scheduled", description: isFounder ? "Call with Andreessen Horowitz" : "Call with Founder Labs", time: "4 hours ago", icon: Calendar },
    { type: "document", title: "Document viewed", description: isFounder ? "Pitch deck viewed by Accel Partners" : "Data room accessed by team", time: "Yesterday", icon: Eye },
    { type: "outreach", title: isFounder ? "Outreach response" : "New pitch received", description: isFounder ? "Reply from Index Ventures" : "SaaS startup in your focus area", time: "Yesterday", icon: MessageSquare },
  ];

  const quickActions = isFounder ? [
    { title: "My Startups", description: "Manage your company profiles", icon: Rocket, color: "rgb(142, 132, 247)", href: "/app/my-startups" },
    { title: "Browse Investors", description: "Find matching investors", icon: Users, color: "rgb(196, 227, 230)", href: "/app/investors" },
    { title: "My Contacts", description: "Manage your network", icon: BookUser, color: "rgb(251, 194, 213)", href: "/app/contacts" },
    { title: "View Pipeline", description: "Track fundraising progress", icon: TrendingUp, color: "rgb(254, 212, 92)", href: "/app/pipeline" },
    { title: "Deal Rooms", description: "Share documents", icon: FolderOpen, color: "rgb(142, 132, 247)", href: "/app/deal-rooms" },
  ] : [
    { title: "Browse Deals", description: "Explore opportunities", icon: Rocket, color: "rgb(142, 132, 247)", href: "/app/deals" },
    { title: "My Contacts", description: "Manage your network", icon: BookUser, color: "rgb(196, 227, 230)", href: "/app/contacts" },
    { title: "Portfolio", description: "Track investments", icon: Building2, color: "rgb(251, 194, 213)", href: "/app/portfolio" },
    { title: "Review Pipeline", description: "Manage active deals", icon: TrendingUp, color: "rgb(254, 212, 92)", href: "/app/pipeline" },
    { title: "Deal Rooms", description: "Access data rooms", icon: FolderOpen, color: "rgb(142, 132, 247)", href: "/app/deal-rooms" },
  ];

  return (
    <AppLayout 
      title={`Welcome ${user.firstName || 'back'}`}
      subtitle={isFounder ? "Here's your fundraising progress" : "Here's your deal flow overview"}
      heroHeight="35vh"
    >
      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-12">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="p-6 rounded-2xl border border-white/10 bg-white/5"
                data-testid={`card-stat-${index}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${stat.color}20` }}
                  >
                    <stat.icon className="w-6 h-6" style={{ color: stat.color }} />
                  </div>
                  <div className="flex items-center gap-1 text-sm text-[rgb(196,227,230)]">
                    <ArrowUpRight className="w-4 h-4" />
                    {stat.change}
                  </div>
                </div>
                <div className="text-3xl font-light text-white mb-1">{stat.value}</div>
                <div className="text-sm text-white/50">{stat.title}</div>
              </motion.div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3 mb-12">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="lg:col-span-2 p-6 rounded-2xl border border-white/10 bg-white/5"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-light text-white mb-1">Pipeline Overview</h3>
                  <p className="text-sm text-white/40">
                    {isFounder ? 'Your fundraising funnel' : 'Deal flow stages'}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-medium tracking-wider uppercase border border-white/20 text-white/60 bg-white/5">
                  Live
                </span>
              </div>
              <div className="space-y-4">
                {pipelineStages.map((stage) => (
                  <div key={stage.label} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/70">{stage.label}</span>
                      <span className="font-medium text-white">{stage.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(stage.count / maxPipeline) * 100}%` }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="p-6 rounded-2xl border border-white/10 bg-white/5"
            >
              <h3 className="text-xl font-light text-white mb-1">Recent Activity</h3>
              <p className="text-sm text-white/40 mb-6">Latest updates</p>
              <div className="space-y-4">
                {recentActivity.map((item, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: 'rgba(142, 132, 247, 0.2)' }}
                    >
                      <item.icon className="w-5 h-5 text-[rgb(142,132,247)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{item.title}</p>
                      <p className="text-xs text-white/40 truncate">{item.description}</p>
                      <span className="text-xs text-white/30">{item.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="p-6 rounded-2xl border border-white/10 bg-white/5"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-light text-white mb-1">Quick Actions</h3>
                <p className="text-sm text-white/40">Common tasks and shortcuts</p>
              </div>
              <button className="flex items-center gap-2 px-4 py-2 rounded-full bg-[rgb(142,132,247)] text-white text-sm font-medium hover:bg-[rgb(122,112,227)] transition-colors" data-testid="button-add-new">
                <Plus className="w-4 h-4" />
                {isFounder ? 'Add Investor' : 'Add Deal'}
              </button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {quickActions.map((action, index) => (
                <Link key={index} href={action.href}>
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer group"
                    data-testid={`button-action-${action.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                      style={{ backgroundColor: `${action.color}20` }}
                    >
                      <action.icon className="w-5 h-5" style={{ color: action.color }} />
                    </div>
                    <div className="font-medium text-white text-sm mb-1">{action.title}</div>
                    <div className="text-xs text-white/40">{action.description}</div>
                    <ArrowRight className="w-4 h-4 text-white/30 mt-2 group-hover:text-white/60 transition-colors" />
                  </motion.div>
                </Link>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}
