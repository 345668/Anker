"use client"
import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowRight, Loader2 } from "lucide-react"
import { AuthFrame } from "@/components/auth/auth-frame"
import { PasswordField } from "@/components/auth/password-field"
import { SIGNUP_CTA_VISIBLE, SIGNUPS_ENABLED } from "@/lib/auth/signups"
import { safeAuthDestination } from "@/lib/auth/destination"
import s from "@/components/auth/auth.module.css"

export default function LoginPage() {
  return <Suspense fallback={<AuthFrame eyebrow="Your workspace" title="Welcome back." description="Sign in to continue your work with Anker."><p role="status">Loading sign-in form…</p></AuthFrame>}><LoginForm /></Suspense>
}
function LoginForm() {
  const params = useSearchParams()
  const destination = safeAuthDestination(params.get("next") || params.get("redirect"))
  const [email,setEmail] = useState("")
  const [password,setPassword] = useState("")
  const [error,setError] = useState<string|null>(null)
  const [loading,setLoading] = useState(false)
  async function submit(e:React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError(null); setLoading(true)
    try {
      const response = await fetch("/api/auth/sign-in", { method:"POST", headers:{"Content-Type":"application/json"}, credentials:"same-origin", body:JSON.stringify({email:email.trim(),password}) })
      const data = await response.json().catch(()=>null)
      if (!response.ok || !data?.user) throw new Error(data?.error || "We couldn’t sign you in. Please try again.")
      window.location.assign(destination)
    } catch (err) { setError(err instanceof Error ? err.message : "Check your connection and try again."); setLoading(false) }
  }
  return <AuthFrame eyebrow="Your workspace" title="Welcome back." description="Sign in to manage your relationships, capital and next steps.">
    <form onSubmit={submit} className={s.form} aria-busy={loading}>
      <div className={s.field}><label htmlFor="email">Email address</label><input className={s.input} id="email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" required /></div>
      <PasswordField value={password} onChange={setPassword} />
      <div className={s.labelRow}><span className={s.fine}>Use your Anker account credentials.</span><Link href="/auth/forgot-password">Forgot password?</Link></div>
      {error && <p role="alert" className={s.notice+" "+s.error}>{error}</p>}
      <button className={s.button} disabled={loading} type="submit"><span>{loading ? "Signing in…" : "Sign in"}</span>{loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}</button>
    </form>
    <p className={s.below}>{SIGNUP_CTA_VISIBLE ? <>New to Anker? <Link href="/auth/sign-up">Create an account</Link></> : <>{SIGNUPS_ENABLED ? "Access is by invitation." : "New registration is currently closed."} <Link href="/contact">Contact us for access</Link></>}</p>
  </AuthFrame>
}
