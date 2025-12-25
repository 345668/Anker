import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Rocket, Building2, ArrowRight, ArrowLeft, CheckCircle,
  Loader2, Zap, Sparkles, TrendingUp, Users, BarChart3, Globe
} from "lucide-react";
import {
  GlassSurface,
  RainbowButton,
  GlassInput,
  LiquidGlassStyles,
  UnderGlow,
  Pill
} from "@/components/liquid-glass";

const industries = [
  'AI/ML', 'BioTech', 'CleanTech', 'Consumer', 'Cybersecurity', 'DeepTech',
  'E-commerce', 'EdTech', 'Enterprise Software', 'FinTech', 'Hardware',
  'HealthTech', 'Infrastructure', 'LegalTech', 'Media & Entertainment',
  'Mobility', 'PropTech', 'SaaS', 'Semiconductors', 'AgTech', 'Other'
];

const stages = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Growth'];

const firmRoles = ['Partner', 'Principal', 'Associate', 'Analyst', 'Scout', 'Venture Partner', 'Operating Partner'];

type Step = 'select-type' | 'founder-profile' | 'investor-profile';

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
          className="absolute min-w-full min-h-full object-cover opacity-40"
          onError={() => setVideoError(true)}
          data-testid="video-background-player"
        >
          <source
            src="https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_30fps.mp4"
            type="video/mp4"
          />
        </video>
      )}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-purple-900/50 to-slate-900/90" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.15),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(236,72,153,0.1),transparent_50%)]" />
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

export default function Onboarding() {
  const { user, isLoading, isAuthenticated, refetch } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('select-type');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    companyName: '',
    jobTitle: '',
    linkedinUrl: '',
    bio: '',
    industries: [] as string[],
    stage: '',
    preferredStages: [] as string[],
    firmRole: '',
    checkSizeMin: '',
    checkSizeMax: '',
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = "/app";
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (!isLoading && user?.onboardingCompleted) {
      window.location.href = "/app/dashboard";
    }
    if (user) {
      setFormData(prev => ({
        ...prev,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
      }));
    }
  }, [isLoading, user]);

  const handleTypeSelect = (type: 'founder' | 'investor') => {
    setStep(type === 'founder' ? 'founder-profile' : 'investor-profile');
  };

  const toggleIndustry = (industry: string) => {
    setFormData(prev => ({
      ...prev,
      industries: prev.industries.includes(industry)
        ? prev.industries.filter(i => i !== industry)
        : [...prev.industries, industry]
    }));
  };

  const toggleStage = (stage: string) => {
    setFormData(prev => ({
      ...prev,
      preferredStages: prev.preferredStages.includes(stage)
        ? prev.preferredStages.filter(s => s !== stage)
        : [...prev.preferredStages, stage]
    }));
  };

  const handleComplete = async () => {
    const userType = step === 'founder-profile' ? 'founder' : 'investor';
    
    if (!formData.firstName || !formData.lastName || !formData.companyName) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive"
      });
      return;
    }

    if (userType === 'founder' && (!formData.stage || formData.industries.length === 0)) {
      toast({
        title: "Missing Information",
        description: "Please select your startup stage and at least one industry.",
        variant: "destructive"
      });
      return;
    }

    if (userType === 'investor' && (!formData.firmRole || formData.preferredStages.length === 0 || formData.industries.length === 0)) {
      toast({
        title: "Missing Information",
        description: "Please fill in your firm role, preferred stages, and investment focus.",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/auth/user", {
        firstName: formData.firstName,
        lastName: formData.lastName,
        userType,
        companyName: formData.companyName,
        jobTitle: formData.jobTitle,
        linkedinUrl: formData.linkedinUrl,
        bio: formData.bio,
        industries: formData.industries,
        stage: formData.stage,
        preferredStages: formData.preferredStages,
        firmRole: formData.firmRole,
        checkSizeMin: formData.checkSizeMin,
        checkSizeMax: formData.checkSizeMax,
        onboardingCompleted: true,
      });

      toast({
        title: "Welcome aboard!",
        description: "Your profile has been set up successfully.",
      });

      await refetch();
      window.location.href = "/app/dashboard";
    } catch (error) {
      console.error('Onboarding error:', error);
      toast({
        title: "Error",
        description: "Failed to complete onboarding. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <VideoBackground />
        <FloatingOrbs />
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-white/80">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white relative">
      <LiquidGlassStyles />
      <VideoBackground />
      <FloatingOrbs />

      <nav className="relative z-10 border-b border-white/10 backdrop-blur-2xl bg-white/5">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl blur-lg opacity-50" />
              <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center border border-white/20">
                <Zap className="w-6 h-6 text-white" />
              </div>
            </div>
            <span className="text-xl font-medium bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              Anker Platform
            </span>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {step === 'select-type' && (
            <motion.div
              key="select-type"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="space-y-10"
            >
              <div className="text-center space-y-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  <Pill className="mb-6">
                    <Sparkles className="w-3 h-3" />
                    Welcome to the Future of Fundraising
                  </Pill>
                </motion.div>
                <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white via-purple-200 to-pink-200 bg-clip-text text-transparent">
                  Join Anker Platform
                </h1>
                <p className="text-lg text-white/60 max-w-lg mx-auto">
                  Connect with the right people, raise capital faster, and build lasting relationships in the venture ecosystem.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="relative group"
                >
                  <UnderGlow className="opacity-0 group-hover:opacity-40 transition-opacity duration-500" />
                  <GlassSurface
                    className="p-8 cursor-pointer transition-all duration-300 group-hover:scale-[1.02] group-hover:border-purple-400/40"
                    onClick={() => handleTypeSelect('founder')}
                    data-testid="card-founder"
                  >
                    <div className="relative space-y-6">
                      <div className="flex items-start justify-between">
                        <div className="relative">
                          <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl blur-xl opacity-40" />
                          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center border border-white/20">
                            <Rocket className="w-8 h-8 text-white" />
                          </div>
                        </div>
                        <Badge className="bg-purple-500/20 text-purple-200 border-purple-400/30">
                          For Founders
                        </Badge>
                      </div>
                      
                      <div>
                        <h2 className="text-2xl font-semibold text-slate-800 dark:text-white mb-2">I'm a Founder</h2>
                        <p className="text-slate-600 dark:text-white/60">Looking to raise funding and connect with investors</p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-slate-700 dark:text-white/80">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                          </div>
                          <span>Access investor database</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-700 dark:text-white/80">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                          </div>
                          <span>AI-powered matching</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-700 dark:text-white/80">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                          </div>
                          <span>Track fundraising pipeline</span>
                        </div>
                      </div>

                      <RainbowButton className="w-full" data-testid="button-founder">
                        Continue as Founder
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </RainbowButton>
                    </div>
                  </GlassSurface>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="relative group"
                >
                  <UnderGlow className="opacity-0 group-hover:opacity-40 transition-opacity duration-500 from-cyan-400 via-blue-400 to-purple-400" />
                  <GlassSurface
                    className="p-8 cursor-pointer transition-all duration-300 group-hover:scale-[1.02] group-hover:border-cyan-400/40"
                    onClick={() => handleTypeSelect('investor')}
                    data-testid="card-investor"
                  >
                    <div className="relative space-y-6">
                      <div className="flex items-start justify-between">
                        <div className="relative">
                          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl blur-xl opacity-40" />
                          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center border border-white/20">
                            <Building2 className="w-8 h-8 text-white" />
                          </div>
                        </div>
                        <Badge className="bg-cyan-500/20 text-cyan-200 border-cyan-400/30">
                          For Investors
                        </Badge>
                      </div>
                      
                      <div>
                        <h2 className="text-2xl font-semibold text-slate-800 dark:text-white mb-2">I'm an Investor</h2>
                        <p className="text-slate-600 dark:text-white/60">Looking to discover and invest in startups</p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-slate-700 dark:text-white/80">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                          </div>
                          <span>Curated deal flow</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-700 dark:text-white/80">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                          </div>
                          <span>Portfolio management</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-700 dark:text-white/80">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                          </div>
                          <span>Due diligence tools</span>
                        </div>
                      </div>

                      <Button 
                        className="w-full h-11 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:opacity-90 text-white font-semibold shadow-lg"
                        data-testid="button-investor"
                      >
                        Continue as Investor
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </GlassSurface>
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="grid grid-cols-3 gap-6 pt-8"
                data-testid="stats-section"
              >
                <div className="text-center" data-testid="stat-investors">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 mb-3">
                    <Users className="w-6 h-6 text-purple-400" />
                  </div>
                  <p className="text-2xl font-bold text-white" data-testid="text-investor-count">2,500+</p>
                  <p className="text-sm text-white/50">Active Investors</p>
                </div>
                <div className="text-center" data-testid="stat-deals">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 mb-3">
                    <TrendingUp className="w-6 h-6 text-emerald-400" />
                  </div>
                  <p className="text-2xl font-bold text-white" data-testid="text-deal-amount">$850M+</p>
                  <p className="text-sm text-white/50">Deals Facilitated</p>
                </div>
                <div className="text-center" data-testid="stat-countries">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 mb-3">
                    <Globe className="w-6 h-6 text-cyan-400" />
                  </div>
                  <p className="text-2xl font-bold text-white" data-testid="text-country-count">45+</p>
                  <p className="text-sm text-white/50">Countries</p>
                </div>
              </motion.div>
            </motion.div>
          )}

          {step === 'founder-profile' && (
            <motion.div
              key="founder-profile"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.4 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setStep('select-type')}
                  className="text-white/60 hover:text-white hover:bg-white/10 rounded-full"
                  data-testid="button-back"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h1 className="text-2xl font-semibold text-white">Complete Your Founder Profile</h1>
                  <p className="text-white/50">Tell us about yourself and your startup</p>
                </div>
              </div>

              <GlassSurface className="p-8">
                <div className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-slate-700 dark:text-white/80">First Name *</Label>
                      <GlassInput
                        value={formData.firstName}
                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                        placeholder="John"
                        data-testid="input-first-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-700 dark:text-white/80">Last Name *</Label>
                      <GlassInput
                        value={formData.lastName}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        placeholder="Doe"
                        data-testid="input-last-name"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-slate-700 dark:text-white/80">Company Name *</Label>
                      <GlassInput
                        value={formData.companyName}
                        onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                        placeholder="My Startup Inc."
                        data-testid="input-company-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-700 dark:text-white/80">Your Role</Label>
                      <GlassInput
                        value={formData.jobTitle}
                        onChange={(e) => setFormData(prev => ({ ...prev, jobTitle: e.target.value }))}
                        placeholder="CEO & Co-Founder"
                        data-testid="input-job-title"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-white/80">Current Stage *</Label>
                    <Select value={formData.stage} onValueChange={(value) => setFormData(prev => ({ ...prev, stage: value }))}>
                      <SelectTrigger 
                        className="h-11 rounded-2xl border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 backdrop-blur-2xl text-slate-800 dark:text-white shadow-lg" 
                        data-testid="select-stage"
                      >
                        <SelectValue placeholder="Select your funding stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map(stage => (
                          <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-white/80">Industries * (select all that apply)</Label>
                    <div className="flex flex-wrap gap-2">
                      {industries.map(industry => (
                        <Badge
                          key={industry}
                          variant={formData.industries.includes(industry) ? "default" : "outline"}
                          className={`cursor-pointer transition-all ${formData.industries.includes(industry) 
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 shadow-lg' 
                            : 'border-white/30 dark:border-white/20 text-slate-700 dark:text-white/70 bg-white/30 dark:bg-white/5 backdrop-blur-xl hover:bg-white/50 dark:hover:bg-white/10'}`}
                          onClick={() => toggleIndustry(industry)}
                          data-testid={`badge-industry-${industry.toLowerCase().replace(/\//g, '-')}`}
                        >
                          {industry}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-white/80">LinkedIn Profile</Label>
                    <GlassInput
                      value={formData.linkedinUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, linkedinUrl: e.target.value }))}
                      placeholder="https://linkedin.com/in/..."
                      data-testid="input-linkedin"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-white/80">Short Bio</Label>
                    <Textarea
                      value={formData.bio}
                      onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                      placeholder="Tell investors about yourself and your vision..."
                      className="rounded-2xl border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 backdrop-blur-2xl text-slate-800 dark:text-white placeholder:text-slate-500 dark:placeholder:text-white/40 min-h-[100px] shadow-lg"
                      data-testid="input-bio"
                    />
                  </div>

                  <RainbowButton 
                    onClick={handleComplete}
                    disabled={saving}
                    className="w-full"
                    data-testid="button-complete-onboarding"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Setting up your account...
                      </>
                    ) : (
                      <>
                        Complete Setup
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </RainbowButton>
                </div>
              </GlassSurface>
            </motion.div>
          )}

          {step === 'investor-profile' && (
            <motion.div
              key="investor-profile"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.4 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setStep('select-type')}
                  className="text-white/60 hover:text-white hover:bg-white/10 rounded-full"
                  data-testid="button-back"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h1 className="text-2xl font-semibold text-white">Complete Your Investor Profile</h1>
                  <p className="text-white/50">Define your investment preferences</p>
                </div>
              </div>

              <GlassSurface className="p-8">
                <div className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-slate-700 dark:text-white/80">First Name *</Label>
                      <GlassInput
                        value={formData.firstName}
                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                        placeholder="John"
                        data-testid="input-first-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-700 dark:text-white/80">Last Name *</Label>
                      <GlassInput
                        value={formData.lastName}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        placeholder="Doe"
                        data-testid="input-last-name"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-slate-700 dark:text-white/80">Firm Name *</Label>
                      <GlassInput
                        value={formData.companyName}
                        onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                        placeholder="Acme Ventures"
                        data-testid="input-company-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-700 dark:text-white/80">Your Role *</Label>
                      <Select value={formData.firmRole} onValueChange={(value) => setFormData(prev => ({ ...prev, firmRole: value }))}>
                        <SelectTrigger 
                          className="h-11 rounded-2xl border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 backdrop-blur-2xl text-slate-800 dark:text-white shadow-lg" 
                          data-testid="select-firm-role"
                        >
                          <SelectValue placeholder="Select your role" />
                        </SelectTrigger>
                        <SelectContent>
                          {firmRoles.map(role => (
                            <SelectItem key={role} value={role}>{role}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-white/80">Preferred Stages * (select all that apply)</Label>
                    <div className="flex flex-wrap gap-2">
                      {stages.map(stage => (
                        <Badge
                          key={stage}
                          variant={formData.preferredStages.includes(stage) ? "default" : "outline"}
                          className={`cursor-pointer transition-all ${formData.preferredStages.includes(stage) 
                            ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white border-0 shadow-lg' 
                            : 'border-white/30 dark:border-white/20 text-slate-700 dark:text-white/70 bg-white/30 dark:bg-white/5 backdrop-blur-xl hover:bg-white/50 dark:hover:bg-white/10'}`}
                          onClick={() => toggleStage(stage)}
                          data-testid={`badge-stage-${stage.toLowerCase().replace(/\+/g, 'plus').replace(/\s/g, '-')}`}
                        >
                          {stage}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-white/80">Investment Focus * (select all that apply)</Label>
                    <div className="flex flex-wrap gap-2">
                      {industries.map(industry => (
                        <Badge
                          key={industry}
                          variant={formData.industries.includes(industry) ? "default" : "outline"}
                          className={`cursor-pointer transition-all ${formData.industries.includes(industry) 
                            ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white border-0 shadow-lg' 
                            : 'border-white/30 dark:border-white/20 text-slate-700 dark:text-white/70 bg-white/30 dark:bg-white/5 backdrop-blur-xl hover:bg-white/50 dark:hover:bg-white/10'}`}
                          onClick={() => toggleIndustry(industry)}
                          data-testid={`badge-industry-${industry.toLowerCase().replace(/\//g, '-')}`}
                        >
                          {industry}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-slate-700 dark:text-white/80">Minimum Check Size</Label>
                      <GlassInput
                        value={formData.checkSizeMin}
                        onChange={(e) => setFormData(prev => ({ ...prev, checkSizeMin: e.target.value }))}
                        placeholder="$50,000"
                        data-testid="input-check-min"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-700 dark:text-white/80">Maximum Check Size</Label>
                      <GlassInput
                        value={formData.checkSizeMax}
                        onChange={(e) => setFormData(prev => ({ ...prev, checkSizeMax: e.target.value }))}
                        placeholder="$500,000"
                        data-testid="input-check-max"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-white/80">LinkedIn Profile</Label>
                    <GlassInput
                      value={formData.linkedinUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, linkedinUrl: e.target.value }))}
                      placeholder="https://linkedin.com/in/..."
                      data-testid="input-linkedin"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-700 dark:text-white/80">Short Bio</Label>
                    <Textarea
                      value={formData.bio}
                      onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                      placeholder="Tell founders about your investment thesis..."
                      className="rounded-2xl border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 backdrop-blur-2xl text-slate-800 dark:text-white placeholder:text-slate-500 dark:placeholder:text-white/40 min-h-[100px] shadow-lg"
                      data-testid="input-bio"
                    />
                  </div>

                  <Button 
                    onClick={handleComplete}
                    disabled={saving}
                    className="w-full h-11 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:opacity-90 text-white font-semibold shadow-lg"
                    data-testid="button-complete-onboarding"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Setting up your account...
                      </>
                    ) : (
                      <>
                        Complete Setup
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </GlassSurface>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
