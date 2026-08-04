"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Check } from "lucide-react"
import { AnimatedTesseract } from "@/components/tesseract/animated-tesseract"
import {
  SIGNUPS_ENABLED,
  SIGNUPS_CLOSED_MESSAGE,
  SIGNUP_REQUIRES_INVITE,
  SIGNUP_INVITE_REQUIRED_MESSAGE,
} from "@/lib/auth/signups"

export default function SignUpPage() {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<"founder" | "vc">("founder")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [invite, setInvite] = useState("")
  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setInvite(params.get("invite") ?? "")
    setIsVisible(true)
  }, [])

  const canRegister = SIGNUPS_ENABLED
    ? (!SIGNUP_REQUIRES_INVITE || !!invite)
    : !!invite

  const passwordRequirements = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Contains a number", met: /\d/.test(password) },
    { label: "Contains uppercase letter", met: /[A-Z]/.test(password) },
  ]

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      setLoading(false)
      return
    }

    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name: `${firstName} ${lastName}`.trim(),
          role,
          invite: invite || undefined,
        }),
        credentials: "same-origin",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || "Sign-up failed")
        setLoading(false)
        return
      }
      // Hard navigation — guarantees the new cookie is in the request to
      // /dashboard (router.push uses cached RSC payload from before the
      // cookie was set, which causes the page to spin forever).
      window.location.assign(data.requiresLogin ? "/auth/login" : "/dashboard")
    } catch (err: any) {
      setError(err?.message || "Sign-up failed")
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-background flex overflow-hidden">
      {/* Subtle grid lines - Optimus style */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
        {[...Array(8)].map((_, i) => (
          <div
            key={`h-${i}`}
            className="absolute h-px bg-foreground/10"
            style={{
              top: `${12.5 * (i + 1)}%`,
              left: 0,
              right: 0,
            }}
          />
        ))}
        {[...Array(12)].map((_, i) => (
          <div
            key={`v-${i}`}
            className="absolute w-px bg-foreground/10"
            style={{
              left: `${8.33 * (i + 1)}%`,
              top: 0,
              bottom: 0,
            }}
          />
        ))}
      </div>

      {/* Left side - Form */}
      <div className="relative z-10 w-full lg:w-1/2 flex flex-col justify-center px-6 lg:px-24 py-12">
        {/* Back link */}
        <Link
          href="/"
          className={`inline-flex items-center gap-3 text-sm font-mono text-muted-foreground hover:text-foreground transition-all duration-500 mb-12 group ${
            isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
          }`}
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          Back to home
        </Link>

        <div className="max-w-md">
          {/* Eyebrow */}
          <div
            className={`mb-6 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground">
              <span className="w-8 h-px bg-foreground/30" />
              {canRegister ? "Get started" : (SIGNUPS_ENABLED ? "Invitation required" : "Registration closed")}
            </span>
          </div>

          {!canRegister ? (
            <>
              {/* Heading — closed state */}
              <h1
                className={`text-[clamp(2.5rem,6vw,4rem)] font-display leading-[0.95] tracking-tight mb-6 transition-all duration-1000 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
              >
                {SIGNUPS_ENABLED ? "By invitation" : "Sign-ups are"}
                <br />
                <span className="relative">
                  {SIGNUPS_ENABLED ? "only" : "closed"}
                  <span className="absolute -bottom-1 left-0 right-0 h-2 bg-foreground/10" />
                </span>
              </h1>

              <p
                className={`text-lg text-muted-foreground leading-relaxed mb-10 transition-all duration-700 delay-200 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                {SIGNUPS_ENABLED ? SIGNUP_INVITE_REQUIRED_MESSAGE : SIGNUPS_CLOSED_MESSAGE}
              </p>

              <div
                className={`flex flex-col gap-4 transition-all duration-700 delay-300 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                <Link href="/contact">
                  <Button
                    size="lg"
                    className="w-full bg-foreground hover:bg-foreground/90 text-background h-14 text-base rounded-full group"
                  >
                    Contact us for access
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <p className="text-muted-foreground text-sm text-center">
                  Already have an account?{" "}
                  <Link href="/auth/login" className="text-foreground hover:underline underline-offset-4">
                    Sign in
                  </Link>
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Heading */}
              <h1
                className={`text-[clamp(2.5rem,6vw,4rem)] font-display leading-[0.95] tracking-tight mb-6 transition-all duration-1000 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
              >
                Create your
                <br />
                <span className="relative">
                  account
                  <span className="absolute -bottom-1 left-0 right-0 h-2 bg-foreground/10" />
                </span>
              </h1>

              <p
                className={`text-lg text-muted-foreground leading-relaxed mb-10 transition-all duration-700 delay-200 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                Join the future of fundraising with Anker.
              </p>

              <form onSubmit={handleSignUp} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="firstName" className="text-sm font-medium text-foreground/80 block mb-2">
                      First name
                    </label>
                    <Input
                      id="firstName"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Ava"
                      className="h-12 rounded-full border-border/50 bg-background/80"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="lastName" className="text-sm font-medium text-foreground/80 block mb-2">
                      Last name
                    </label>
                    <Input
                      id="lastName"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Chen"
                      className="h-12 rounded-full border-border/50 bg-background/80"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="text-sm font-medium text-foreground/80 block mb-2">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="h-12 rounded-full border-border/50 bg-background/80"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="password" className="text-sm font-medium text-foreground/80 block mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a secure password"
                      className="h-12 rounded-full border-border/50 bg-background/80 pr-12"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground/80 block mb-2">Role</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole("founder")}
                      className={`rounded-full border px-4 py-3 text-sm transition-all ${
                        role === "founder"
                          ? "border-foreground bg-foreground text-background"
                          : "border-border/50 text-muted-foreground hover:border-foreground/40"
                      }`}
                    >
                      Founder
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole("vc")}
                      className={`rounded-full border px-4 py-3 text-sm transition-all ${
                        role === "vc"
                          ? "border-foreground bg-foreground text-background"
                          : "border-border/50 text-muted-foreground hover:border-foreground/40"
                      }`}
                    >
                      Investor
                    </button>
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-border/50 bg-background/50 p-4">
                  {passwordRequirements.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 text-sm">
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full ${item.met ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span className={item.met ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                    </div>
                  ))}
                </div>

                {error ? <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div> : null}

                <Button type="submit" size="lg" className="w-full h-14 rounded-full" disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {loading ? "Creating account..." : "Create my account"}
                </Button>
              </form>
            </>
          )}

          <div className="mt-8 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-foreground hover:underline underline-offset-4">
              Sign in
            </Link>
          </div>
        </div>
      </div>

      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.08),_transparent_45%)]" />
        <AnimatedTesseract />
      </div>
    </div>
  )
}
