"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react"
import { SIGNUP_CTA_VISIBLE } from "@/lib/auth/signups"

// Wrapper required because the inner component uses useSearchParams().
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginPageInner />
    </Suspense>
  )
}

function LoginPageInner() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") || "/dashboard"

  useEffect(() => {
    setIsVisible(true)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "same-origin",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || "Sign in failed")
        setLoading(false)
        return
      }
      // Hard navigation — guarantees the new cookie is in the request to
      // the destination route (router.push uses cached RSC payload that
      // may have been fetched before the cookie was set).
      window.location.assign(next)
    } catch (err: any) {
      setError(err?.message || "Sign in failed")
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
              Welcome back
            </span>
          </div>

          {/* Heading */}
          <h1 
            className={`text-[clamp(2.5rem,6vw,4rem)] font-serif font-normal leading-[1.02] tracking-tight mb-6 transition-all duration-1000 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            Sign in to
            <br />
            <span className="relative">
              Anker
              <span className="absolute -bottom-1 left-0 right-0 h-2 bg-foreground/10" />
            </span>
          </h1>

          <p 
            className={`text-lg text-muted-foreground leading-relaxed mb-12 transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Access your investor dashboard and continue building your fundraise.
          </p>

          <form 
            onSubmit={handleLogin} 
            className={`space-y-6 transition-all duration-700 delay-300 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <div className="space-y-2">
              <label htmlFor="email" className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="founder@startup.com"
                required
                className="h-14 bg-transparent border-foreground/20 focus:border-foreground/50 rounded-none text-base placeholder:text-muted-foreground/50 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                  Password
                </label>
                <Link 
                  href="/auth/forgot-password" 
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="h-14 bg-transparent border-foreground/20 focus:border-foreground/50 rounded-none text-base placeholder:text-muted-foreground/50 transition-colors pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-4 border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              size="lg"
              className="w-full bg-foreground hover:bg-foreground/90 text-background h-14 text-base rounded-full group"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </Button>
          </form>

          <div 
            className={`mt-8 pt-8 border-t border-foreground/10 transition-all duration-700 delay-400 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <p className="text-muted-foreground text-sm">
              {SIGNUP_CTA_VISIBLE ? (
                <>
                  Don&apos;t have an account?{" "}
                  <Link href="/auth/sign-up" className="text-foreground hover:underline underline-offset-4">
                    Create one
                  </Link>
                </>
              ) : (
                <>
                  New account registration is currently closed.{" "}
                  <Link href="/contact" className="text-foreground hover:underline underline-offset-4">
                    Contact us
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Carta-style promo panel */}
      <div className="hidden lg:flex w-1/2 relative bg-foreground text-background">
        <div className="relative z-10 flex flex-col justify-between p-16 w-full">
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] opacity-70">Now live</span>
          <div>
            <h2 className="font-serif font-normal text-[clamp(2rem,3.4vw,3.25rem)] leading-[1.05] tracking-tight max-w-xl">
              Automation, precision, and insight — everywhere you raise.
            </h2>
            <p className="mt-6 text-base opacity-80 leading-relaxed max-w-md">
              Investor matching, outreach, cap table, and fund operations in one AI-native workspace. The numbers that have to be exact are computed on Anker&apos;s engine — not estimated.
            </p>
            {/* plug-into diagram */}
            <div className="mt-12 relative border border-background/15 rounded-xl p-8 max-w-md overflow-hidden">
              <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1.5px)", backgroundSize: "18px 18px" }} />
              <div className="relative grid grid-cols-2 gap-3">
                {["Discover", "Outreach", "Cap Table", "Fund OS"].map((n) => (
                  <div key={n} className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 bg-[#e5380f]" />
                    {n}
                  </div>
                ))}
              </div>
              <div className="relative mt-5 pt-5 border-t border-background/15 text-[11px] font-mono uppercase tracking-[0.16em] opacity-70">
                One workspace · every stage
              </div>
            </div>
          </div>
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] opacity-60">Anker — the AI platform to build your fundraise</div>
        </div>
      </div>
    </div>
  )
}
