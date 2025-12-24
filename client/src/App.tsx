import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatePresence } from "framer-motion";

// Import Framer Styles - CRITICAL
import './framer/styles.css';

// Import Custom Cursor component with full functionality
import { CustomCursor } from '@/components/CustomCursor';

// Pages
import Home from "@/pages/Home";
import Newsroom from "@/pages/Newsroom";
import Team from "@/pages/Team";
import Contact from "@/pages/Contact";
import Vision from "@/pages/Vision";
import Portfolio from "@/pages/Portfolio";
import FAQ from "@/pages/FAQ";
import NotFound from "@/pages/not-found";

// App Platform Pages
import AppLanding from "@/pages/app/AppLanding";
import Dashboard from "@/pages/app/Dashboard";
import Onboarding from "@/pages/app/Onboarding";
import MyStartups from "@/pages/app/MyStartups";
import AllStartups from "@/pages/app/AllStartups";
import StartupProfile from "@/pages/app/StartupProfile";
import Investors from "@/pages/app/Investors";
import InvestorProfile from "@/pages/app/InvestorProfile";
import Contacts from "@/pages/app/Contacts";
import Pipeline from "@/pages/app/Pipeline";
import DealRooms from "@/pages/app/DealRooms";
import Profile from "@/pages/app/Profile";

// Admin Console Pages
import AdminDashboard from "@/pages/admin/AdminDashboard";
import DataImport from "@/pages/admin/DataImport";
import UserManagement from "@/pages/admin/UserManagement";
import SystemSettings from "@/pages/admin/SystemSettings";
import Analytics from "@/pages/admin/Analytics";
import DatabaseManagement from "@/pages/admin/DatabaseManagement";
import ActivityLogs from "@/pages/admin/ActivityLogs";

// Page loading animation - simplified for faster loading
function PageLoader({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Router() {
  const [location] = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <Switch location={location} key={location}>
        <Route path="/" component={Home} />
        <Route path="/portfolio" component={Portfolio} />
        <Route path="/vision" component={Vision} />
        <Route path="/team" component={Team} />
        <Route path="/newsroom" component={Newsroom} />
        <Route path="/faq" component={FAQ} />
        <Route path="/contact" component={Contact} />
        <Route path="/app" component={AppLanding} />
        <Route path="/app/onboarding" component={Onboarding} />
        <Route path="/app/dashboard" component={Dashboard} />
        <Route path="/app/my-startups" component={MyStartups} />
        <Route path="/app/deals" component={AllStartups} />
        <Route path="/app/startups/:id" component={StartupProfile} />
        <Route path="/app/investors" component={Investors} />
        <Route path="/app/investors/:id" component={InvestorProfile} />
        <Route path="/app/contacts" component={Contacts} />
        <Route path="/app/pipeline" component={Pipeline} />
        <Route path="/app/deal-rooms" component={DealRooms} />
        <Route path="/app/deal-rooms/:roomId" component={DealRooms} />
        <Route path="/app/profile" component={Profile} />
        {/* Admin Console Routes */}
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/import" component={DataImport} />
        <Route path="/admin/users" component={UserManagement} />
        <Route path="/admin/settings" component={SystemSettings} />
        <Route path="/admin/analytics" component={Analytics} />
        <Route path="/admin/database" component={DatabaseManagement} />
        <Route path="/admin/activity" component={ActivityLogs} />
        <Route component={NotFound} />
      </Switch>
    </AnimatePresence>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PageLoader>
          <div className="min-h-screen flex flex-col bg-[rgb(18,18,18)] font-sans antialiased text-white">
            {/* Custom Cursor - Global */}
            <CustomCursor />
            <main className="flex-grow">
              <Router />
            </main>
            <Toaster />
          </div>
        </PageLoader>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
