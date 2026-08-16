"use client"

import { Search } from "lucide-react"
import { EntitySwitcher } from "./entity-switcher"
import { HeaderTrays } from "./header-trays"
import { ThemeToggle } from "@/components/theme-toggle"

/** Persistent Carta-style app top bar: entity switcher + ⌘K search trigger. */
export function DashboardTopbar() {
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
  return (
    <div className="sticky top-0 z-40 flex items-center gap-3 h-14 px-4 lg:px-8 border-b border-foreground/10 bg-background/85 backdrop-blur-md">
      <EntitySwitcher />
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
        className="inline-flex items-center gap-2 rounded-md border border-foreground/15 bg-background px-3 py-1.5 text-sm text-muted-foreground hover:border-foreground/40 transition-colors"
        aria-label="Open command palette"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Navigate to…</span>
        <kbd className="ml-1 text-[10px] font-mono border border-foreground/15 rounded px-1.5 py-0.5">{isMac ? "⌘" : "Ctrl"} K</kbd>
      </button>
      <div className="w-px h-5 bg-foreground/10" aria-hidden />
      <ThemeToggle className="inline-flex items-center justify-center p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-md transition-colors" />
      <HeaderTrays />
    </div>
  )
}
