"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Mail, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnimatedTesseract } from "@/components/anker/animated-tesseract";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) throw error;
      setIsSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

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
          href="/auth/login" 
          className={`inline-flex items-center gap-3 text-sm font-mono text-muted-foreground hover:text-foreground transition-all duration-500 mb-12 group ${
            isVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
          }`}
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          Back to sign in
        </Link>

        <div className="max-w-md">
          {!isSubmitted ? (
            <>
              {/* Eyebrow */}
              <div 
                className={`mb-6 transition-all duration-700 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground">
                  <span className="w-8 h-px bg-foreground/30" />
                  Password recovery
                </span>
              </div>

              {/* Heading */}
              <h1 
                className={`text-[clamp(2.5rem,6vw,4rem)] font-display leading-[0.95] tracking-tight mb-6 transition-all duration-1000 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
              >
                Reset your
                <br />
                <span className="relative">
                  password
                  <span className="absolute -bottom-1 left-0 right-0 h-2 bg-foreground/10" />
                </span>
              </h1>

              <p 
                className={`text-lg text-muted-foreground leading-relaxed mb-12 transition-all duration-700 delay-200 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>

              <form 
                onSubmit={handleSubmit} 
                className={`space-y-6 transition-all duration-700 delay-300 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                <div className="space-y-2">
                  <label htmlFor="email" className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                    Email address
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

                {error && (
                  <div className="p-4 border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isLoading}
                  size="lg"
                  className="w-full bg-foreground hover:bg-foreground/90 text-background h-14 text-base rounded-full group"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      Send reset link
                      <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </Button>
              </form>
            </>
          ) : (
            /* Success State */
            <>
              <div 
                className={`mb-8 transition-all duration-700 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                <div className="w-16 h-16 rounded-full border-2 border-foreground/20 flex items-center justify-center mb-6">
                  <Mail className="w-7 h-7 text-foreground" />
                </div>
              </div>

              <h1 
                className={`text-[clamp(2.5rem,6vw,4rem)] font-display leading-[0.95] tracking-tight mb-6 transition-all duration-1000 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
              >
                Check your
                <br />
                <span className="relative">
                  email
                  <span className="absolute -bottom-1 left-0 right-0 h-2 bg-foreground/10" />
                </span>
              </h1>

              <p 
                className={`text-lg text-muted-foreground leading-relaxed mb-8 transition-all duration-700 delay-200 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                We&apos;ve sent a password reset link to <span className="text-foreground">{email}</span>. 
                Click the link to reset your password.
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
                    Back to sign in
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button
                  onClick={() => setIsSubmitted(false)}
                  size="lg"
                  variant="outline"
                  className="w-full h-14 text-base rounded-full border-foreground/20 hover:bg-foreground/5"
                >
                  Try another email
                </Button>
              </div>
            </>
          )}

          <div 
            className={`mt-8 pt-8 border-t border-foreground/10 transition-all duration-700 delay-400 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <p className="text-muted-foreground text-sm">
              Remember your password?{" "}
              <Link href="/auth/login" className="text-foreground hover:underline underline-offset-4">
                Sign in
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
  );
}
