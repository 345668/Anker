import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { 
  Shield, Upload, Users, Settings, Database, 
  Activity, BarChart3, FileText, Loader2, ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const GlobalStyles = () => (
  <style>{`
    @keyframes synergyGradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
  `}</style>
);

function LiquidBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-red-50/30 to-purple-50/30" />
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,rgba(15,23,42,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.35)_1px,transparent_1px)] [background-size:64px_64px]" />
      
      <div className="absolute -top-28 left-1/4 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-red-400/30 to-purple-400/25 blur-3xl" />
      <div className="absolute top-1/4 right-1/4 h-[480px] w-[480px] rounded-full bg-gradient-to-br from-orange-400/20 to-pink-400/18 blur-3xl" />
      <div className="absolute -bottom-28 left-1/3 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-purple-400/18 to-red-400/18 blur-3xl" />
    </div>
  );
}

function GlassCard({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "relative rounded-3xl border-2 border-white/60",
        "bg-gradient-to-br from-white/55 to-white/30",
        "backdrop-blur-2xl shadow-lg hover:shadow-xl transition-all",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function UnderGlow({ className }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 rounded-[28px]",
        "bg-gradient-to-br from-red-400/30 via-purple-400/20 to-pink-400/25",
        "blur-3xl opacity-35",
        className
      )}
    />
  );
}

const adminFeatures = [
  {
    title: 'Data Import',
    description: 'Import investor data from CSV files or Folk CRM integration',
    icon: Upload,
    page: 'DataImport',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    title: 'User Management',
    description: 'Manage user accounts, roles, and permissions',
    icon: Users,
    page: 'UserManagement',
    color: 'from-purple-500 to-pink-500',
  },
  {
    title: 'System Settings',
    description: 'Configure application settings and integrations',
    icon: Settings,
    page: 'Settings',
    color: 'from-orange-500 to-red-500',
  },
  {
    title: 'Analytics',
    description: 'View system-wide analytics and performance metrics',
    icon: BarChart3,
    page: 'Analytics',
    color: 'from-green-500 to-emerald-500',
  },
  {
    title: 'Database',
    description: 'Manage entities, contacts, and investor firms',
    icon: Database,
    page: 'Investors',
    color: 'from-indigo-500 to-blue-500',
  },
  {
    title: 'Activity Logs',
    description: 'Monitor user activities and system events',
    icon: Activity,
    page: 'Pipeline',
    color: 'from-pink-500 to-rose-500',
  },
];

export default function Admin() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalFirms: 0,
    totalContacts: 0,
    totalStartups: 0,
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);

        // Redirect if not admin
        if (userData.user_type !== 'admin' && userData.user_role !== 'admin') {
          window.location.href = '/Dashboard';
          return;
        }

        // Load stats
        const [users, firms, contacts, startups] = await Promise.all([
          base44.entities.User.list('-created_date', 1000),
          base44.entities.InvestorFirm.list('-created_date', 1000),
          base44.entities.Contact.list('-created_date', 1000),
          base44.entities.Startup.list('-created_date', 1000),
        ]);

        setStats({
          totalUsers: users.length,
          totalFirms: firms.length,
          totalContacts: contacts.length,
          totalStartups: startups.length,
        });
      } catch (error) {
        console.error('Error loading admin data:', error);
        window.location.href = '/Dashboard';
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="relative min-h-[60vh]">
        <GlobalStyles />
        <LiquidBackground />
        <div className="flex h-[60vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading admin panel...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <GlobalStyles />
      <LiquidBackground />

      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="relative">
          <UnderGlow className="opacity-25" />
          <GlassCard className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br from-red-400/30 via-purple-400/20 to-pink-400/25 blur-2xl opacity-40" />
                  <div className="h-16 w-16 rounded-2xl border-2 border-white/60 bg-gradient-to-br from-red-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <Shield className="h-8 w-8 text-white" />
                  </div>
                </div>
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30 px-3 py-1 backdrop-blur-2xl text-xs font-semibold text-slate-700 shadow-lg mb-2">
                    <Shield className="h-3 w-3" />
                    Admin Access
                  </div>
                  <h1 className="text-3xl font-bold text-slate-900">
                    Admin{' '}
                    <span className="bg-gradient-to-r from-red-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                      Control Panel
                    </span>
                  </h1>
                  <p className="text-slate-600 mt-1">
                    Manage system-wide settings, users, and data
                  </p>
                </div>
              </div>
              <Badge className="bg-red-100 text-red-700 border-2 border-white/60 rounded-full">
                Administrator
              </Badge>
            </div>
          </GlassCard>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-blue-600' },
            { label: 'Investor Firms', value: stats.totalFirms, icon: Database, color: 'text-purple-600' },
            { label: 'Contacts', value: stats.totalContacts, icon: FileText, color: 'text-orange-600' },
            { label: 'Startups', value: stats.totalStartups, icon: Activity, color: 'text-green-600' },
          ].map((stat, idx) => (
            <div key={idx} className="relative">
              <UnderGlow className="opacity-20" />
              <GlassCard className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">{stat.label}</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
                  </div>
                  <div className={cn("h-10 w-10 rounded-xl border-2 border-white/60 bg-white/55 backdrop-blur-2xl flex items-center justify-center", stat.color)}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                </div>
              </GlassCard>
            </div>
          ))}
        </div>

        {/* Admin Features Grid */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Admin Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {adminFeatures.map((feature, idx) => (
              <Link key={idx} to={`/${feature.page}`} className="block">
                <div className="relative h-full">
                  <UnderGlow className="opacity-25" />
                  <GlassCard className="p-6 h-full hover:border-white/80 transition-all group cursor-pointer">
                    <div className="flex flex-col h-full">
                      <div className={cn(
                        "h-12 w-12 rounded-2xl border-2 border-white/60 flex items-center justify-center mb-4 shadow-lg",
                        "bg-gradient-to-br", feature.color
                      )}>
                        <feature.icon className="h-6 w-6 text-white" />
                      </div>
                      <h3 className="font-semibold text-slate-900 mb-2 group-hover:text-slate-700 transition-colors">
                        {feature.title}
                      </h3>
                      <p className="text-sm text-slate-600 mb-4 flex-1">
                        {feature.description}
                      </p>
                      <div className="flex items-center text-sm text-slate-500 group-hover:text-slate-700 transition-colors">
                        <span>Open</span>
                        <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Security Notice */}
        <div className="relative">
          <UnderGlow className="opacity-20 blur-2xl" />
          <GlassCard className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-xl border-2 border-white/60 bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Shield className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">Security Notice</p>
                <p className="text-xs text-slate-600 mt-1">
                  You are accessing privileged admin features. All actions are logged and monitored. 
                  Please use admin privileges responsibly.
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}