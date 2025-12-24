import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

// Import Framer Styles - CRITICAL
import './framer/styles.css';

// Import Framer Cursor component
import Cursor from '@/framer/cursor';

// Pages
import Home from "@/pages/Home";
import Newsroom from "@/pages/Newsroom";
import Team from "@/pages/Team";
import Contact from "@/pages/Contact";
import NotFound from "@/pages/not-found";

// Page loading animation
function PageLoader({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence mode="wait">
      {isLoading ? (
        <motion.div
          key="loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[100] bg-[rgb(18,18,18)] flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.2, opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="text-white text-4xl font-light tracking-widest"
          >
            Anker<sup className="text-sm">®</sup>
          </motion.div>
        </motion.div>
      ) : (
        <motion.div
          key="content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Router() {
  const [location] = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <Switch location={location} key={location}>
        <Route path="/" component={Home} />
        <Route path="/newsroom" component={Newsroom} />
        <Route path="/team" component={Team} />
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
            {/* Framer Cursor - Global */}
            <Cursor style={{ position: 'fixed', zIndex: 9999, pointerEvents: 'none' }} />
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
