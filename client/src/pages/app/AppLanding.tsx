import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Sparkles, Target, TrendingUp, Users, Zap, ChevronDown } from "lucide-react";
import Video from '@/framer/video';
import Primary from '@/framer/primary';
import Secondary from '@/framer/secondary';

export default function AppLanding() {
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      if (user.onboardingCompleted) {
        window.location.href = "/app/dashboard";
      } else {
        window.location.href = "/app/onboarding";
      }
    }
  }, [isLoading, isAuthenticated, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const features = [
    {
      icon: Sparkles,
      title: "AI-Powered Matching",
      description: "Advanced algorithms connect founders with ideal investors based on preferences and track record.",
      color: "rgb(251, 194, 213)"
    },
    {
      icon: Target,
      title: "Deal Flow Management",
      description: "Streamline your pipeline with intelligent tracking and automated follow-ups.",
      color: "rgb(142, 132, 247)"
    },
    {
      icon: TrendingUp,
      title: "Analytics Dashboard",
      description: "Real-time insights into your fundraising progress and investor engagement.",
      color: "rgb(196, 227, 230)"
    },
    {
      icon: Users,
      title: "Investor CRM",
      description: "Manage all your investor relationships in one powerful, intuitive platform.",
      color: "rgb(254, 212, 92)"
    }
  ];

  return (
    <div className="min-h-screen bg-[rgb(18,18,18)] text-white overflow-hidden">
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="fixed top-0 left-0 right-0 z-50 px-6 py-4"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <Link href="/" className="text-white text-xl font-light tracking-wider" data-testid="link-logo">
            Anker<sup className="text-xs">®</sup>
          </Link>
          
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/portfolio" className="text-white/70 text-sm font-light hover:text-white transition-colors">
              Portfolio
            </Link>
            <Link href="/vision" className="text-white/70 text-sm font-light hover:text-white transition-colors">
              Vision
            </Link>
            <Link href="/team" className="text-white/70 text-sm font-light hover:text-white transition-colors">
              Team
            </Link>
          </nav>
          
          <Secondary 
            text="Sign In" 
            link="/api/login"
            style={{ transform: 'scale(0.9)' }}
            data-testid="button-nav-signin"
          />
        </div>
      </motion.header>

      <section className="relative flex flex-col items-center justify-center overflow-hidden bg-[rgb(18,18,18)]" style={{ height: '100vh', minHeight: '100vh' }}>
        <div className="absolute inset-0 w-full h-full">
          <Video 
            file="https://framerusercontent.com/assets/MLWPbW1dUQawJLhhun3dBwpgJak.mp4"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          <div className="absolute inset-0 bg-black/50" />
        </div>

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="inline-block mb-8"
          >
            <span 
              className="px-4 py-2 rounded-full text-xs font-medium tracking-[0.2em] uppercase border border-white/20 text-white/80 bg-white/5"
              data-testid="badge-platform"
            >
              INVESTOR PLATFORM
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="text-5xl md:text-7xl lg:text-8xl font-light leading-tight mb-8"
            data-testid="text-hero-title"
          >
            <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>Connect</span>{" "}
            <span className="text-white font-extralight">with</span>
            <br />
            <span className="text-white font-extralight">the Right Investors</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="text-white/60 text-lg md:text-xl max-w-xl mx-auto mb-12 font-light"
            data-testid="text-hero-description"
          >
            Access exclusive deal flow, manage your portfolio, and connect with promising startups through our AI-powered platform.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.9 }}
            className="flex flex-wrap items-center justify-center gap-4"
          >
            <Primary 
              text="Get Started" 
              link="/api/login"
              style={{ width: 'auto' }}
            />
            <Secondary 
              text="Learn More" 
              link="/vision"
              style={{ width: 'auto' }}
            />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.2 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-white/40"
          >
            <ChevronDown className="w-8 h-8" />
          </motion.div>
        </motion.div>
      </section>

      <section className="py-24 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-20"
          >
            <span className="text-white/40 text-xs tracking-[0.3em] uppercase mb-6 block">PLATFORM FEATURES</span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-light text-white mb-2" data-testid="text-features-title">
              Everything you need to
            </h2>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-light text-white">
              <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>succeed</span>{" "}
              <span className="text-white/40">in fundraising</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, idx) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1, duration: 0.5 }}
                className="p-8 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all duration-300"
                data-testid={`card-feature-${idx}`}
              >
                <div 
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
                  style={{ backgroundColor: `${feature.color}20` }}
                >
                  <feature.icon className="w-7 h-7" style={{ color: feature.color }} />
                </div>
                <h3 className="text-xl font-medium text-white mb-3">{feature.title}</h3>
                <p className="text-white/50 font-light leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative h-[60vh] min-h-[400px] overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src="https://framerusercontent.com/images/gtxhO5eQb8zTp6csYDNAsGA9k.jpg" 
            alt="Team" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/50" />
        </div>

        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-4xl md:text-6xl lg:text-7xl font-light text-white mb-8"
            data-testid="text-cta-title"
          >
            Ready to get
            <br />
            <span className="italic" style={{ fontFamily: 'serif' }}>started?</span>
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Primary 
              text="Join Now" 
              link="/api/login"
              style={{ width: 'auto' }}
            />
          </motion.div>
        </div>
      </section>

      <footer className="py-16 bg-[rgb(18,18,18)] border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Link href="/" className="text-white text-xl font-light tracking-wider">
              Anker<sup className="text-xs">®</sup>
            </Link>
            <p className="text-white/30 text-sm">
              © 2024 Anker. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
