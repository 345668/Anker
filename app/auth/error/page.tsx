import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { AuthFrame } from "@/components/auth/auth-frame"
import s from "@/components/auth/auth.module.css"

export default function AuthErrorPage() {
  return <AuthFrame back eyebrow="Let’s get you back" title="We couldn’t complete that." description="Your sign-in or confirmation link may have expired or already been used. You can sign in again or request a fresh password reset link.">
    <div className={s.form}>
      <p className={s.notice} role="alert">Authentication could not be completed. Please try one of the options below.</p>
      <Link href="/auth/login" className={s.button}>Try signing in <ArrowRight size={18} aria-hidden="true" /></Link>
      <Link href="/auth/forgot-password" className={s.button+" "+s.secondary}>Request a new reset link</Link>
    </div>
    <p className={s.below}>Need a hand? <Link href="/contact">Contact the Anker team</Link></p>
  </AuthFrame>
}
