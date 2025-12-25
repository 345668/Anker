import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { 
  Rocket, Target, Mail, TrendingUp, Plus, ArrowRight,
  Building2, Users, Eye, MessageSquare, Zap
} from 'lucide-react';

const GLOBAL_STYLE_ID = 'synergyai-dashboard-global-v1';

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
    .synergyai-animate-gradient { animation: synergyai-gradient 7s ease infinite; }

    @keyframes synergyai-fade-up {
      0% { opacity: 0; transform: translateY(10px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    .synergyai-fade-up { animation: synergyai-fade-up 700ms ease both; }
  `;

  document.head.appendChild(style);
}

function AnimatedGridPattern() {
  return (
    <div className="absolute inset-0 opacity-25">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to right, rgb(168 85 247 / 0.12) 1px, transparent 1px),
                           linear-gradient(to bottom, rgb(59 130 246 / 0.12) 1px, transparent 1px)`,
          backgroundSize: '54px 54px',
        }}
      />
    </div>
  );
}

function ColorfulParticles() {
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

    const colors = [
      'rgba(168, 85, 247, 0.55)',
      'rgba(236, 72, 153, 0.55)',
      'rgba(251, 146, 60, 0.55)',
      'rgba(250, 204, 21, 0.55)',
      'rgba(34, 197, 94, 0.55)',
      'rgba(59, 130, 246, 0.55)',
    ];

    const particles = Array.from({ length: 55 }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.7,
      vy: (Math.random() - 0.5) * 0.7,
      r: Math.random() * 2.5 + 1,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();

        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      }
      raf = requestAnimationFrame(tick);
    };

    tick();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />;
}

function LiquidGlassCard({ children, className = '', gradient = 'from-purple-500 to-pink-500' }) {
  return (
    <div className={`relative group ${className}`}>
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-25 rounded-3xl blur-2xl group-hover:opacity-45 group-hover:blur-3xl transition-all duration-700`}
      />
      <div className="relative backdrop-blur-xl bg-gradient-to-br from-white/55 to-white/30 border border-white/60 rounded-3xl shadow-lg hover:shadow-xl transition-all duration-500 overflow-hidden">
        <div className="absolute inset-px rounded-3xl bg-gradient-to-br from-white/65 via-white/40 to-white/30 pointer-events-none" />
        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
          <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/45 to-transparent group-hover:left-full transition-all duration-1000 ease-out" />
        </div>
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

function LiquidRainbowButton({ children, className = '', onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative px-5 py-3 rounded-full overflow-hidden ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 via-orange-500 via-yellow-500 via-green-500 to-blue-600 bg-[length:200%_100%] synergyai-animate-gradient" />
      <div className="absolute inset-0 backdrop-blur-sm bg-white/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
      <div className="absolute inset-px rounded-full bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
      <span className="relative z-10 inline-flex items-center gap-2 text-sm md:text-base font-semibold text-white drop-shadow-lg">
        {children}
      </span>
    </button>
  );
}

function GhostButton({ children, className = '' }) {
  return (
    <button
      className={`group px-5 py-3 rounded-full backdrop-blur-xl bg-white/45 border-2 border-white/60 hover:bg-white/70 transition-all text-sm md:text-base font-semibold inline-flex items-center justify-center gap-2 text-slate-700 shadow-lg overflow-hidden relative ${className}`}
    >
      <div className="absolute inset-0.5 rounded-full bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
      <span className="relative z-10">{children}</span>
    </button>
  );
}

function StatPill({ icon: Icon, title, value, gradient }) {
  return (
    <LiquidGlassCard gradient={gradient} className="h-full">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-slate-600 text-xs font-semibold uppercase tracking-wider">{title}</div>
            <div className={`mt-2 text-3xl font-bold bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>{value}</div>
          </div>
          <div className="relative">
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient} rounded-2xl blur-lg opacity-50`} />
            <div className={`relative w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-xl border-2 border-white/60 overflow-hidden`}>
              <div className="absolute inset-0.5 rounded-2xl bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
              <Icon className="w-6 h-6 text-white relative z-10" />
            </div>
          </div>
        </div>
      </div>
    </LiquidGlassCard>
  );
}

function MiniPipeline({ stages }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <LiquidGlassCard gradient="from-purple-500 via-pink-500 to-blue-500" className="h-full">
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-sm font-semibold text-slate-800">Pipeline</div>
            <div className="text-xs text-slate-600 mt-1">Outreach stage distribution</div>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 border border-white/60 text-xs font-semibold text-slate-700">
            <TrendingUp className="w-4 h-4" />
            Live
          </div>
        </div>

        <div className="space-y-4">
          {stages.map((s) => (
            <div key={s.label} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">{s.label}</span>
                <span className="font-semibold text-slate-800">{s.count}</span>
              </div>
              <div className="h-3 rounded-full bg-white/40 border border-white/50 overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${s.gradient}`}
                  style={{ width: `${Math.round((s.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </LiquidGlassCard>
  );
}

function ActivityFeed({ items }) {
  return (
    <LiquidGlassCard gradient="from-green-500 to-blue-500" className="h-full">
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-sm font-semibold text-slate-800">Recent activity</div>
            <div className="text-xs text-slate-600 mt-1">Latest interactions and updates</div>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 border border-white/60 text-xs font-semibold text-slate-700">
            <MessageSquare className="w-4 h-4" />
            Updates
          </div>
        </div>

        <div className="space-y-4">
          {items.length === 0 ? (
            <div className="text-sm text-slate-600">No recent activity yet.</div>
          ) : (
            items.slice(0, 7).map((a) => (
              <div key={a.id} className="flex items-start gap-3">
                <div className="mt-1 w-8 h-8 rounded-2xl bg-white/55 border border-white/60 flex items-center justify-center">
                  <Eye className="w-4 h-4 text-slate-700" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-800">{a.type || 'Activity'}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{new Date(a.created_date).toLocaleDateString()}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </LiquidGlassCard>
  );
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    ensureGlobalStyles();

    const handleMouseMove = (e) => setMousePosition({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
      } catch (e) {}
    };
    loadUser();
  }, []);

  const userRole = user?.user_role || 'founder';

  const { data: startups = [] } = useQuery({
    queryKey: ['startups', user?.email],
    queryFn: () => base44.entities.Startup.filter({ founder_id: user?.id }),
    enabled: !!user && userRole === 'founder',
  });

  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => base44.entities.Match.list('-match_score', 50),
    enabled: !!user,
  });

  const { data: outreaches = [] } = useQuery({
    queryKey: ['outreaches'],
    queryFn: () => base44.entities.Outreach.list('-created_date', 100),
    enabled: !!user,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: () => base44.entities.InteractionLog.list('-created_date', 10),
    enabled: !!user,
  });

  const { data: allFirms = [] } = useQuery({
    queryKey: ['dashboard-firms'],
    queryFn: async () => {
      const data = await base44.entities.InvestorFirm.list('-created_date', 50000);
      console.log('Dashboard firms count:', data.length);
      return data;
    },
    enabled: !!user && ['lead', 'admin'].includes(userRole),
  });

  const { data: allContacts = [] } = useQuery({
    queryKey: ['dashboard-contacts'],
    queryFn: async () => {
      const data = await base44.entities.Contact.list('-created_date', 50000);
      console.log('Dashboard contacts count:', data.length);
      return data;
    },
    enabled: !!user && ['lead', 'admin'].includes(userRole),
  });

  const responseRate = useMemo(() => {
    const sent = outreaches.filter((o) => o.sent_at).length;
    const replied = outreaches.filter((o) => o.replied_at).length;
    return sent > 0 ? `${Math.round((replied / sent) * 100)}%` : '0%';
  }, [outreaches]);

  const openedCount = useMemo(() => outreaches.filter((o) => o.opened_at).length, [outreaches]);

  const pipelineStages = useMemo(() => {
    const stageCounts = {
      Draft: outreaches.filter((o) => o.stage === 'draft').length,
      Sent: outreaches.filter((o) => ['pitch_sent', 'sent'].includes(o.stage)).length,
      Meeting: outreaches.filter((o) => ['call_scheduled', 'in_negotiation'].includes(o.stage)).length,
      Passed: outreaches.filter((o) => o.stage === 'passed').length,
    };
    return [
      { label: 'Draft', count: stageCounts.Draft, gradient: 'from-slate-500 to-slate-700' },
      { label: 'Sent', count: stageCounts.Sent, gradient: 'from-purple-500 to-pink-500' },
      { label: 'Meeting', count: stageCounts.Meeting, gradient: 'from-orange-500 to-yellow-500' },
      { label: 'Passed', count: stageCounts.Passed, gradient: 'from-green-500 to-blue-500' },
    ];
  }, [outreaches]);

  const stats = useMemo(() => {
    if (userRole === 'lead' || userRole === 'admin') {
      return [
        { title: 'Investor Firms', value: allFirms.length.toLocaleString(), icon: Building2, gradient: 'from-purple-500 to-pink-500' },
        { title: 'Contacts', value: allContacts.length.toLocaleString(), icon: Users, gradient: 'from-orange-500 to-yellow-500' },
        { title: 'Matches Made', value: matches.length.toLocaleString(), icon: Target, gradient: 'from-yellow-500 to-green-500' },
        { title: 'Emails Opened', value: openedCount.toLocaleString(), icon: Eye, gradient: 'from-green-500 to-blue-500' },
      ];
    }

    return [
      {
        title: 'Active Startups',
        value: startups.filter((s) => s.status === 'active').length,
        icon: Rocket,
        gradient: 'from-purple-500 to-pink-500',
      },
      { title: 'Matched Investors', value: matches.length, icon: Target, gradient: 'from-orange-500 to-yellow-500' },
      {
        title: 'Pitches Sent',
        value: outreaches.filter((o) => o.stage && o.stage !== 'draft').length,
        icon: Mail,
        gradient: 'from-yellow-500 to-green-500',
      },
      { title: 'Response Rate', value: responseRate, icon: TrendingUp, gradient: 'from-green-500 to-blue-500' },
    ];
  }, [matches.length, openedCount, outreaches, responseRate, startups, userRole, allFirms.length, allContacts.length]);

  const suggestedMatches = matches.filter((m) => m.status === 'suggested').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30 text-slate-900 overflow-hidden relative">
      <div
        className="pointer-events-none fixed inset-0 z-30 transition duration-300"
        style={{
          background: `radial-gradient(600px at ${mousePosition.x}px ${mousePosition.y}px, rgba(168, 85, 247, 0.14), transparent 80%)`,
        }}
      />

      <div className="fixed inset-0">
        <AnimatedGridPattern />
        <ColorfulParticles />

        <div className="absolute top-0 left-1/4 w-[520px] h-[520px] bg-gradient-to-br from-purple-400/30 to-pink-400/30 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute top-1/3 right-1/4 w-[420px] h-[420px] bg-gradient-to-br from-orange-400/30 to-yellow-400/30 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1s' }}
        />
        <div
          className="absolute bottom-0 left-1/3 w-[480px] h-[480px] bg-gradient-to-br from-green-400/30 to-blue-400/30 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '2s' }}
        />
      </div>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 synergyai-fade-up">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4 backdrop-blur-xl bg-gradient-to-r from-purple-100/80 to-pink-100/80 border border-white/60 shadow-lg relative overflow-hidden">
              <div className="absolute inset-px rounded-full bg-gradient-to-r from-white/40 to-transparent pointer-events-none" />
              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 animate-pulse relative z-10" />
              <span className="text-sm font-medium bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent relative z-10">
                AI-powered fundraising cockpit
              </span>
            </div>

            <h1 className="text-3xl md:text-5xl font-bold text-slate-900">
              Welcome back, {user?.full_name?.split(' ')[0] || 'there'}
              <span className="block mt-2 bg-gradient-to-r from-purple-600 via-pink-600 via-orange-500 via-yellow-500 via-green-500 to-blue-600 bg-clip-text text-transparent synergyai-animate-gradient bg-[length:200%_100%]">
                let's move deals forward
              </span>
            </h1>
            <p className="text-slate-600 mt-3 max-w-2xl">
              {userRole === 'founder' && "Track your matches, outreach pipeline, and investor engagement in one place."}
              {userRole === 'lead' && "Monitor platform-wide pipeline performance and team execution."}
              {userRole === 'admin' && "Oversee the platform, data quality, and operational metrics."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {userRole === 'founder' && (
              <>
                <Link to={createPageUrl('Matches')}>
                  <GhostButton>
                    <Target className="w-4 h-4" />
                    View Matches
                  </GhostButton>
                </Link>
                <Link to={createPageUrl('MyStartups')}>
                  <LiquidRainbowButton className="px-6">
                    <Plus className="w-4 h-4" />
                    Add Startup
                  </LiquidRainbowButton>
                </Link>
              </>
            )}

            {userRole === 'admin' && (
              <Link to={createPageUrl('DataImport')}>
                <LiquidRainbowButton className="px-6">
                  <Plus className="w-4 h-4" />
                  Import Data
                </LiquidRainbowButton>
              </Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-10 synergyai-fade-up" style={{ animationDelay: '120ms' }}>
          {stats.map((s) => (
            <StatPill key={s.title} icon={s.icon} title={s.title} value={s.value} gradient={s.gradient} />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 synergyai-fade-up" style={{ animationDelay: '220ms' }}>
          <div className="lg:col-span-2">
            <MiniPipeline stages={pipelineStages} />
          </div>
          <div>
            <ActivityFeed items={activities} />
          </div>
        </div>

        {userRole === 'founder' && matches.length > 0 && (
          <div className="mt-6 synergyai-fade-up" style={{ animationDelay: '320ms' }}>
            <div className="relative overflow-hidden rounded-3xl border border-white/60 backdrop-blur-2xl bg-gradient-to-r from-white/55 to-white/35 shadow-xl">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-blue-500/20 opacity-70" />
              <div className="absolute -top-24 -right-24 w-72 h-72 bg-gradient-to-br from-purple-500/40 to-pink-500/40 rounded-full blur-3xl" />
              <div className="relative p-8 md:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div>
                  <div className="text-sm font-semibold text-slate-800">AI recommendations</div>
                  <div className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">
                    You have {suggestedMatches} new investor match{suggestedMatches === 1 ? '' : 'es'}
                  </div>
                  <div className="text-slate-700 mt-2 max-w-xl">
                    Review suggested matches and push high-intent investors into your outreach pipeline.
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Link to={createPageUrl('Matches')}>
                    <LiquidRainbowButton className="px-7">
                      Review Matches
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </LiquidRainbowButton>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}