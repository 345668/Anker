import Link from "next/link"
import { AuthFrame } from "@/components/auth/auth-frame"
import { InvestorSignUpForm } from "@/components/investor/sign-up-form"
import { signupOpen } from "@/lib/investor/signup"

export const dynamic = "force-dynamic"
export const metadata = { title: "Investor sign-up" }

export default async function InvestorSignUpPage() {
  const open = await signupOpen()
  return <AuthFrame eyebrow="For investors" title={open ? "Create an investor account." : "Investor sign-up is not open yet."}
    description={open ? "Find funds that match what you look for and ask to talk. We confirm your email first." : "We are not accepting investor accounts yet. If you were invited to a fund, use the link you were sent."}>
    {open ? <InvestorSignUpForm /> : null}
    <p className="mt-6 text-sm">Already have an account? <Link className="underline" href="/auth/login?redirect=/investor">Sign in</Link></p>
  </AuthFrame>
}
