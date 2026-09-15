"use client"

import { createContext, useContext, useId } from "react"
import type { HTMLInputTypeAttribute } from "react"
import s from "./onboarding.module.css"

const FieldContext = createContext<{ labelId?: string; hintId?: string; required?: boolean }>({})

export function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  const id = useId()
  return (
    <fieldset className={s.field}>
      <legend id={id} className={s.legend}>{label} <span className={s.optional}>{required ? "(required)" : "(optional)"}</span></legend>
      <FieldContext.Provider value={{ labelId: id, hintId: hint ? `${id}-hint` : undefined, required }}>
        {children}
      </FieldContext.Provider>
      {hint && <p id={`${id}-hint`} className={s.hint}>{hint}</p>}
    </fieldset>
  )
}

export function Text({ value, onChange, placeholder, type = "text", autoComplete }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: HTMLInputTypeAttribute; autoComplete?: string
}) {
  const field = useContext(FieldContext)
  return <input className={s.input} type={type} value={value} placeholder={placeholder}
    aria-labelledby={field.labelId} aria-describedby={field.hintId} required={field.required}
    autoComplete={autoComplete} onChange={e => onChange(e.target.value)} />
}

export function Area({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const field = useContext(FieldContext)
  return <textarea className={`${s.input} ${s.area}`} value={value} placeholder={placeholder}
    aria-labelledby={field.labelId} aria-describedby={field.hintId} required={field.required} onChange={e => onChange(e.target.value)} />
}

export function Chips({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const field = useContext(FieldContext)
  // Keep saved or extracted values visible even when they are outside the suggestions.
  const available = [...new Set([...options, ...value])]
  return <div className={s.chips} role="group" aria-labelledby={field.labelId} aria-describedby={field.hintId}>
    {available.map(option => <button key={option} type="button" className={s.chip} aria-pressed={value.includes(option)}
      onClick={() => onChange(value.includes(option) ? value.filter(v => v !== option) : [...value, option])}>{option}</button>)}
  </div>
}

export function Choices({ options, value, onChange }: {
  options: { value: string; title: string; desc?: string }[]; value: string; onChange: (v: string) => void
}) {
  const field = useContext(FieldContext)
  const name = useId()
  return <div className={s.choices}>
    {options.map(option => <label key={option.value} className={s.choice} data-selected={value === option.value}>
      <input type="radio" name={name} value={option.value} checked={value === option.value}
        required={field.required} aria-describedby={field.hintId} onChange={() => onChange(option.value)} />
      <span><strong>{option.title}</strong>{option.desc && <small>{option.desc}</small>}</span>
    </label>)}
  </div>
}

export function Drop({ fileName, onFile, title, sub, disabled = false }: {
  fileName: string; onFile: (name: string, file?: File) => void; title: string; sub: string; disabled?: boolean
}) {
  const id = useId()
  return <div className={s.upload}>
    <label htmlFor={id}>{title}</label>
    <p id={`${id}-hint`}>{sub}</p>
    {fileName && <p>Selected file: {fileName}</p>}
    <input id={id} type="file" accept=".pdf,.ppt,.pptx" disabled={disabled} aria-describedby={`${id}-hint`} onChange={e => {
      const file = e.target.files?.[0]
      if (file) onFile(file.name, file)
      e.currentTarget.value = ""
    }} />
  </div>
}
