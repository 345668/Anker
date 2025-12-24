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
