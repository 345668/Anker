"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowRight, Loader2 } from "lucide-react"
import { AuthFrame } from "@/components/auth/auth-frame"
import { PasswordField } from "@/components/auth/password-field"
import { SIGNUPS_ENABLED, SIGNUPS_CLOSED_MESSAGE, SIGNUP_REQUIRES_INVITE, SIGNUP_INVITE_REQUIRED_MESSAGE } from "@/lib/auth/signups"
import s from "@/components/auth/auth.module.css"

export default function SignUpPage() {
  const [invite,setInvite] = useState<string|null>(null)
  const [firstName,setFirstName] = useState("")
  const [lastName,setLastName] = useState("")
  const [email,setEmail] = useState("")
  const [password,setPassword] = useState("")
  const [role,setRole] = useState<"founder"|"vc">("founder")
  const [error,setError] = useState<string|null>(null)
  const [loading,setLoading] = useState(false)
  useEffect(()=>setInvite(new URLSearchParams(window.location.search).get("invite") ?? ""),[])
  const allowed = SIGNUPS_ENABLED && (!SIGNUP_REQUIRES_INVITE || !!invite)
  async function submit(e:React.FormEvent) {
    e.preventDefault()
    if (!allowed || loading) return
    if(password.length < 8) {setError("Use a password with at least 8 characters.");return}
    setLoading(true);setError(null)
    try {
      const response = await fetch("/api/auth/sign-up",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({email:email.trim(),password,name:(firstName+" "+lastName).trim(),role,invite})})
      const data = await response.json().catch(()=>null)
      if(!response.ok || !data?.user) throw new Error(data?.error || "We couldn’t create your account. Please try again.")
      window.location.assign(data.note ? "/auth/sign-up-success" : "/dashboard")
    } catch(err) {setError(err instanceof Error ? err.message : "Check your connection and try again.");setLoading(false)}
  }
  if(invite === null) return <AuthFrame eyebrow="Join Anker" title="Your next chapter." description="A connected workspace for venture."><p role="status">Checking invitation…</p></AuthFrame>
  return <AuthFrame eyebrow={allowed ? "Join Anker" : "Workspace access"} title={allowed ? "Create your account." : SIGNUPS_ENABLED ? "A personal invitation." : "Registration is closed."} description={allowed ? "Set up your profile. We’ll tailor your workspace to the work you do." : SIGNUPS_ENABLED ? SIGNUP_INVITE_REQUIRED_MESSAGE : SIGNUPS_CLOSED_MESSAGE}>
    {allowed ? <form className={s.form} onSubmit={submit} aria-busy={loading}>
      <div className={s.row}>
        <div className={s.field}><label htmlFor="firstName">First name</label><input id="firstName" name="firstName" className={s.input} autoComplete="given-name" value={firstName} onChange={e=>setFirstName(e.target.value)} required /></div>
        <div className={s.field}><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" className={s.input} autoComplete="family-name" value={lastName} onChange={e=>setLastName(e.target.value)} required /></div>
      </div>
      <div className={s.field}><label htmlFor="email">Email address</label><input id="email" name="email" type="email" className={s.input} autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)} required /></div>
      <div className={s.field}><label htmlFor="role">I’m here as a</label><select id="role" className={s.input} value={role} onChange={e=>setRole(e.target.value as "founder"|"vc")}><option value="founder">Founder</option><option value="vc">Fund manager / investor</option></select></div>
      <PasswordField value={password} onChange={setPassword} autoComplete="new-password" hint="Use at least 8 characters. A longer, unique passphrase is recommended." />
      {error && <p role="alert" className={s.notice+" "+s.error}>{error}</p>}
      <button type="submit" className={s.button} disabled={loading}>{loading ? "Creating account…" : "Create account"}{loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}</button>
    </form> : <Link className={s.button} href="/contact">Contact us for access <ArrowRight size={18} aria-hidden="true" /></Link>}
    <p className={s.below}>Already have an account? <Link href="/auth/login">Sign in</Link></p>
  </AuthFrame>
}
