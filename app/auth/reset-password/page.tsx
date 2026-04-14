"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnimatedTesseract } from "@/components/anker/animated-tesseract";

const passwordRequirements = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /\d/.test(p) },
];

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const allRequirementsMet = passwordRequirements.every((req) => req.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit = allRequirementsMet && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;
      setIsSuccess(true);
      
      setTimeout(() => {
        router.push("/auth/login");
      }, 3000);
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
          {!isSuccess ? (
            <>
              {/* Eyebrow */}
              <div 
                className={`mb-6 transition-all duration-700 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground">
                  <span className="w-8 h-px bg-foreground/30" />
                  Set new password
                </span>
              </div>

              {/* Heading */}
              <h1 
                className={`text-[clamp(2.5rem,6vw,4rem)] font-display leading-[0.95] tracking-tight mb-6 transition-all duration-1000 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
              >
                Create a new
                <br />
                <span className="relative">
                  password
                  <span className="absolute -bottom-1 left-0 right-0 h-2 bg-foreground/10" />
                </span>
              </h1>

              <p 
                className={`text-lg text-muted-foreground leading-relaxed mb-10 transition-all duration-700 delay-200 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                Create a strong password for your account.
              </p>

              <form 
                onSubmit={handleSubmit} 
                className={`space-y-5 transition-all duration-700 delay-300 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                {/* New Password */}
                <div className="space-y-2">
                  <label htmlFor="password" className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                    New password
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter new password"
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

                {/* Password Requirements - Optimus style */}
                {password.length > 0 && (
                  <div className="p-4 border border-foreground/10 space-y-3">
                    <span className="font-mono text-xs text-muted-foreground uppercase">
                      Password requirements
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {passwordRequirements.map((req) => {
                        const isMet = req.test(password);
                        return (
                          <div
                            key={req.label}
                            className={`flex items-center gap-3 text-xs font-mono transition-colors ${
                              isMet ? "text-foreground" : "text-muted-foreground/50"
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                              isMet ? "border-foreground bg-foreground" : "border-foreground/20"
                            }`}>
                              {isMet && <Check className="w-2.5 h-2.5 text-background" />}
                            </div>
                            {req.label}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Confirm Password */}
                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                    Confirm password
                  </label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      required
                      className={`h-14 bg-transparent rounded-none text-base placeholder:text-muted-foreground/50 transition-colors pr-12 ${
                        confirmPassword.length > 0
                          ? passwordsMatch
                            ? "border-foreground/50"
                            : "border-destructive"
                          : "border-foreground/20 focus:border-foreground/50"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {confirmPassword.length > 0 && !passwordsMatch && (
                    <p className="text-sm text-destructive">Passwords do not match</p>
                  )}
                </div>

                {error && (
                  <div className="p-4 border border-destructive/30 bg-destructive/5 text-destructive text-sm">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={!canSubmit || isLoading}
                  size="lg"
                  className="w-full bg-foreground hover:bg-foreground/90 text-background h-14 text-base rounded-full group"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      Reset password
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
                <div className="w-16 h-16 rounded-full bg-foreground flex items-center justify-center mb-6">
                  <Check className="w-7 h-7 text-background" />
                </div>
              </div>

              <h1 
                className={`text-[clamp(2.5rem,6vw,4rem)] font-display leading-[0.95] tracking-tight mb-6 transition-all duration-1000 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
              >
                Password
                <br />
                <span className="relative">
                  updated
                  <span className="absolute -bottom-1 left-0 right-0 h-2 bg-foreground/10" />
                </span>
              </h1>

              <p 
                className={`text-lg text-muted-foreground leading-relaxed mb-8 transition-all duration-700 delay-200 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
              >
                Your password has been successfully reset. You&apos;ll be redirected to the sign in page shortly.
              </p>

              <Button 
                asChild
                size="lg"
                className="w-full bg-foreground hover:bg-foreground/90 text-background h-14 text-base rounded-full group"
              >
                <Link href="/auth/login">
                  Sign in now
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
            </>
          )}
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
