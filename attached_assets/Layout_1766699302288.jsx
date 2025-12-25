
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { base44 } from '@/api/base44Client';
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  Rocket, 
  Target, 
  Mail, 
  FileText, 
  Settings, 
  Search,
  Bell,
  ChevronDown,
  LogOut,
  User,
  Menu,
  X,
  Sparkles,
  Upload,
  BarChart3,
  MessageSquare,
  TrendingUp,
  Zap,
  Calendar as CalendarIcon
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const navigationItems = {
  founder: [
    { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard' },
    { name: 'Fundraising', icon: TrendingUp, page: 'FundraisingDashboard' },
    { name: 'My Startups', icon: Rocket, page: 'MyStartups' },
    { name: 'divider' },
    { name: 'Investor Matches', icon: Target, page: 'Matches' },
    { name: 'Networking', icon: Users, page: 'Networking' },
    { name: 'Calendar', icon: CalendarIcon, page: 'Calendar' },
    { name: 'divider' },
    { name: 'Deal Rooms', icon: Target, page: 'DealRooms' },
    { name: 'Outreach', icon: Mail, page: 'Outreach' },
    { name: 'Templates', icon: FileText, page: 'Templates' },
    { name: 'divider' },
    { name: 'Analytics', icon: BarChart3, page: 'OutreachAnalytics' },
  ],
  investor: [
    { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard' },
    { name: 'Deal Flow', icon: Rocket, page: 'DealFlow' },
    { name: 'Saved Startups', icon: Target, page: 'SavedStartups' },
  ],
  lead: [
    { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard' },
    { name: 'Pipeline', icon: BarChart3, page: 'Pipeline' },
    { name: 'divider' },
    { name: 'All Startups', icon: Rocket, page: 'AllStartups' },
    { name: 'Investors', icon: Building2, page: 'Investors' },
    { name: 'Contacts', icon: Users, page: 'Contacts' },
    { name: 'Companies', icon: Building2, page: 'Companies' },
    { name: 'divider' },
    { name: 'Deal Flow', icon: Target, page: 'DealFlow' },
    { name: 'Outreach', icon: Mail, page: 'Outreach' },
  ],
  admin: [
    { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard' },
    { name: 'Admin Panel', icon: Zap, page: 'Admin' },
    { name: 'divider' },
    { name: 'Analytics', icon: BarChart3, page: 'Analytics' },
    { name: 'Pipeline', icon: BarChart3, page: 'Pipeline' },
    { name: 'Fundraising', icon: TrendingUp, page: 'FundraisingDashboard' },
    { name: 'divider' },
    { name: 'Startups', icon: Rocket, page: 'AllStartups' },
    { name: 'Investors', icon: Building2, page: 'Investors' },
    { name: 'Contacts', icon: Users, page: 'Contacts' },
    { name: 'Companies', icon: Building2, page: 'Companies' },
    { name: 'divider' },
    { name: 'Matches', icon: Target, page: 'Matches' },
    { name: 'Networking', icon: Users, page: 'Networking' },
    { name: 'Calendar', icon: CalendarIcon, page: 'Calendar' },
    { name: 'divider' },
    { name: 'Deal Flow', icon: Target, page: 'DealFlow' },
    { name: 'Deal Rooms', icon: Target, page: 'DealRooms' },
    { name: 'Outreach', icon: Mail, page: 'Outreach' },
    { name: 'Templates', icon: FileText, page: 'Templates' },
  ],
};

const adminPages = [
  { name: 'Admin Control Panel', icon: Zap, page: 'Admin' },
  { name: 'User Management', icon: Users, page: 'UserManagement' },
  { name: 'Data Import', icon: Upload, page: 'DataImport' },
  { name: 'System Settings', icon: Settings, page: 'Settings' },
];

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
        
        // If authenticated but incomplete onboarding, only redirect from protected pages
        if (!userData.onboarding_completed && !['Onboarding', 'Landing'].includes(currentPageName)) {
          window.location.href = createPageUrl('Onboarding');
        }
      } catch (e) {
        // Not authenticated - redirect to Landing unless already there
        if (currentPageName !== 'Landing') {
          window.location.href = createPageUrl('Landing');
        }
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, [currentPageName]);

  const userRole = user?.user_type || user?.user_role || user?.role || 'founder';
  const navItems = navigationItems[userRole] || navigationItems.founder;

  // Admin-only pages protection
  const adminOnlyPages = ['Admin', 'UserManagement', 'DataImport'];
  useEffect(() => {
    if (adminOnlyPages.includes(currentPageName) && userRole !== 'admin') {
      window.location.href = createPageUrl('Dashboard');
    }
  }, [currentPageName, userRole]);

  const handleLogout = () => {
    base44.auth.logout();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-600">Loading...</span>
        </div>
      </div>
    );
  }

  // Public pages without navigation
  if (['Onboarding', 'Landing'].includes(currentPageName)) {
    return <>{children}</>;
  }

  // Redirect to landing if user not authenticated
  if (!user) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 z-50 transition-transform duration-300 flex flex-col",
        "lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-slate-100">
          <Link to={createPageUrl('Dashboard')} className="flex items-center gap-2">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500 via-pink-500 to-blue-500 rounded-2xl blur-md group-hover:blur-lg transition-all" />
              <div className="relative w-9 h-9 backdrop-blur-xl rounded-2xl bg-gradient-to-br from-purple-600/90 via-pink-600/90 via-orange-500/90 via-yellow-500/90 via-green-500/90 to-blue-600/90 flex items-center justify-center shadow-xl border-2 border-white/60 overflow-hidden">
                <div className="absolute inset-0.5 rounded-2xl bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
                <Zap className="w-5 h-5 text-white relative z-10" />
              </div>
            </div>
            <span className="text-lg font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">SynergyAI</span>
          </Link>
          <button 
            className="ml-auto lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item, index) => {
            if (item.name === 'divider') {
              return <div key={`divider-${index}`} className="h-px bg-slate-200 my-3" />;
            }

            const isActive = currentPageName === item.page;
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive 
                    ? "bg-indigo-50 text-indigo-700" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-indigo-600" : "text-slate-400")} />
                {item.name}
              </Link>
            );
          })}

          {/* Admin Section - Only for Admin Users */}
          {userRole === 'admin' && (
            <>
              <div className="h-px bg-slate-200 my-3" />
              <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Admin Panel
              </div>
              {adminPages.map((item) => {
                const isActive = currentPageName === item.page;
                return (
                  <Link
                    key={item.page}
                    to={createPageUrl(item.page)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                      isActive 
                        ? "bg-red-50 text-red-700" 
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon className={cn("w-5 h-5", isActive ? "text-red-600" : "text-slate-400")} />
                    {item.name}
                  </Link>
                );
              })}
            </>
          )}

          {/* Profile & Settings at bottom */}
          <div className="h-px bg-slate-200 my-3" />
          <Link
            to={createPageUrl('Profile')}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
              currentPageName === 'Profile'
                ? "bg-indigo-50 text-indigo-700" 
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            )}
            onClick={() => setSidebarOpen(false)}
          >
            <User className={cn("w-5 h-5", currentPageName === 'Profile' ? "text-indigo-600" : "text-slate-400")} />
            Profile
          </Link>
          {userRole !== 'admin' && (
            <Link
              to={createPageUrl('Settings')}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                currentPageName === 'Settings'
                  ? "bg-indigo-50 text-indigo-700" 
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
              onClick={() => setSidebarOpen(false)}
            >
              <Settings className={cn("w-5 h-5", currentPageName === 'Settings' ? "text-indigo-600" : "text-slate-400")} />
              Settings
            </Link>
          )}
        </nav>

        {/* Bottom section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 px-2">
            <Avatar className="h-9 w-9">
              <AvatarImage src={user?.profile_image} />
              <AvatarFallback className="bg-indigo-100 text-indigo-700 text-sm">
                {user?.full_name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user?.full_name || 'User'}</p>
              <p className="text-xs text-slate-500 capitalize">{userRole}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-4 lg:px-6 sticky top-0 z-30">
          <button 
            className="lg:hidden mr-4"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6 text-slate-600" />
          </button>

          {/* Search */}
          <div className="flex-1 max-w-xl">
            <Link 
              to={createPageUrl('Search')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg text-slate-500 hover:bg-slate-200 transition-colors"
            >
              <Search className="w-4 h-4" />
              <span className="text-sm">Search investors, startups, contacts...</span>
            </Link>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2 ml-4">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5 text-slate-600" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.profile_image} />
                    <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs">
                      {user?.full_name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.full_name}</p>
                  <p className="text-xs text-slate-500">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to={createPageUrl('Profile')} className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={createPageUrl('Settings')} className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
