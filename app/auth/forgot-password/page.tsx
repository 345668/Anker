"use client"
import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { AuthFrame } from "@/components/auth/auth-frame"
import s from "@/components/auth/auth.module.css"

export default function ForgotPasswordPage() {
  const [email,setEmail] = useState("")
  const [loading,setLoading] = useState(false)
  const [submitted,setSubmitted] = useState(false)
  const [error,setError] = useState<string|null>(null)
  async function submit(e:React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true); setError(null)
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {redirectTo:window.location.origin+"/auth/callback?next=/auth/reset-password"})
      if (error) throw error
      setSubmitted(true)
    } catch (err) { setError(err instanceof Error ? err.message : "We couldn’t request a reset link. Please try again.") }
    finally { setLoading(false) }
  }
  return <AuthFrame back eyebrow="Account recovery" title={submitted ? "Check your inbox." : "Forgot your password?"} description={submitted ? "Follow the link in your email to choose a new password." : "Enter the email address you use for Anker. We’ll help you get back to your workspace."}>
    {submitted ? <div className={s.form}>
      <p role="status" className={s.notice}>If an account exists for <strong>{email.trim()}</strong>, you’ll receive a reset link. It may take a few minutes; check your spam folder too.</p>
      <Link className={s.button} href="/auth/login">Back to sign in <ArrowRight size={18} aria-hidden="true" /></Link>
      <button type="button" className={s.button+" "+s.secondary} onClick={()=>setSubmitted(false)}>Use another email address</button>
    </div> : <form className={s.form} onSubmit={submit} aria-busy={loading}>
      <div className={s.field}><label htmlFor="email">Email address</label><input className={s.input} id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" /></div>
      {error && <p role="alert" className={s.notice+" "+s.error}>{error}</p>}
      <button className={s.button} type="submit" disabled={loading}>{loading ? "Requesting link…" : "Send reset link"}{loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}</button>
    </form>}
    <p className={s.below}>Still having trouble? <Link href="/contact">Contact the Anker team</Link></p>
  </AuthFrame>
}
