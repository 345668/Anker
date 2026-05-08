"use client"

/**
 * Small persistent card the user fills in once per session.  Contains
 * the founder context every outreach generation needs:
 *
 *   companyName, oneLiner, facts[], calendarUrl, currency
 *
 * Persisted to localStorage so the same context is reused across
 * /dashboard/shortlist visits without a backend round-trip.  Returned
 * via `useFounderContext()` for the outreach composer to consume.
 */

import { useEffect, useState } from "react"
import { Building2, ChevronDown, ChevronRight, Save } from "lucide-react"

const STORAGE_KEY = "anker.founderContext.v1"

export interface FounderCtx {
  companyName: string
  oneLiner: string
  facts: string[]
  calendarUrl?: string
  currency?: "USD" | "EUR" | "GBP"
  founderName?: string
}

const EMPTY: FounderCtx = {
  companyName: "",
  oneLiner: "",
  facts: [],
  calendarUrl: "",
  currency: "USD",
  founderName: "",
}

/** React hook — returns the current founder context + a setter that
 *  also writes to localStorage. */
export function useFounderContext(): [FounderCtx, (v: FounderCtx) => void] {
  const [ctx, set] = useState<FounderCtx>(EMPTY)
  // Hydrate on mount
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === "object") set({ ...EMPTY, ...parsed })
      }
    } catch {/* ignore */}
  }, [])
  function update(v: FounderCtx) {
    set(v)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
    } catch {/* ignore */}
  }
  return [ctx, update]
}

interface Props {
  ctx: FounderCtx
  onChange: (v: FounderCtx) => void
  defaultCollapsed?: boolean
  className?: string
}

export function FounderContextCard({ ctx, onChange, defaultCollapsed = false, className = "" }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed && !!ctx.companyName)
  const [factsRaw, setFactsRaw] = useState(ctx.facts.join("\n"))

  // When facts are typed line-by-line, update the saved array on blur
  function persistFacts() {
    const facts = factsRaw.split("\n").map((s) => s.trim()).filter(Boolean)
    onChange({ ...ctx, facts })
  }

  const valid = !!(ctx.companyName.trim() && ctx.oneLiner.trim())

  return (
    <div className={`border border-foreground/10 rounded-lg ${className}`}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-display text-lg">
            Your context for outreach
            {valid && <span className="text-muted-foreground font-normal"> — {ctx.companyName}</span>}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {!valid && (
            <span className="text-[10px] font-mono text-amber-600 uppercase tracking-wider">
              required
            </span>
          )}
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {!collapsed && (
        <div className="px-5 pb-5 space-y-3 border-t border-foreground/10">
          <p className="text-xs text-muted-foreground pt-3">
            This is what the local-AI uses to personalize every DM and reply draft. Saved in your browser.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Company name" required>
              <input
                type="text"
                value={ctx.companyName}
                onChange={(e) => onChange({ ...ctx, companyName: e.target.value })}
                placeholder="Flowly"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
              />
            </Field>
            <Field label="Founder name">
              <input
                type="text"
                value={ctx.founderName ?? ""}
                onChange={(e) => onChange({ ...ctx, founderName: e.target.value })}
                placeholder="Maya Chen"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
              />
            </Field>
          </div>
          <Field label="One-liner" required hint="Used as the pitch in every DM.">
            <input
              type="text"
              value={ctx.oneLiner}
              onChange={(e) => onChange({ ...ctx, oneLiner: e.target.value })}
              placeholder="A workflow OS for mid-market SaaS teams stuck in 47 internal tools"
              className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
            />
          </Field>
          <Field label="Facts" hint="One per line. The model picks one fact per message; never reuses.">
            <textarea
              value={factsRaw}
              onChange={(e) => setFactsRaw(e.target.value)}
              onBlur={persistFacts}
              rows={4}
              placeholder={"€280k MRR from 18 customers since Oct\n3.2x net retention 6 months in\nSigned LOIs from 4 Fortune-100 procurement teams"}
              className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background font-mono leading-relaxed"
            />
          </Field>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Calendar link" hint="Used in day-3 follow-up + INTERESTED reply drafts.">
              <input
                type="url"
                value={ctx.calendarUrl ?? ""}
                onChange={(e) => onChange({ ...ctx, calendarUrl: e.target.value })}
                placeholder="https://cal.com/founder/15min"
                className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
              />
            </Field>
            <Field label="Currency">
              <select
                value={ctx.currency ?? "USD"}
                onChange={(e) => onChange({ ...ctx, currency: e.target.value as any })}
                className="w-full h-10 px-3 text-sm border border-foreground/15 rounded-md bg-background"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </Field>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
            <Save className="w-3 h-3" /> auto-saved on edit
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, required, children }: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs">{label} {required && <span className="text-rose-600">*</span>}</span>
        {hint && <span className="text-[10px] font-mono text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </label>
  )
}
