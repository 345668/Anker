"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { DashboardSidebar } from "@/components/tesseract/dashboard-sidebar";
import { DashboardTopbar } from "@/components/shell/dashboard-topbar";
import { AppNav } from "@/components/shell/app-nav";
import { AppSubnav } from "@/components/shell/app-subnav";
import { AppMobileNav } from "@/components/shell/app-mobile-nav";
import { NavPersonaProvider } from "@/components/shell/nav-persona";
import type { Persona } from "@/lib/org/active";

/**
 * Chooses the dashboard chrome: the legacy left sidebar (default) or the new
 * website-style top nav (redesign), gated by the `anker:nav` flag.
 *
 * The choice lives in BOTH a cookie (so the server renders the right chrome on
 * first paint — no flash) and localStorage (so the client toggle is instant).
 * `initialMode` comes from the server cookie read; the effect reconciles a
 * `?nav=top|sidebar` URL param and keeps cookie + localStorage in sync.
 *
 * Toggle without the console:
 *   /dashboard?nav=top      → new top nav (sticky)
 *   /dashboard?nav=sidebar  → sidebar (sticky)
 */
export function NavModeShell({
  user,
  isAdmin,
  persona,
  initialMode = "sidebar",
  children,
}: {
  user: User;
  isAdmin: boolean;
  persona: Persona | null;
  initialMode?: "sidebar" | "top";
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<"sidebar" | "top">(initialMode);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("nav");
      let next: "sidebar" | "top" | null =
        q === "top" || q === "sidebar" ? q : null;
      if (!next) {
        const stored = localStorage.getItem("anker:nav");
        next =
          stored === "top"
            ? "top"
            : stored === "sidebar"
              ? "sidebar"
              : initialMode;
      }
      setMode(next);
      localStorage.setItem("anker:nav", next);
      // Mirror to a cookie so the next server render picks the same chrome.
      document.cookie = `anker_nav=${next}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      /* ignore */
    }
  }, [initialMode]);

  if (mode === "top") {
    return (
      <NavPersonaProvider persona={persona}>
        <div className="min-h-screen bg-background flex flex-col">
          <a className="platform-skip" href="#workspace-content">
            Skip to workspace
          </a>
          <AppNav user={user} isAdmin={isAdmin} />
          <div className="flex flex-1 min-h-0 relative z-10">
            <AppSubnav />
            <main
              id="workspace-content"
              tabIndex={-1}
              className="platform-main flex-1 min-w-0 pb-20 md:pb-0"
            >
              {children}
            </main>
          </div>
          <AppMobileNav user={user} isAdmin={isAdmin} />
        </div>
      </NavPersonaProvider>
    );
  }

  return (
    <NavPersonaProvider persona={persona}>
      <div className="min-h-screen bg-background flex">
        <a className="platform-skip" href="#workspace-content">
          Skip to workspace
        </a>
        {/* Sidebar width var so the main column follows the collapse toggle. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.style.setProperty('--sidebar-w',localStorage.getItem('anker:sidebar')==='collapsed'?'4rem':'16rem')}catch(e){}`,
          }}
        />
        <DashboardSidebar user={user} isAdmin={isAdmin} persona={persona} />
        <main
          id="workspace-content"
          tabIndex={-1}
          className="platform-main platform-sidebar-main flex-1 min-w-0 relative pb-20 md:pb-0"
        >
          <DashboardTopbar />
          {children}
        </main>
        <AppMobileNav user={user} isAdmin={isAdmin} />
      </div>
    </NavPersonaProvider>
  );
}
