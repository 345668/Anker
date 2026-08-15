"use client"

import { useEffect, useState } from "react"
import { Cookie, X } from "lucide-react"
import {
  CATEGORY_META,
  OPEN_PREFERENCES_EVENT,
  defaultConsent,
  grantAll,
  readConsent,
  rejectAll,
  writeConsent,
  type ConsentState,
} from "@/lib/consent"

/**
 * GDPR / ePrivacy cookie consent. Renders a bottom banner on first visit and a
 * granular preferences panel. Mounted once in the root layout. Non-essential
 * scripts (see ConsentedAnalytics) stay dormant until the user opts in.
 */
export function CookieConsent() {
  const [mounted, setMounted] = useState(false)
  const [decided, setDecided] = useState(true) // assume decided → render nothing until we check
  const [panelOpen, setPanelOpen] = useState(false)
  const [draft, setDraft] = useState<ConsentState>(defaultConsent())

  useEffect(() => {
    setMounted(true)
    const existing = readConsent()
    setDecided(!!existing)
    if (existing) setDraft(existing)
    // Allow the footer / settings link to re-open the panel any time.
    const reopen = () => {
      setDraft(readConsent() ?? defaultConsent())
      setPanelOpen(true)
    }
    window.addEventListener(OPEN_PREFERENCES_EVENT, reopen)
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, reopen)
  }, [])

  if (!mounted) return null
  // Nothing to show: a choice exists and the panel isn't open.
  if (decided && !panelOpen) return null

  function commit(state: ConsentState) {
    writeConsent(state)
    setDecided(true)
    setPanelOpen(false)
  }

  const acceptAll = () => commit(grantAll())
  const rejectNonEssential = () => commit(rejectAll())
  const saveChoices = () =>
    commit({ ...draft, necessary: true, v: defaultConsent().v, ts: new Date().toISOString() })

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-end sm:justify-start pointer-events-none">
      {/* Dim only when the granular panel is open (a modal choice). */}
      {panelOpen && (
        <div
          className="absolute inset-0 bg-background/60 backdrop-blur-sm pointer-events-auto"
          onClick={() => decided && setPanelOpen(false)}
          aria-hidden
        />
      )}

      <div
        role="dialog"
        aria-modal={panelOpen}
        aria-label="Cookie consent"
        className="relative pointer-events-auto m-4 w-full max-w-md rounded-xl border border-foreground/15 bg-background shadow-2xl"
      >
        {!panelOpen ? (
          /* ── Compact banner ─────────────────────────────────────────── */
          <div className="p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-foreground/5">
                <Cookie className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display text-base tracking-tight">We value your privacy</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  We use strictly-necessary cookies to run Anker, and — only with your consent —
                  functional and analytical cookies to improve it. You can accept all, reject
                  non-essential, or choose per category. See our{" "}
                  <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">
                    Privacy&nbsp;Policy
                  </a>
                  .
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                onClick={rejectNonEssential}
                className="h-9 rounded-md border border-foreground/15 px-4 text-sm font-medium hover:border-foreground/40"
              >
                Reject non-essential
              </button>
              <button
                onClick={acceptAll}
                className="h-9 rounded-md bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/90"
              >
                Accept all
              </button>
            </div>
            <button
              onClick={() => {
                setDraft(readConsent() ?? defaultConsent())
                setPanelOpen(true)
              }}
              className="mt-2 h-9 w-full rounded-md px-4 text-sm text-muted-foreground hover:text-foreground"
            >
              Manage preferences
            </button>
          </div>
        ) : (
          /* ── Granular preferences ───────────────────────────────────── */
          <div className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base tracking-tight">Cookie preferences</h2>
              {decided && (
                <button
                  onClick={() => setPanelOpen(false)}
                  className="rounded p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Choose which categories to allow. Strictly-necessary cookies are always on.
            </p>

            <div className="mt-4 space-y-2">
              {(["necessary", "functional", "analytics"] as const).map((key) => {
                const meta = CATEGORY_META[key]
                const checked = key === "necessary" ? true : (draft as any)[key]
                return (
                  <div key={key} className="rounded-lg border border-foreground/10 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{meta.label}</span>
                          {meta.required && (
                            <span className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                              Always on
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {meta.description}
                        </p>
                      </div>
                      <Toggle
                        checked={checked}
                        disabled={meta.required}
                        onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                onClick={rejectNonEssential}
                className="h-9 rounded-md border border-foreground/15 px-3 text-sm font-medium hover:border-foreground/40"
              >
                Reject all
              </button>
              <button
                onClick={saveChoices}
                className="h-9 rounded-md border border-foreground/15 px-3 text-sm font-medium hover:border-foreground/40"
              >
                Save choices
              </button>
              <button
                onClick={acceptAll}
                className="h-9 rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/90"
              >
                Accept all
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? "bg-foreground" : "bg-foreground/20"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  )
}
