"use client"

import { useRef } from "react"

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
    <label className="ob-field">
      <span className="ob-label">
        {label}
        {required ? <span className="req"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="ob-hint">{hint}</span> : null}
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
  return (
    <input
      className="ob-input"
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function Area({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <textarea className="ob-textarea" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  )
}

export function Chips({
  options,
  value,
  onChange,
  accent,
}: {
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
  accent?: "c"
}) {
  function toggle(o: string) {
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])
  }
  return (
    <div className="ob-chips">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`ob-chip ${value.includes(o) ? "on" : ""} ${accent === "c" ? "c" : ""}`}
          aria-pressed={value.includes(o)}
          onClick={() => toggle(o)}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

export function Choices({
  options,
  value,
  onChange,
  accent,
}: {
  options: { value: string; title: string; desc?: string }[]
  value: string
  onChange: (v: string) => void
  accent?: "c"
}) {
  return (
    <div className="ob-choices">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`ob-choice ${value === o.value ? "on" : ""} ${accent === "c" ? "c" : ""}`}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
        >
          <span className="tick">
            <i />
          </span>
          <span>
            <span className="ctitle">{o.title}</span>
            {o.desc ? <span className="cdesc" style={{ display: "block" }}>{o.desc}</span> : null}
          </span>
        </button>
      ))}
    </div>
  )
}

export function Drop({
  fileName,
  onFile,
  title,
  sub,
}: {
  fileName: string
  onFile: (name: string) => void
  title: string
  sub: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className={`ob-drop ${fileName ? "has" : ""}`} onClick={() => ref.current?.click()}>
      <svg className="di" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 16V4m0 0L7 9m5-5 5 5M4 20h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="dt">{fileName || title}</span>
      <span className="ds">{fileName ? "Click to replace" : sub}</span>
      <input
        ref={ref}
        type="file"
        hidden
        onChange={(e) => onFile(e.target.files?.[0]?.name || "")}
      />
    </div>
  )
}
