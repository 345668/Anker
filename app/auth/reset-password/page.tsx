"use client"
import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { AuthFrame } from "@/components/auth/auth-frame"
import { PasswordField } from "@/components/auth/password-field"
import s from "@/components/auth/auth.module.css"

export default function ResetPasswordPage() {
  const [password,setPassword] = useState("")
  const [confirmation,setConfirmation] = useState("")
  const [loading,setLoading] = useState(false)
  const [success,setSuccess] = useState(false)
  const [error,setError] = useState<string|null>(null)
  async function submit(e:React.FormEvent) {
    e.preventDefault()
    if (loading) return
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {setError("Use at least 8 characters, including an uppercase letter, a lowercase letter and a number.");return}
    if (password !== confirmation) {setError("Your passwords don’t match. Please enter them again.");return}
    setError(null); setLoading(true)
    try {
      const {error} = await createClient().auth.updateUser({password})
      if(error) throw error
      setSuccess(true);setPassword("");setConfirmation("")
    } catch {setError("Your password could not be updated. The reset link may have expired. Request a new link and try again.")}
    finally {setLoading(false)}
  }
  return <AuthFrame back eyebrow="Account recovery" title={success ? "Password updated." : "Choose a new password."} description={success ? "Your new password is ready. You can now continue to sign in." : "Use a strong password that you haven’t used on another account."}>
    {success ? <div className={s.form}><p role="status" className={s.notice}>Your password has been changed.</p><Link className={s.button} href="/auth/login">Continue to sign in <ArrowRight size={18} aria-hidden="true" /></Link></div> : <form className={s.form} onSubmit={submit} aria-busy={loading}>
      <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 8 characters, with an uppercase letter, a lowercase letter and a number." />
      <PasswordField id="confirmPassword" label="Confirm new password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
      {error && <div role="alert" className={s.notice+" "+s.error}>{error} <Link href="/auth/forgot-password" className="underline">Request a reset link</Link></div>}
      <button className={s.button} type="submit" disabled={loading}>{loading ? "Updating password…" : "Update password"}{loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}</button>
    </form>}
  </AuthFrame>
}
