import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { AuthFrame } from "@/components/auth/auth-frame"
import s from "@/components/auth/auth.module.css"

export default function SignUpSuccessPage() {
  return <AuthFrame eyebrow="Next step" title="Continue to your workspace." description="If you’ve just created an account, use your email and password to sign in.">
    <div className={s.form}>
      <Link className={s.button} href="/auth/login">Continue to sign in <ArrowRight size={18} aria-hidden="true" /></Link>
      <p className={s.fine}>If your invitation included an email confirmation link, follow it before signing in.</p>
    </div>
    <p className={s.below}>Having trouble getting started? <Link href="/contact">We’re here to help</Link></p>
  </AuthFrame>
}
