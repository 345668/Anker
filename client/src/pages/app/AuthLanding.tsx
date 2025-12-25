import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { 
  Zap, Shield, ArrowRight, Sparkles, Lock, Users, 
  TrendingUp, Globe, CheckCircle, ExternalLink
} from "lucide-react";
import {
  GlassSurface,
  RainbowButton,
  LiquidGlassStyles,
  UnderGlow,
  Pill
} from "@/components/liquid-glass";

function VideoBackground() {
  const [videoError, setVideoError] = useState(false);
  const prefersReducedMotion = typeof window !== 'undefined' 
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className="fixed inset-0 -z-20 overflow-hidden" data-testid="video-background">
      {!prefersReducedMotion && !videoError && (
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute min-w-full min-h-full object-cover opacity-30"
          onError={() => setVideoError(true)}
          data-testid="video-background-player"
        >
          <source
            src="https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_30fps.mp4"
            type="video/mp4"
          />
        </video>
      )}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/95 via-purple-900/60 to-slate-900/95" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.2),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(236,72,153,0.15),transparent_50%)]" />
    </div>
  );
}

function FloatingOrbs() {
  const prefersReducedMotion = typeof window !== 'undefined' 
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" data-testid="floating-orbs">
      <div className={`absolute -top-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-[100px] ${!prefersReducedMotion ? 'animate-pulse' : ''}`} />
      <div className={`absolute top-1/3 -right-20 w-60 h-60 bg-pink-500/15 rounded-full blur-[80px] ${!prefersReducedMotion ? 'animate-pulse' : ''}`} style={!prefersReducedMotion ? { animationDelay: '1s' } : undefined} />
      <div className={`absolute -bottom-40 left-1/3 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] ${!prefersReducedMotion ? 'animate-pulse' : ''}`} style={!prefersReducedMotion ? { animationDelay: '2s' } : undefined} />
    </div>
  );
}

export default function AuthLanding() {
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleLogin = () => {
    setIsRedirecting(true);
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen text-white relative flex flex-col">
      <LiquidGlassStyles />
      <VideoBackground />
      <FloatingOrbs />

      <nav className="relative z-10 border-b border-white/10 backdrop-blur-2xl bg-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <a href="/" className="flex items-center gap-3" data-testid="link-logo">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl blur-lg opacity-50" />
                <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center border border-white/20">
                  <Zap className="w-5 h-5 text-white" />
                </div>
              </div>
              <span className="text-xl font-medium bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                Anker Platform
              </span>
            </a>
            <a href="/" className="text-white/60 hover:text-white text-sm transition-colors" data-testid="link-back-home">
              Back to Home
            </a>
          </div>
        </div>
      </nav>

      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-5xl w-full">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <Pill className="mb-6" data-testid="pill-secure">
              <Lock className="w-3 h-3" />
              Secure Authentication
            </Pill>
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white via-purple-200 to-pink-200 bg-clip-text text-transparent mb-4" data-testid="text-auth-title">
              Sign in to Anker
            </h1>
            <p className="text-lg text-white/60 max-w-lg mx-auto" data-testid="text-auth-subtitle">
              Access your investor network, manage deals, and connect with the right opportunities.
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-2 gap-8 items-stretch">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="relative"
            >
              <UnderGlow className="opacity-40" />
              <GlassSurface className="p-8 h-full">
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <Shield className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Continue with Replit</h2>
                      <p className="text-sm text-slate-600 dark:text-white/50">Secure, fast, and easy</p>
                    </div>
                  </div>

                  <p className="text-slate-600 dark:text-white/70 text-sm leading-relaxed">
                    We use Replit for authentication to keep your account secure. You'll be redirected to Replit to sign in, then returned to Anker.
                  </p>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-slate-700 dark:text-white/80 text-sm">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                      </div>
                      <span>No password to remember</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-700 dark:text-white/80 text-sm">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                      </div>
                      <span>Enterprise-grade security</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-700 dark:text-white/80 text-sm">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                      </div>
                      <span>Your data stays private</span>
                    </div>
                  </div>

                  <div className="pt-4">
                    <RainbowButton 
                      onClick={handleLogin}
                      disabled={isRedirecting}
                      className="w-full"
                      data-testid="button-continue-replit"
                    >
                      {isRedirecting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                          Redirecting...
                        </>
                      ) : (
                        <>
                          Continue with Replit
                          <ExternalLink className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </RainbowButton>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-white/40 text-center pt-2">
                    By continuing, you agree to our Terms of Service and Privacy Policy.
                  </p>
                </div>
              </GlassSurface>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="space-y-4"
            >
              <GlassSurface className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-white mb-1">Connect with 2,500+ Investors</h3>
                    <p className="text-sm text-slate-600 dark:text-white/60">Access our curated network of active VCs, angels, and family offices.</p>
                  </div>
                </div>
              </GlassSurface>

              <GlassSurface className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-white mb-1">$850M+ Deals Facilitated</h3>
                    <p className="text-sm text-slate-600 dark:text-white/60">Join thousands of founders who've successfully raised through Anker.</p>
                  </div>
                </div>
              </GlassSurface>

              <GlassSurface className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                    <Globe className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-white mb-1">Global Reach, 45+ Countries</h3>
                    <p className="text-sm text-slate-600 dark:text-white/60">Connect with investors and startups from around the world.</p>
                  </div>
                </div>
              </GlassSurface>

              <GlassSurface className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-pink-500/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-pink-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-white mb-1">AI-Powered Matching</h3>
                    <p className="text-sm text-slate-600 dark:text-white/60">Our AI finds the perfect investor-founder matches based on preferences.</p>
                  </div>
                </div>
              </GlassSurface>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-center mt-12"
          >
            <p className="text-white/40 text-sm">
              New to Anker?{" "}
              <button 
                onClick={handleLogin}
                className="text-purple-400 hover:text-purple-300 transition-colors underline underline-offset-2"
                data-testid="link-create-account"
              >
                Create an account
              </button>
              {" "}— it's free to get started.
            </p>
          </motion.div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 py-6">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <p className="text-white/30 text-sm">
            © 2024 Anker. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <a href="/privacy" className="text-white/40 hover:text-white/60 text-sm transition-colors" data-testid="link-privacy">Privacy</a>
            <a href="/terms" className="text-white/40 hover:text-white/60 text-sm transition-colors" data-testid="link-terms">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
