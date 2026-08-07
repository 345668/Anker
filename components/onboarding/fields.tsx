"use client"

import { createContext, useContext, useRef } from "react"
import { Check, Upload } from "lucide-react"
import { ACCENT } from "./ob-shell"

/** Persona accent for the active states of form controls. */
const AccentCtx = createContext<string>(ACCENT.founder)
export function AccentProvider({ value, children }: { value: string; children: React.ReactNode }) {
  return <AccentCtx.Provider value={value}>{children}</AccentCtx.Provider>
}

const inputCls =
  "w-full bg-background border border-foreground/15 focus:border-foreground/50 outline-none px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors"

export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
        {label}
        {required ? <span className="text-foreground/50"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

export function Text({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return <input className={inputCls} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

export function Area({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <textarea className={`${inputCls} min-h-[88px] resize-y`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

export function Chips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const accent = useContext(AccentCtx)
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o)
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(o)}
            className={`px-3.5 py-2 text-xs font-mono uppercase tracking-wider border transition-colors ${on ? "text-white" : "bg-background text-foreground border-foreground/15 hover:border-foreground/40"}`}
            style={on ? { backgroundColor: accent, borderColor: accent } : undefined}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

export function Choices({
  options,
  value,
  onChange,
}: {
  options: { value: string; title: string; desc?: string }[]
  value: string
  onChange: (v: string) => void
}) {
  const accent = useContext(AccentCtx)
  return (
    <div className="grid gap-2.5">
      {options.map((o) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className="flex items-start gap-3 p-3.5 border bg-background text-left transition-colors hover:border-foreground/40"
            style={on ? { borderColor: accent, boxShadow: `inset 0 0 0 1px ${accent}` } : { borderColor: "rgba(127,127,127,0.18)" }}
          >
            <span className="mt-0.5 w-[18px] h-[18px] shrink-0 border grid place-items-center" style={{ borderColor: on ? accent : "rgba(127,127,127,0.35)" }}>
              {on ? <span className="w-2.5 h-2.5" style={{ backgroundColor: accent }} /> : null}
            </span>
            <span>
              <span className="block text-sm font-semibold text-foreground">{o.title}</span>
              {o.desc ? <span className="block text-xs text-muted-foreground mt-0.5">{o.desc}</span> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function Drop({ fileName, onFile, title, sub }: { fileName: string; onFile: (name: string) => void; title: string; sub: string }) {
  const accent = useContext(AccentCtx)
  const ref = useRef<HTMLInputElement>(null)
  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className="w-full border border-dashed bg-background px-6 py-6 flex flex-col items-center gap-2 text-center transition-colors hover:border-foreground/40"
      style={fileName ? { borderColor: accent } : { borderColor: "rgba(127,127,127,0.3)" }}
    >
      {fileName ? <Check className="w-6 h-6" style={{ color: accent }} /> : <Upload className="w-6 h-6 text-muted-foreground" />}
      <span className="text-sm font-semibold text-foreground">{fileName || title}</span>
      <span className="text-xs text-muted-foreground">{fileName ? "Click to replace" : sub}</span>
      <input ref={ref} type="file" hidden onChange={(e) => onFile(e.target.files?.[0]?.name || "")} />
    </button>
  )
}
