import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  Rocket, 
  Users, 
  UserCircle, 
  GitBranch, 
  FolderOpen,
  LogOut,
  Menu,
  X,
  Shield,
  Settings,
  Building2,
  Mail,
  FileText,
  Sparkles,
  Network,
  Search,
  Briefcase,
  Calendar,
  MessageCircle,
  Crown,
  UsersRound,
  TrendingUp,
  PieChart
} from "lucide-react";
import { useState } from "react";
import Secondary from '@/framer/secondary';
import Video from '@/framer/video';
import { NotificationCenter } from "@/components/NotificationCenter";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  showHero?: boolean;
  heroHeight?: string;
  videoUrl?: string;
}

export const videoBackgrounds = {
  dashboard: "https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_30fps.mp4",
  investors: "https://videos.pexels.com/video-files/3191572/3191572-uhd_2560_1440_25fps.mp4",
  contacts: "https://videos.pexels.com/video-files/5077073/5077073-uhd_2560_1440_25fps.mp4",
  startups: "https://videos.pexels.com/video-files/3571264/3571264-uhd_2560_1440_30fps.mp4",
  deals: "https://videos.pexels.com/video-files/7989520/7989520-uhd_2560_1440_25fps.mp4",
  networking: "https://videos.pexels.com/video-files/4065924/4065924-uhd_2560_1440_25fps.mp4",
  outreach: "https://videos.pexels.com/video-files/4488626/4488626-uhd_2560_1440_25fps.mp4",
  templates: "https://videos.pexels.com/video-files/5377684/5377684-uhd_2560_1440_25fps.mp4",
  matches: "https://videos.pexels.com/video-files/4065388/4065388-uhd_2560_1440_25fps.mp4",
  search: "https://videos.pexels.com/video-files/4779866/4779866-uhd_2560_1440_25fps.mp4",
  profile: "https://videos.pexels.com/video-files/3195394/3195394-uhd_2560_1440_25fps.mp4",
  pipeline: "https://videos.pexels.com/video-files/6774101/6774101-uhd_2560_1440_25fps.mp4",
  dealrooms: "https://videos.pexels.com/video-files/7989489/7989489-uhd_2560_1440_25fps.mp4",
  pitchAnalysis: "https://videos.pexels.com/video-files/5377684/5377684-uhd_2560_1440_25fps.mp4",
  firms: "https://videos.pexels.com/video-files/5377700/5377700-uhd_2560_1440_25fps.mp4",
  onboarding: "https://videos.pexels.com/video-files/3129957/3129957-uhd_2560_1440_30fps.mp4",
  interview: "https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_30fps.mp4",
  logistics: "https://videos.pexels.com/video-files/26893828/12028859_1920_1080_24fps.mp4",
  cargoShip: "https://videos.pexels.com/video-files/9339459/9339459-hd_1920_1080_25fps.mp4",
  maritime: "https://videos.pexels.com/video-files/26893767/12028839_1920_1080_24fps.mp4",
  dealFlow: "https://videos.pexels.com/video-files/7989520/7989520-uhd_2560_1440_25fps.mp4",
  lpFunds: "https://videos.pexels.com/video-files/8089726/8089726-uhd_2560_1440_25fps.mp4",
  default: "https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_30fps.mp4",
};

// Consolidated navigation based on audit recommendations
// Founders: Fundraising Workspace + Company Workspace
// Investors: Deal Flow Workspace

const founderNavItems = [
  { label: "Fundraising", href: "/app/workspace", icon: TrendingUp, description: "Pipeline, Matching, Investor Database" },
  { label: "My Company", href: "/app/company", icon: Rocket, description: "Profiles, Data Rooms, Analytics" },
  { label: "Networking", href: "/app/networking", icon: Network, description: "Build Investor Relationships" },
  { label: "Outreach", href: "/app/outreach", icon: Mail, description: "Investor Outreach Campaigns" },
  { label: "Investor CRM", href: "/app/investor-crm", icon: UsersRound, description: "Manage Investor Relationships" },
  { label: "Search", href: "/app/search", icon: Search, description: "Find Investors & Firms" },
  { label: "Teams", href: "/app/teams", icon: Users, description: "Team Management" },
  { label: "Templates", href: "/app/templates", icon: FileText, description: "Document Templates" },
  { label: "Calendar", href: "/app/calendar", icon: Calendar },
  { label: "Profile", href: "/app/profile", icon: Settings },
];

const investorNavItems = [
  { label: "Deal Flow", href: "/app/investor-workspace", icon: Briefcase, description: "Pipeline, Sourcing, Network" },
  { label: "Fund Management", href: "/app/fund-management", icon: PieChart, description: "Portfolio & LP Management" },
  { label: "Institutional", href: "/app/institutional", icon: Building2, description: "LP Reporting & Analytics" },
  { label: "Search", href: "/app/search", icon: Search, description: "Find Startups & Founders" },
  { label: "Teams", href: "/app/teams", icon: Users, description: "Team Management" },
  { label: "Calendar", href: "/app/calendar", icon: Calendar },
  { label: "Profile", href: "/app/profile", icon: Settings },
];

const defaultNavItems = [
  { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
  { label: "Fundraising", href: "/app/workspace", icon: TrendingUp },
  { label: "My Company", href: "/app/company", icon: Rocket },
  { label: "Deal Flow", href: "/app/investor-workspace", icon: Briefcase },
  { label: "Institutional", href: "/app/institutional", icon: Building2 },
  { label: "Networking", href: "/app/networking", icon: Network },
  { label: "Outreach", href: "/app/outreach", icon: Mail },
  { label: "Investor CRM", href: "/app/investor-crm", icon: UsersRound },
  { label: "Fund Management", href: "/app/fund-management", icon: PieChart },
  { label: "Search", href: "/app/search", icon: Search },
  { label: "Teams", href: "/app/teams", icon: Users },
  { label: "Templates", href: "/app/templates", icon: FileText },
  { label: "Calendar", href: "/app/calendar", icon: Calendar },
  { label: "Profile", href: "/app/profile", icon: Settings },
];

export default function AppLayout({ 
  children, 
  title, 
  subtitle, 
  showHero = true,
  heroHeight = "55vh",
  videoUrl = videoBackgrounds.default
}: AppLayoutProps) {
  const [location] = useLocation();
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Select navigation based on user type (founder/investor)
  const navItems = user?.userType === 'investor' 
    ? investorNavItems 
    : user?.userType === 'founder' 
      ? founderNavItems 
      : defaultNavItems;

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="min-h-screen bg-[rgb(18,18,18)]">
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="fixed top-0 left-0 right-0 z-50 px-6 py-4 bg-[rgb(18,18,18)]/80 backdrop-blur-md border-b border-white/10"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <Link href="/" className="text-white text-xl font-light tracking-wider" data-testid="link-logo">
            Anker<sup className="text-xs">®</sup>
          </Link>
          
          <nav 
            className="hidden lg:flex items-center gap-3 overflow-x-auto flex-1 mx-4 pb-1"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255,255,255,0.3) transparent',
            }}
          >
            {navItems.map((item) => (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-2 text-sm font-light transition-colors whitespace-nowrap px-3 py-1.5 rounded-full ${
                  location === item.href 
                    ? 'text-white bg-white/10' 
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
                data-testid={`link-nav-${item.label.toLowerCase().replace(' ', '-')}`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            {user && (
              <span className="hidden md:block text-white/60 text-sm font-light">
                {user.firstName || user.email?.split('@')[0]}
              </span>
            )}
            {user && <NotificationCenter userId={user.id} />}
            {user?.isAdmin && (
              <Link 
                href="/admin"
                className="hidden md:flex items-center gap-2 px-3 py-2 rounded-full bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] text-sm font-medium hover:bg-[rgb(142,132,247)]/30 transition-colors"
                data-testid="link-admin"
              >
                <Shield className="w-4 h-4" />
                Admin
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 text-white/70 text-sm font-light hover:bg-white/10 transition-colors"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden text-white"
              data-testid="button-mobile-menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:hidden absolute top-full left-0 right-0 bg-[rgb(18,18,18)]/95 backdrop-blur-md border-b border-white/10 py-4 max-h-[70vh] overflow-y-auto"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255,255,255,0.3) transparent',
            }}
          >
            <div className="max-w-7xl mx-auto px-6 flex flex-col gap-4">
              {navItems.map((item) => (
                <Link 
                  key={item.href} 
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 text-sm font-light transition-colors py-2 ${
                    location === item.href 
                      ? 'text-white' 
                      : 'text-white/60 hover:text-white'
                  }`}
                  data-testid={`link-mobile-${item.label.toLowerCase().replace(' ', '-')}`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </Link>
              ))}
              {user?.isAdmin && (
                <Link 
                  href="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 text-[rgb(142,132,247)] text-sm font-medium py-2"
                  data-testid="link-mobile-admin"
                >
                  <Shield className="w-5 h-5" />
                  Admin Console
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 text-white/60 text-sm font-light py-2 hover:text-white transition-colors"
                data-testid="button-mobile-logout"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </button>
            </div>
          </motion.div>
        )}
      </motion.header>

      {showHero && title && (
        <section 
          className="relative flex items-center justify-center overflow-hidden"
          style={{ height: heroHeight, minHeight: '350px', paddingTop: '80px' }}
        >
          <div className="absolute inset-0 w-full h-full">
            <Video 
              file={videoUrl}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
            <div className="absolute inset-0 bg-black/60" />
          </div>

          <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-light text-white mb-4" data-testid="text-page-title">
                {title.split(' ').map((word, i) => 
                  i === 0 ? (
                    <span key={i} className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>
                      {word}{' '}
                    </span>
                  ) : (
                    <span key={i}>{word} </span>
                  )
                )}
              </h1>
              {subtitle && (
                <p className="text-lg text-white/50 font-light max-w-xl mx-auto">
                  {subtitle}
                </p>
              )}
            </motion.div>
          </div>
        </section>
      )}

      <main className={showHero ? 'pt-0' : 'pt-24'}>
        {children}
      </main>

      <footer className="py-12 bg-[rgb(18,18,18)] border-t border-white/10 mt-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Link href="/" className="text-white text-lg font-light tracking-wider">
              Anker<sup className="text-xs">®</sup>
            </Link>
            <p className="text-white/30 text-sm">
              © 2024 Anker. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
