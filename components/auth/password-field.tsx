"use client"
import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import s from "./auth.module.css"

export function PasswordField({ id = "password", label = "Password", value, onChange, autoComplete = "current-password", hint }: {
  id?: string; label?: string; value:string; onChange:(value:string)=>void; autoComplete?:"current-password"|"new-password"; hint?:string
}) {
  const [visible,setVisible] = useState(false)
  return <div className={s.field}>
    <label htmlFor={id}>{label}</label>
    <div className={s.password}>
      <input id={id} name={id} className={s.input} type={visible ? "text" : "password"} value={value} onChange={e=>onChange(e.target.value)} autoComplete={autoComplete} required aria-describedby={hint ? `${id}-hint` : undefined} />
      <button type="button" className={s.reveal} aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
    </div>
    {hint && <p id={`${id}-hint`} className={s.fine}>{hint}</p>}
  </div>
}
