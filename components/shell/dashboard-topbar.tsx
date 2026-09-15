"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { EntitySwitcher } from "./entity-switcher";
import { HeaderTrays } from "./header-trays";
import { ThemeToggle } from "@/components/theme-toggle";

/** Persistent Carta-style app top bar: entity switcher + ⌘K search trigger. */
export function DashboardTopbar() {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return (
    <div className="platform-topbar sticky top-0 z-40 flex items-center gap-2 min-h-16 px-4 lg:px-8 border-b border-border bg-card">
      <div className="min-w-0 flex-1">
        <EntitySwitcher />
      </div>
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(new CustomEvent("open-command-palette"))
        }
        className="inline-flex min-h-11 items-center gap-2 rounded border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground hover:border-foreground/40 transition-colors"
        aria-label="Open command palette"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden lg:inline">Search workspace</span>
        <kbd className="hidden lg:inline ml-1 text-xs font-mono border border-foreground/15 rounded px-1.5 py-0.5">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>
      <div className="w-px h-5 bg-foreground/10" aria-hidden />
      <ThemeToggle className="inline-flex min-h-11 min-w-11 items-center justify-center p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-md transition-colors" />
      <div className="hidden md:block">
        <HeaderTrays />
      </div>
    </div>
  );
}
