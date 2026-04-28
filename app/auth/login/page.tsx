"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react"
import { AnimatedTesseract } from "@/components/tesseract/animated-tesseract"

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

  // Dev-mode one-click bypass — signs in as the configured admin user
  // (defaults to masindetphilippe@gmail.com) without entering credentials.
  const handleBypass = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/auth/dev-bypass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "masindetphilippe@gmail.com" }),
        credentials: "same-origin",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || "Bypass disabled in this environment")
        setLoading(false)
        return
      }
      window.location.assign(next)
    } catch (err: any) {
      setError(err?.message || "Bypass failed")
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
            className={`text-[clamp(2.5rem,6vw,4rem)] font-display leading-[0.95] tracking-tight mb-6 transition-all duration-1000 ${
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

            {/* Dev-mode bypass — only renders in local environments */}
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-foreground/10" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                <span className="bg-background px-2 text-muted-foreground font-mono">Dev only</span>
              </div>
            </div>
            <Button
              type="button"
              onClick={handleBypass}
              disabled={loading}
              size="lg"
              variant="outline"
              className="w-full h-12 text-sm rounded-full border-foreground/20 hover:bg-foreground/5"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <>
                  Skip auth — sign in as admin (Philippe)
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
              Don&apos;t have an account?{" "}
              <Link href="/auth/sign-up" className="text-foreground hover:underline underline-offset-4">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Tesseract animation */}
      <div className="hidden lg:flex w-1/2 items-center justify-center relative">
        <div 
          className={`w-[600px] h-[600px] transition-all duration-1000 delay-500 ${
            isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95"
          }`}
        >
          <AnimatedTesseract />
        </div>
      </div>
    </div>
  )
}
