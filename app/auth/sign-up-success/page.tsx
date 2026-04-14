"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Mail, ArrowRight, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimatedTesseract } from "@/components/anker/animated-tesseract"

export default function SignUpSuccessPage() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(true)
  }, [])

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

      {/* Left side - Content */}
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
          {/* Success indicator */}
          <div 
            className={`mb-8 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <div className="w-16 h-16 rounded-full border-2 border-foreground/20 flex items-center justify-center mb-6">
              <Mail className="w-7 h-7 text-foreground" />
            </div>
          </div>

          {/* Heading */}
          <h1 
            className={`text-[clamp(2.5rem,6vw,4rem)] font-display leading-[0.95] tracking-tight mb-6 transition-all duration-1000 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            Check your
            <br />
            <span className="relative">
              inbox
              <span className="absolute -bottom-1 left-0 right-0 h-2 bg-foreground/10" />
            </span>
          </h1>

          <p 
            className={`text-lg text-muted-foreground leading-relaxed mb-8 transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            We&apos;ve sent you a confirmation link. Click the link in your email to activate your account and start connecting with investors.
          </p>

          <div 
            className={`space-y-4 transition-all duration-700 delay-300 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <Button 
              asChild
              size="lg"
              className="w-full bg-foreground hover:bg-foreground/90 text-background h-14 text-base rounded-full group"
            >
              <Link href="/auth/login">
                Continue to sign in
                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button 
              asChild
              size="lg"
              variant="outline" 
              className="w-full h-14 text-base rounded-full border-foreground/20 hover:bg-foreground/5"
            >
              <Link href="/">
                Return to home
              </Link>
            </Button>
          </div>

          <p 
            className={`text-sm text-muted-foreground mt-8 font-mono transition-all duration-700 delay-400 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            Didn&apos;t receive the email? Check your spam folder.
          </p>
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
