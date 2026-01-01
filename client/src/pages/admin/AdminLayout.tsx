import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { 
  Upload, Users, Settings, BarChart3, Database, Activity,
  Menu, X, LogOut, Shield, ChevronRight, Home, Newspaper, Network,
  Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { User } from "@shared/schema";

const adminModules = [
  { path: "/admin", label: "Dashboard", icon: Home },
  { path: "/admin/folk", label: "Folk CRM", icon: Network },
  { path: "/admin/investment-firms", label: "Investment Firms", icon: Building2 },
  { path: "/admin/import", label: "Data Import", icon: Upload },
  { path: "/admin/users", label: "User Management", icon: Users },
  { path: "/admin/newsroom", label: "Newsroom Controls", icon: Newspaper },
  { path: "/admin/settings", label: "System Settings", icon: Settings },
  { path: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { path: "/admin/database", label: "Database", icon: Database },
  { path: "/admin/activity", label: "Activity Logs", icon: Activity },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="text-center p-8">
          <Shield className="w-16 h-16 text-[rgb(251,194,213)] mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-white/60 mb-6">You don't have permission to access the admin console.</p>
          <Link href="/app">
            <Button variant="outline" className="border-white/20 text-white">
              Return to App
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(18,18,18)]">
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/50 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center justify-between px-4 h-16">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-white/60 hover:text-white"
              data-testid="button-mobile-menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link href="/admin" className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-[rgb(142,132,247)]" />
              <span className="font-bold text-white text-lg">Admin Console</span>
            </Link>
          </div>
          
          <div className="flex items-center gap-4">
            <Link href="/app">
              <Button variant="ghost" size="sm" className="text-white/60 hover:text-white">
                <Home className="w-4 h-4 mr-2" />
                Back to App
              </Button>
            </Link>
            <a href="/api/logout">
              <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300">
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </a>
          </div>
        </div>
      </header>

      <div className="flex pt-16">
        <aside className={`
          fixed lg:static inset-y-0 left-0 z-40 w-64 pt-16 lg:pt-0
          bg-black/30 backdrop-blur-md border-r border-white/10
          transform transition-transform duration-300 lg:transform-none
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <nav className="p-4 space-y-1">
            {adminModules.map((module) => {
              const isActive = location === module.path || 
                (module.path !== "/admin" && location.startsWith(module.path));
              return (
                <Link key={module.path} href={module.path}>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 rounded-xl
                      transition-all duration-200
                      ${isActive 
                        ? 'bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)]' 
                        : 'text-white/60 hover:text-white hover:bg-white/5'}
                    `}
                    data-testid={`link-admin-${module.label.toLowerCase().replace(' ', '-')}`}
                  >
                    <module.icon className="w-5 h-5" />
                    <span className="font-medium">{module.label}</span>
                    {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                  </button>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 lg:ml-0 min-h-[calc(100vh-4rem)]">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>

      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
