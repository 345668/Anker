"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"

/** Light/dark toggle. Mounted-guarded to avoid hydration mismatch. */
export function ThemeToggle({ className = "", showLabel = false }: { className?: string; showLabel?: boolean }) {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
      className={className || "inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-muted"}
    >
      {!mounted ? (
        <span className="h-4 w-4" />
      ) : isDark ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
      {showLabel && <span>{mounted && isDark ? "Light" : "Dark"} mode</span>}
    </button>
  )
}
