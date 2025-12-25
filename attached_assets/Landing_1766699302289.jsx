import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Globe,
  Rocket,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

const GLOBAL_STYLE_ID = 'synergyai-global-keyframes-v1';

function ensureGlobalStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(GLOBAL_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = GLOBAL_STYLE_ID;
  style.setAttribute('data-owner', 'SynergyAI');
  style.textContent = `
    @keyframes synergyai-gradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    .synergyai-animate-gradient { animation: synergyai-gradient 6s ease infinite; }

    @keyframes synergyai-marquee {
      from { transform: translateX(0); }
      to { transform: translateX(-50%); }
    }
    .synergyai-animate-marquee { animation: synergyai-marquee 30s linear infinite; }

    @keyframes synergyai-orbit {
      from { transform: rotate(0deg) translateX(140px) rotate(0deg); }
      to { transform: rotate(360deg) translateX(140px) rotate(-360deg); }
    }
  `;
  document.head.appendChild(style);
}

function runSelfTests() {
  if (typeof document !== 'undefined') {
    const els = document.querySelectorAll(`#${GLOBAL_STYLE_ID}`);
    if (els.length > 1) {
      console.error(`[SynergyAI] Self-test failed: expected 1 global style tag, found ${els.length}.`);
    }
  }
}

const AnimatedGridPattern = () => {
  return (
    <div className="absolute inset-0 opacity-20">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to right, rgb(168 85 247 / 0.1) 1px, transparent 1px),
                           linear-gradient(to bottom, rgb(59 130 246 / 0.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }}
      />
    </div>
  );
};

const LiquidGlassCard = ({ children, className = '', gradient = '' }) => {
  return (
    <div className={`relative group ${className}`}>
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-30 rounded-3xl blur-2xl group-hover:opacity-50 group-hover:blur-3xl transition-all duration-700`}
      />

      <div className="relative backdrop-blur-xl bg-gradient-to-br from-white/50 to-white/30 border border-white/60 rounded-3xl shadow-lg hover:shadow-xl transition-all duration-500 overflow-hidden">
        <div className="absolute inset-px rounded-3xl bg-gradient-to-br from-white/60 via-white/40 to-white/30 pointer-events-none" />

        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
          <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:left-full transition-all duration-1000 ease-out" />
          <div className="absolute bottom-0 -right-full w-full h-full bg-gradient-to-l from-transparent via-purple-200/30 to-transparent group-hover:right-full transition-all duration-1200 ease-out delay-100" />
        </div>

        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-400/10 via-pink-400/10 to-blue-400/10 animate-pulse" />
        </div>

        <div className="relative">{children}</div>
      </div>
    </div>
  );
};

const ColorfulParticles = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();

    const particles = [];
    const particleCount = 60;
    const colors = [
      'rgba(168, 85, 247, 0.6)',
      'rgba(236, 72, 153, 0.6)',
      'rgba(251, 146, 60, 0.6)',
      'rgba(250, 204, 21, 0.6)',
      'rgba(34, 197, 94, 0.6)',
      'rgba(59, 130, 246, 0.6)',
    ];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        size: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let raf = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      }

      raf = requestAnimationFrame(animate);
    };

    animate();

    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />;
};

const OrbitingIcons = () => {
  const icons = [
    { Icon: Sparkles, color: 'from-purple-500 to-pink-500', delay: 0 },
    { Icon: Target, color: 'from-pink-500 to-orange-500', delay: 1 },
    { Icon: TrendingUp, color: 'from-orange-500 to-yellow-500', delay: 2 },
    { Icon: Rocket, color: 'from-green-500 to-blue-500', delay: 3 },
  ];

  return (
    <div className="relative w-80 h-80 mx-auto">
      <div
        className="absolute inset-0 rounded-full border-2 border-white/40 backdrop-blur-sm shadow-lg"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1))' }}
      />
      <div
        className="absolute inset-8 rounded-full border-2 border-white/40 backdrop-blur-sm shadow-lg"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1))' }}
      />
      <div
        className="absolute inset-16 rounded-full border-2 border-white/40 backdrop-blur-sm shadow-lg"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1))' }}
      />

      {icons.map(({ Icon, color, delay }, idx) => (
        <div
          key={idx}
          className="absolute group"
          style={{
            animation: 'synergyai-orbit 10s linear infinite',
            animationDelay: `${delay * 2.5}s`,
            top: '50%',
            left: '50%',
            marginTop: '-2rem',
            marginLeft: '-2rem',
          }}
        >
          <div className="relative w-16 h-16">
            <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-60 rounded-2xl blur-lg group-hover:blur-xl transition-all`} />
            <div
              className={`relative w-full h-full backdrop-blur-xl bg-gradient-to-br ${color} rounded-2xl flex items-center justify-center shadow-2xl border border-white/50 overflow-hidden`}
            >
              <div className="absolute inset-px rounded-2xl bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
              <Icon className="w-8 h-8 text-white relative z-10" />
            </div>
          </div>
        </div>
      ))}

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-28 h-28">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500 via-pink-500 via-orange-500 via-yellow-500 via-green-500 to-blue-500 rounded-full blur-2xl opacity-70 animate-pulse" />
          <div className="relative w-full h-full backdrop-blur-xl bg-gradient-to-br from-purple-600/80 via-pink-600/80 via-orange-500/80 via-yellow-500/80 via-green-500/80 to-blue-600/80 rounded-full flex items-center justify-center shadow-2xl border-2 border-white/60 overflow-hidden">
            <div className="absolute inset-0.5 rounded-full bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
            <Zap className="w-14 h-14 text-white relative z-10" />
          </div>
        </div>
      </div>
    </div>
  );
};

const LiquidRainbowButton = ({ children, className = '', onClick, href }) => {
  const content = (
    <>
      <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 via-orange-500 via-yellow-500 via-green-500 to-blue-600 bg-[length:200%_100%] synergyai-animate-gradient" />
      <div className="absolute inset-0 backdrop-blur-sm bg-white/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
      <div className="absolute inset-px rounded-full bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
      <span className="relative z-10 flex items-center space-x-2 text-lg font-semibold text-white drop-shadow-lg">{children}</span>
    </>
  );

  if (href) {
    return (
      <Link to={href} className={`group relative px-8 py-4 rounded-full overflow-hidden inline-flex ${className}`}>
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={`group relative px-8 py-4 rounded-full overflow-hidden ${className}`}>
      {content}
    </button>
  );
};

const Marquee = ({ children }) => {
  return (
    <div className="relative flex overflow-hidden py-4">
      <div className="flex gap-8 synergyai-animate-marquee">
        {children}
        {children}
      </div>
    </div>
  );
};

export default function Landing() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ensureGlobalStyles();
    runSelfTests();

    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
      } catch (e) {
        // Not authenticated
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const stats = [
    { value: '10K+', label: 'Active Users', icon: Users, gradient: 'from-purple-500 to-pink-500' },
    { value: '$2.5B', label: 'Capital Raised', icon: TrendingUp, gradient: 'from-orange-500 to-yellow-500' },
    { value: '94%', label: 'Match Success', icon: Star, gradient: 'from-yellow-500 to-green-500' },
    { value: '150+', label: 'Countries', icon: Globe, gradient: 'from-green-500 to-blue-500' },
  ];

  const features = [
    {
      icon: Sparkles,
      title: 'AI-Powered Matching',
      description:
        'Advanced algorithms analyze founder vision, market fit, and investor preferences to create perfect partnerships.',
      gradient: 'from-purple-500 to-pink-500',
    },
    {
      icon: Users,
      title: 'Curated Network',
      description: 'Access a vetted community of ambitious founders and strategic investors across all industries.',
      gradient: 'from-orange-500 to-yellow-500',
    },
    {
      icon: TrendingUp,
      title: 'Data-Driven Insights',
      description: 'Real-time analytics and compatibility scores ensure meaningful connections that drive growth.',
      gradient: 'from-green-500 to-blue-500',
    },
  ];

  const startups = [
    { 
      name: 'Finetaste', 
      logo: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69285567039f33f9c7d8756f/8946802d5_Screenshot2025-12-16at92632PM.png',
      color: 'from-purple-500 to-pink-500',
      website: 'https://www.finetaste.it/en/collections/cantina-pisoni-vini-biologici-trentini'
    },
    { 
      name: 'Kinu Health', 
      logo: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69285567039f33f9c7d8756f/7c8c922ff_Screenshot2025-12-16at84801PM.png',
      color: 'from-pink-500 to-orange-500',
      website: 'https://www.kinuhealth.com'
    },
    { 
      name: 'PERFI', 
      logo: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69285567039f33f9c7d8756f/e748c4d88_Screenshot2025-12-16at85009PM.png',
      color: 'from-orange-500 to-yellow-500',
      website: 'https://perfi.dk'
    },
    { 
      name: 'Mint Town', 
      logo: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69285567039f33f9c7d8756f/7f1dab686_Screenshot2025-12-16at85023PM.png',
      color: 'from-yellow-500 to-green-500',
      website: 'https://minttown.jp'
    },
    { 
      name: 'CAPSERO', 
      logo: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69285567039f33f9c7d8756f/ef51fe474_Screenshot2025-12-16at84940PM.png',
      color: 'from-green-500 to-blue-500',
      website: 'https://capsero.com'
    },
    { 
      name: 'Alga Biologics', 
      logo: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69285567039f33f9c7d8756f/308321bc4_Screenshot2025-12-16at85034PM.png',
      color: 'from-blue-500 to-purple-500',
      website: 'https://www.algabiologics.com/en'
    },
    { 
      name: 'Cascade Geomatics', 
      logo: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69285567039f33f9c7d8756f/c20c5bee2_Screenshot2025-12-16at85100PM.png',
      color: 'from-purple-500 to-pink-500',
      website: 'https://cascadegeomatics.com'
    },
    { 
      name: 'NXZSOUND', 
      logo: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69285567039f33f9c7d8756f/72326c776_Screenshot2025-12-16at85112PM.png',
      color: 'from-pink-500 to-orange-500',
      website: 'https://nxzsound.com'
    },
    { 
      name: 'Nextvisit', 
      logo: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69285567039f33f9c7d8756f/d8c38e2ac_Screenshot2025-12-16at85149PM.png',
      color: 'from-orange-500 to-yellow-500',
      website: 'https://nextvisit.ai'
    },
    { 
      name: 'SilviBio', 
      logo: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69285567039f33f9c7d8756f/a915940d1_Screenshot2025-12-16at85205PM.png',
      color: 'from-yellow-500 to-green-500',
      website: 'https://www.silvibio.com'
    },
  ];

  const partners = [
    { 
      name: 'Costa Norte & Company', 
      logo: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69285567039f33f9c7d8756f/22f8ee03f_Screenshot2025-12-16at93016PM.png',
      color: 'from-green-500 to-blue-500',
      website: 'https://www.costanortecapital.com'
    },
    { 
      name: 'SaaSXperts', 
      logo: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69285567039f33f9c7d8756f/54bd3849b_Screenshot2025-12-16at93709PM.png',
      color: 'from-blue-500 to-purple-500',
      website: 'https://www.saasxperts.net/?locale=en'
    },
    { 
      name: 'DigiCorp', 
      logo: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69285567039f33f9c7d8756f/48387c3c4_Screenshot2025-12-16at93131PM.png',
      color: 'from-purple-500 to-pink-500',
      website: 'https://www.digi-corp.co'
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30 text-slate-900 overflow-hidden relative">
      <div
        className="pointer-events-none fixed inset-0 z-30 transition duration-300"
        style={{
          background: `radial-gradient(600px at ${mousePosition.x}px ${mousePosition.y}px, rgba(168, 85, 247, 0.15), transparent 80%)`,
        }}
      />

      <div className="fixed inset-0">
        <AnimatedGridPattern />
        <ColorfulParticles />

        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-gradient-to-br from-purple-400/30 to-pink-400/30 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-gradient-to-br from-orange-400/30 to-yellow-400/30 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1s' }}
        />
        <div
          className="absolute bottom-0 left-1/3 w-[450px] h-[450px] bg-gradient-to-br from-green-400/30 to-blue-400/30 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '2s' }}
        />
      </div>

      <nav className="relative z-50 border-b border-white/60 backdrop-blur-2xl bg-gradient-to-r from-white/50 to-white/40 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-r from-white/30 to-white/20 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 py-4 relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500 via-pink-500 to-blue-500 rounded-2xl blur-md group-hover:blur-lg transition-all" />
                <div className="relative w-12 h-12 backdrop-blur-xl rounded-2xl bg-gradient-to-br from-purple-600/90 via-pink-600/90 via-orange-500/90 via-yellow-500/90 via-green-500/90 to-blue-600/90 flex items-center justify-center shadow-xl border-2 border-white/60 overflow-hidden">
                  <div className="absolute inset-0.5 rounded-2xl bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
                  <Zap className="w-7 h-7 text-white relative z-10" />
                </div>
              </div>
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent drop-shadow-sm">
                SynergyAI
              </span>
            </div>

            <div className="hidden md:flex items-center space-x-6">
              <a href="#features" className="text-slate-700 hover:text-purple-600 transition-colors relative group font-medium">
                Features
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-purple-500 to-pink-500 group-hover:w-full transition-all duration-300" />
              </a>
              <a href="#how" className="text-slate-700 hover:text-purple-600 transition-colors relative group font-medium">
                How It Works
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-orange-500 to-yellow-500 group-hover:w-full transition-all duration-300" />
              </a>
              <a href="#testimonials" className="text-slate-700 hover:text-purple-600 transition-colors relative group font-medium">
                Testimonials
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-green-500 to-blue-500 group-hover:w-full transition-all duration-300" />
              </a>

              {user ? (
                <LiquidRainbowButton href={user.onboarding_completed ? createPageUrl('Dashboard') : createPageUrl('Onboarding')}>
                  {user.onboarding_completed ? 'Dashboard' : 'Complete Setup'}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </LiquidRainbowButton>
              ) : (
                <>
                  <button
                    onClick={() => base44.auth.redirectToLogin(createPageUrl('Dashboard'))}
                    className="text-slate-700 hover:text-purple-600 transition-colors font-semibold"
                  >
                    Log in
                  </button>

                  <LiquidRainbowButton href={createPageUrl('Onboarding')}>
                    Get Started
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </LiquidRainbowButton>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      <section className="relative z-10 pt-20 pb-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full mb-8 backdrop-blur-xl bg-gradient-to-r from-purple-100/80 to-pink-100/80 border border-white/60 shadow-lg relative overflow-hidden">
                <div className="absolute inset-px rounded-full bg-gradient-to-r from-white/40 to-transparent pointer-events-none" />
                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 animate-pulse relative z-10" />
                <span className="text-sm font-medium bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent relative z-10">
                  AI-Powered Matchmaking Platform
                </span>
              </div>

              <h1 className="text-6xl lg:text-7xl font-bold mb-6 leading-tight">
                Where Vision Meets
                <span className="block mt-2 bg-gradient-to-r from-purple-600 via-pink-600 via-orange-500 via-yellow-500 via-green-500 to-blue-600 bg-clip-text text-transparent synergyai-animate-gradient bg-[length:200%_100%]">
                  Capital
                </span>
              </h1>

              <p className="text-xl text-slate-600 mb-10 leading-relaxed max-w-xl">
                Connect founders with their ideal investors through intelligent matching. Build partnerships that transform ideas into unicorns.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link to={createPageUrl('Onboarding')}>
                  <LiquidRainbowButton>
                    Start Matching
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </LiquidRainbowButton>
                </Link>

                <button className="group px-8 py-4 rounded-full backdrop-blur-xl bg-white/50 border-2 border-white/60 hover:bg-white/70 transition-all text-lg font-semibold flex items-center justify-center space-x-2 text-slate-700 shadow-lg overflow-hidden relative">
                  <div className="absolute inset-0.5 rounded-full bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
                  <span className="relative z-10">Watch Demo</span>
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform relative z-10" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6 mt-12">
                {stats.slice(0, 2).map((stat, idx) => (
                  <LiquidGlassCard key={idx} gradient={stat.gradient}>
                    <div className="p-6">
                      <stat.icon className="w-8 h-8 mb-3" style={{ color: 'rgb(168, 85, 247)' }} />
                      <div className={`text-3xl font-bold bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent mb-1`}>{stat.value}</div>
                      <div className="text-slate-600 text-sm font-medium">{stat.label}</div>
                    </div>
                  </LiquidGlassCard>
                ))}
              </div>
            </div>

            <div className="relative hidden lg:block">
              <div className="relative w-full h-[600px] flex items-center justify-center">
                <OrbitingIcons />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 py-16 border-y border-white/60 backdrop-blur-xl bg-gradient-to-r from-white/40 to-white/30 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-white/10 pointer-events-none" />
        <div className="mb-6 text-center text-sm text-slate-600 uppercase tracking-wider font-semibold relative">Trusted by Leading Startups</div>
        <Marquee>
          {startups.map((company, idx) => (
            <div key={idx} className="relative group">
              <div className={`absolute inset-0 bg-gradient-to-br ${company.color} opacity-20 rounded-3xl blur-xl group-hover:opacity-30 transition-all`} />
              <a 
                href={company.website} 
                target="_blank" 
                rel="noopener noreferrer"
                className={`relative flex items-center justify-center px-12 py-8 min-w-[240px] rounded-3xl backdrop-blur-xl bg-gradient-to-br ${company.color} bg-opacity-20 border-[0.5px] border-white/40 shadow-lg hover:shadow-xl transition-all overflow-hidden`}
              >
                <div className="absolute inset-0.5 rounded-3xl bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
                <img 
                  src={company.logo} 
                  alt={`${company.name} logo`}
                  className="h-32 w-full object-contain relative z-10"
                  onError={(e) => {
                    e.target.parentElement.innerHTML = `<span class="text-slate-700 font-semibold whitespace-nowrap text-lg">${company.name}</span>`;
                  }}
                />
              </a>
            </div>
          ))}
        </Marquee>
      </section>

      <section className="relative z-10 py-16 border-b border-white/60 backdrop-blur-xl bg-gradient-to-r from-white/35 to-white/25 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-r from-white/15 to-white/10 pointer-events-none" />
        <div className="mb-6 text-center text-sm text-slate-600 uppercase tracking-wider font-semibold relative">Strategic Partners</div>
        <Marquee>
          {partners.map((partner, idx) => (
            <div key={idx} className="relative group">
              <div className={`absolute inset-0 bg-gradient-to-br ${partner.color} opacity-20 rounded-3xl blur-xl group-hover:opacity-30 transition-all`} />
              <a 
                href={partner.website} 
                target="_blank" 
                rel="noopener noreferrer"
                className={`relative flex items-center justify-center px-12 py-8 min-w-[240px] rounded-3xl backdrop-blur-xl bg-gradient-to-br ${partner.color} bg-opacity-20 border-[0.5px] border-white/40 shadow-lg hover:shadow-xl transition-all overflow-hidden`}
              >
                <div className="absolute inset-0.5 rounded-3xl bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
                <img 
                  src={partner.logo} 
                  alt={`${partner.name} logo`}
                  className="h-32 w-full object-contain relative z-10"
                  onError={(e) => {
                    e.target.parentElement.innerHTML = `<span class="text-slate-700 font-semibold whitespace-nowrap text-lg">${partner.name}</span>`;
                  }}
                />
              </a>
            </div>
          ))}
        </Marquee>
      </section>

      <section id="features" className="relative z-10 py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <div className="inline-block mb-6 px-5 py-2 rounded-full backdrop-blur-xl bg-gradient-to-r from-purple-100/80 to-blue-100/80 border border-white/60 shadow-lg">
              <span className="text-sm font-semibold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">Features</span>
            </div>
            <h2 className="text-5xl lg:text-6xl font-bold mb-6">
              Built for the Future of{' '}
              <span className="bg-gradient-to-r from-orange-500 via-yellow-500 to-green-500 bg-clip-text text-transparent">Fundraising</span>
            </h2>
            <p className="text-slate-600 text-xl max-w-2xl mx-auto">Our platform combines cutting-edge AI with deep market insights</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <LiquidGlassCard key={idx} gradient={feature.gradient} className="h-full">
                <div className="p-8">
                  <div className="relative mb-6">
                    <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} rounded-2xl blur-lg opacity-60`} />
                    <div className={`relative w-16 h-16 backdrop-blur-xl rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center shadow-xl border-2 border-white/60 overflow-hidden group-hover:scale-110 transition-transform`}>
                      <div className="absolute inset-0.5 rounded-2xl bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
                      <feature.icon className="w-8 h-8 text-white relative z-10" />
                    </div>
                  </div>

                  <h3 className="text-2xl font-bold mb-4 text-slate-800">{feature.title}</h3>
                  <p className="text-slate-600 leading-relaxed mb-6">{feature.description}</p>

                  <div className={`flex items-center bg-gradient-to-r ${feature.gradient} bg-clip-text text-transparent font-semibold group-hover:translate-x-1 transition-transform`}>
                    <span className="text-sm">Learn more</span>
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </div>
                </div>
              </LiquidGlassCard>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-20 px-6 backdrop-blur-xl bg-white/30 border-y border-white/60 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-white/10 pointer-events-none" />
        <div className="max-w-6xl mx-auto relative">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, idx) => (
              <div key={idx} className="text-center group">
                <div className="relative inline-block mb-4">
                  <div className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} rounded-2xl blur-lg opacity-40 group-hover:opacity-60 transition-all`} />
                  <div className={`relative w-16 h-16 mx-auto backdrop-blur-xl rounded-2xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-xl border-2 border-white/60 group-hover:scale-110 transition-transform overflow-hidden`}>
                    <div className="absolute inset-0.5 rounded-2xl bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
                    <stat.icon className="w-8 h-8 text-white relative z-10" />
                  </div>
                </div>
                <div className={`text-4xl font-bold mb-2 bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent`}>{stat.value}</div>
                <div className="text-slate-600 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-32 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <LiquidGlassCard gradient="from-purple-500 via-pink-500 via-orange-500 via-yellow-500 via-green-500 to-blue-500">
            <div className="p-16">
              <h2 className="text-5xl lg:text-6xl font-bold mb-6">
                Ready to Find Your{' '}
                <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">Perfect Match</span>?
              </h2>

              <p className="text-slate-600 text-xl mb-10 max-w-2xl mx-auto">Join thousands of founders and investors who have already found their synergy</p>

              <Link to={createPageUrl('Onboarding')}>
                <LiquidRainbowButton className="mx-auto">
                  Get Started Free
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </LiquidRainbowButton>
              </Link>

              <div className="mt-8 flex items-center justify-center space-x-6 text-sm text-slate-500">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>14-day free trial</span>
                </div>
              </div>
            </div>
          </LiquidGlassCard>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/60 py-12 px-6 backdrop-blur-xl bg-white/30 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-white/10 pointer-events-none" />
        <div className="max-w-7xl mx-auto relative">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500 via-pink-500 to-blue-500 rounded-2xl blur-md" />
                <div className="relative w-10 h-10 backdrop-blur-xl rounded-2xl bg-gradient-to-br from-purple-600/90 via-pink-600/90 via-orange-500/90 via-yellow-500/90 via-green-500/90 to-blue-600/90 flex items-center justify-center shadow-xl border-2 border-white/60 overflow-hidden">
                  <div className="absolute inset-0.5 rounded-2xl bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
                  <Zap className="w-6 h-6 text-white relative z-10" />
                </div>
              </div>
              <div>
                <div className="font-bold text-slate-800">SynergyAI</div>
                <div className="text-sm text-slate-600">AI matchmaking for founders and investors</div>
              </div>
            </div>

            <div className="flex items-center gap-8 text-sm text-slate-600">
              <a className="hover:text-purple-600 transition-colors" href="#features">Features</a>
              <a className="hover:text-purple-600 transition-colors" href="#how">How it works</a>
              <a className="hover:text-purple-600 transition-colors" href="#testimonials">Testimonials</a>
              <a className="hover:text-purple-600 transition-colors" href="#">Privacy</a>
            </div>

            <div className="text-sm text-slate-600">© {new Date().getFullYear()} SynergyAI. All rights reserved.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}