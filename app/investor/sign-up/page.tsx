import Link from "next/link"
import { TEXTS } from "@/lib/investor/legal"
import { AuthFrame } from "@/components/auth/auth-frame"
import { InvestorSignUpForm } from "@/components/investor/sign-up-form"
import { signupOpen } from "@/lib/investor/signup"

export const dynamic = "force-dynamic"
export const metadata = { title: "Investor sign-up" }

export default async function InvestorSignUpPage() {
  const open = await signupOpen()
  return <AuthFrame eyebrow="For investors" title={open ? "Create an investor account." : TEXTS.signupClosedTitle.text}
    description={open ? "Find funds that match what you look for and ask to talk. We confirm your email first." : TEXTS.signupClosedBody.text}>
    {open ? <InvestorSignUpForm /> : null}
    <p className="mt-6 text-sm">Already have an account? <Link className="underline" href="/auth/login?redirect=/investor">Sign in</Link></p>
  </AuthFrame>
}
