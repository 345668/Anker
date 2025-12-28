import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
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
  Loader2, Zap, ChevronDown, Upload, FileText, Sparkles
} from "lucide-react";
import { extractTextFromPDF } from "@/lib/pdf-parser";

import Video from '@/framer/video';
import Primary from '@/framer/primary';
import Secondary from '@/framer/secondary';

const industries = [
  'AI/ML', 'BioTech', 'CleanTech', 'Consumer', 'Cybersecurity', 'DeepTech',
  'E-commerce', 'EdTech', 'Enterprise Software', 'FinTech', 'Hardware',
  'HealthTech', 'Infrastructure', 'LegalTech', 'Media & Entertainment',
  'Mobility', 'PropTech', 'SaaS', 'Semiconductors', 'AgTech', 'Other'
];

const stages = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Growth'];

const firmRoles = ['Partner', 'Principal', 'Associate', 'Analyst', 'Scout', 'Venture Partner', 'Operating Partner'];

type Step = 'select-type' | 'founder-profile' | 'investor-profile';

export default function Onboarding() {
  const { user, isLoading, isAuthenticated, refetch } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('select-type');
  const [saving, setSaving] = useState(false);
  const [extractingPitchDeck, setExtractingPitchDeck] = useState(false);
  const [pitchDeckFile, setPitchDeckFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handlePitchDeckUpload = async (file: File) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      toast({
        title: "Invalid file",
        description: "Please upload a PDF file.",
        variant: "destructive"
      });
      return;
    }

    setPitchDeckFile(file);
    setExtractingPitchDeck(true);

    try {
      const pitchDeckContent = await extractTextFromPDF(file);
      
      if (pitchDeckContent.length < 100) {
        toast({
          title: "Could not extract text",
          description: "The PDF appears to be image-based. Please fill in the fields manually.",
          variant: "destructive"
        });
        setExtractingPitchDeck(false);
        return;
      }

      const response = await apiRequest("POST", "/api/pitch-deck/extract-info", {
        pitchDeckContent
      });
      
      const data = await response.json();
      
      if (data.success && data.extractedInfo) {
        const info = data.extractedInfo;
        
        setFormData(prev => ({
          ...prev,
          companyName: info.companyName || prev.companyName,
          bio: info.description || info.tagline || prev.bio,
          industries: info.industries?.length ? 
            info.industries.filter((ind: string) => industries.includes(ind)) : 
            prev.industries,
          stage: info.stage && stages.includes(info.stage) ? info.stage : prev.stage,
        }));

        toast({
          title: "Pitch deck analyzed!",
          description: "We've extracted information from your pitch deck and filled in the fields.",
        });
      }
    } catch (error) {
      console.error("Pitch deck extraction error:", error);
      toast({
        title: "Extraction failed",
        description: "Could not analyze the pitch deck. Please fill in the fields manually.",
        variant: "destructive"
      });
    } finally {
      setExtractingPitchDeck(false);
    }
  };

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
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(18,18,18)] text-white overflow-hidden">
      <AnimatePresence mode="wait">
        {step === 'select-type' && (
          <motion.div
            key="select-type"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen"
          >
            <section className="relative flex flex-col items-center justify-center overflow-hidden" style={{ minHeight: '100vh' }}>
              <div className="absolute inset-0 w-full h-full">
                <Video 
                  file="https://videos.pexels.com/video-files/3129957/3129957-uhd_2560_1440_30fps.mp4"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                <div className="absolute inset-0 bg-black/60" />
              </div>

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
                  <Secondary 
                    text="Back to Home" 
                    link="/"
                    style={{ transform: 'scale(0.9)' }}
                  />
                </div>
              </motion.header>

              <div className="relative z-10 text-center px-4 max-w-5xl mx-auto mt-20">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="inline-block mb-8"
                >
                  <span 
                    className="px-4 py-2 rounded-full text-xs font-medium tracking-[0.2em] uppercase border border-white/20 text-white/80 bg-white/5"
                    data-testid="badge-welcome"
                  >
                    WELCOME TO ANKER
                  </span>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.5 }}
                  className="text-5xl md:text-7xl lg:text-8xl font-light leading-tight mb-8"
                  data-testid="text-hero-title"
                >
                  <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>Tell us</span>{" "}
                  <span className="text-white font-extralight">about</span>
                  <br />
                  <span className="text-white font-extralight">yourself</span>
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.7 }}
                  className="text-white/60 text-lg md:text-xl max-w-xl mx-auto mb-16 font-light"
                  data-testid="text-hero-description"
                >
                  Choose your path to unlock personalized features and connect with the right people.
                </motion.p>

                <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                  <motion.div
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6, delay: 0.9 }}
                    onClick={() => handleTypeSelect('founder')}
                    className="group cursor-pointer p-8 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[rgb(142,132,247)]/50 transition-all duration-300"
                    data-testid="card-founder"
                  >
                    <div className="flex items-start justify-between mb-6">
                      <div 
                        className="w-16 h-16 rounded-2xl flex items-center justify-center"
                        style={{ backgroundColor: 'rgba(142, 132, 247, 0.2)' }}
                      >
                        <Rocket className="w-8 h-8 text-[rgb(142,132,247)]" />
                      </div>
                    </div>
                    
                    <h2 className="text-2xl font-light text-white mb-2">I'm a Founder</h2>
                    <p className="text-white/50 mb-6 font-light">Looking to raise funding and connect with investors</p>
                    
                    <div className="space-y-3 mb-8">
                      <div className="flex items-center gap-3 text-white/70">
                        <CheckCircle className="w-5 h-5 text-[rgb(196,227,230)]" />
                        <span className="font-light">Access investor database</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/70">
                        <CheckCircle className="w-5 h-5 text-[rgb(196,227,230)]" />
                        <span className="font-light">AI-powered matching</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/70">
                        <CheckCircle className="w-5 h-5 text-[rgb(196,227,230)]" />
                        <span className="font-light">Track fundraising pipeline</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[rgb(142,132,247)] group-hover:gap-4 transition-all">
                      <span className="font-medium">Continue as Founder</span>
                      <ArrowRight className="w-5 h-5" />
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6, delay: 1 }}
                    onClick={() => handleTypeSelect('investor')}
                    className="group cursor-pointer p-8 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[rgb(196,227,230)]/50 transition-all duration-300"
                    data-testid="card-investor"
                  >
                    <div className="flex items-start justify-between mb-6">
                      <div 
                        className="w-16 h-16 rounded-2xl flex items-center justify-center"
                        style={{ backgroundColor: 'rgba(196, 227, 230, 0.2)' }}
                      >
                        <Building2 className="w-8 h-8 text-[rgb(196,227,230)]" />
                      </div>
                    </div>
                    
                    <h2 className="text-2xl font-light text-white mb-2">I'm an Investor</h2>
                    <p className="text-white/50 mb-6 font-light">Looking to discover and invest in startups</p>
                    
                    <div className="space-y-3 mb-8">
                      <div className="flex items-center gap-3 text-white/70">
                        <CheckCircle className="w-5 h-5 text-[rgb(251,194,213)]" />
                        <span className="font-light">Curated deal flow</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/70">
                        <CheckCircle className="w-5 h-5 text-[rgb(251,194,213)]" />
                        <span className="font-light">Portfolio management</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/70">
                        <CheckCircle className="w-5 h-5 text-[rgb(251,194,213)]" />
                        <span className="font-light">Due diligence tools</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[rgb(196,227,230)] group-hover:gap-4 transition-all">
                      <span className="font-medium">Continue as Investor</span>
                      <ArrowRight className="w-5 h-5" />
                    </div>
                  </motion.div>
                </div>
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
          </motion.div>
        )}

        {step === 'founder-profile' && (
          <motion.div
            key="founder-profile"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.4 }}
            className="min-h-screen"
          >
            <section className="relative min-h-screen overflow-hidden py-24">
              <div className="absolute inset-0 w-full h-full">
                <Video 
                  file="https://videos.pexels.com/video-files/3129957/3129957-uhd_2560_1440_30fps.mp4"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                <div className="absolute inset-0 bg-black/70" />
              </div>

              <div className="relative z-10 max-w-3xl mx-auto px-6">
                <div className="flex items-center gap-4 mb-8">
                  <button 
                    onClick={() => setStep('select-type')}
                    className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:border-white/40 transition-colors"
                    data-testid="button-back"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h1 className="text-2xl font-light text-white">Complete Your <span className="italic text-[rgb(142,132,247)]" style={{ fontFamily: 'serif' }}>Founder</span> Profile</h1>
                    <p className="text-white/50 font-light">Tell us about yourself and your startup</p>
                  </div>
                </div>

                <div className="p-8 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm space-y-6">
                  <div className="p-6 rounded-xl border border-dashed border-[rgb(142,132,247)]/50 bg-[rgb(142,132,247)]/5">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 mb-3">
                        <Sparkles className="w-5 h-5 text-[rgb(142,132,247)]" />
                        <span className="text-sm font-medium text-[rgb(142,132,247)]">Quick Fill with AI</span>
                      </div>
                      <p className="text-white/50 text-sm mb-4 font-light">
                        Upload your pitch deck and we'll automatically extract your startup information
                      </p>
                      
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handlePitchDeckUpload(file);
                        }}
                        data-testid="input-pitch-deck-upload"
                      />
                      
                      {extractingPitchDeck ? (
                        <div className="flex items-center justify-center gap-3 py-4">
                          <Loader2 className="w-5 h-5 animate-spin text-[rgb(142,132,247)]" />
                          <span className="text-white/70 font-light">Analyzing your pitch deck...</span>
                        </div>
                      ) : pitchDeckFile ? (
                        <div className="flex items-center justify-center gap-3">
                          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)]">
                            <FileText className="w-4 h-4" />
                            <span className="text-sm">{pitchDeckFile.name}</span>
                          </div>
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-4 py-2 rounded-full border border-white/20 text-white/70 text-sm hover:bg-white/10 transition-colors"
                            data-testid="button-change-pitch-deck"
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium hover:opacity-90 transition-opacity"
                          data-testid="button-upload-pitch-deck"
                        >
                          <Upload className="w-5 h-5" />
                          Upload Pitch Deck (PDF)
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="relative flex items-center gap-4">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-white/30 text-sm font-light">or fill in manually</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white/70 font-light">First Name *</Label>
                      <Input
                        value={formData.firstName}
                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                        placeholder="John"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-12 rounded-xl"
                        data-testid="input-first-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/70 font-light">Last Name *</Label>
                      <Input
                        value={formData.lastName}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        placeholder="Doe"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-12 rounded-xl"
                        data-testid="input-last-name"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white/70 font-light">Company Name *</Label>
                      <Input
                        value={formData.companyName}
                        onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                        placeholder="My Startup Inc."
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-12 rounded-xl"
                        data-testid="input-company-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/70 font-light">Your Role</Label>
                      <Input
                        value={formData.jobTitle}
                        onChange={(e) => setFormData(prev => ({ ...prev, jobTitle: e.target.value }))}
                        placeholder="CEO & Co-Founder"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-12 rounded-xl"
                        data-testid="input-job-title"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/70 font-light">Current Stage *</Label>
                    <Select value={formData.stage} onValueChange={(value) => setFormData(prev => ({ ...prev, stage: value }))}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 rounded-xl" data-testid="select-stage">
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
                    <Label className="text-white/70 font-light">Industries * (select all that apply)</Label>
                    <div className="flex flex-wrap gap-2">
                      {industries.map(industry => (
                        <Badge
                          key={industry}
                          variant="outline"
                          className={`cursor-pointer transition-all border-white/20 ${
                            formData.industries.includes(industry) 
                              ? 'bg-[rgb(142,132,247)] text-white border-[rgb(142,132,247)]' 
                              : 'text-white/70 hover:bg-white/10'
                          }`}
                          onClick={() => toggleIndustry(industry)}
                          data-testid={`badge-industry-${industry.toLowerCase().replace(/\//g, '-')}`}
                        >
                          {industry}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/70 font-light">LinkedIn Profile</Label>
                    <Input
                      value={formData.linkedinUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, linkedinUrl: e.target.value }))}
                      placeholder="https://linkedin.com/in/..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-12 rounded-xl"
                      data-testid="input-linkedin"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/70 font-light">Short Bio</Label>
                    <Textarea
                      value={formData.bio}
                      onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                      placeholder="Tell investors about yourself and your vision..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 min-h-[100px] rounded-xl"
                      data-testid="input-bio"
                    />
                  </div>

                  <button
                    onClick={handleComplete}
                    disabled={saving}
                    className="w-full h-14 rounded-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                    data-testid="button-complete-onboarding"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Setting up your account...
                      </>
                    ) : (
                      <>
                        Complete Setup
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>
          </motion.div>
        )}

        {step === 'investor-profile' && (
          <motion.div
            key="investor-profile"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.4 }}
            className="min-h-screen"
          >
            <section className="relative min-h-screen overflow-hidden py-24">
              <div className="absolute inset-0 w-full h-full">
                <Video 
                  file="https://videos.pexels.com/video-files/3129957/3129957-uhd_2560_1440_30fps.mp4"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                <div className="absolute inset-0 bg-black/70" />
              </div>

              <div className="relative z-10 max-w-3xl mx-auto px-6">
                <div className="flex items-center gap-4 mb-8">
                  <button 
                    onClick={() => setStep('select-type')}
                    className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:border-white/40 transition-colors"
                    data-testid="button-back"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h1 className="text-2xl font-light text-white">Complete Your <span className="italic text-[rgb(196,227,230)]" style={{ fontFamily: 'serif' }}>Investor</span> Profile</h1>
                    <p className="text-white/50 font-light">Define your investment preferences</p>
                  </div>
                </div>

                <div className="p-8 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white/70 font-light">First Name *</Label>
                      <Input
                        value={formData.firstName}
                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                        placeholder="John"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-12 rounded-xl"
                        data-testid="input-first-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/70 font-light">Last Name *</Label>
                      <Input
                        value={formData.lastName}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        placeholder="Doe"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-12 rounded-xl"
                        data-testid="input-last-name"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white/70 font-light">Firm Name *</Label>
                      <Input
                        value={formData.companyName}
                        onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                        placeholder="Acme Ventures"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-12 rounded-xl"
                        data-testid="input-company-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/70 font-light">Your Role *</Label>
                      <Select value={formData.firmRole} onValueChange={(value) => setFormData(prev => ({ ...prev, firmRole: value }))}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 rounded-xl" data-testid="select-firm-role">
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
                    <Label className="text-white/70 font-light">Preferred Stages * (select all that apply)</Label>
                    <div className="flex flex-wrap gap-2">
                      {stages.map(stage => (
                        <Badge
                          key={stage}
                          variant="outline"
                          className={`cursor-pointer transition-all border-white/20 ${
                            formData.preferredStages.includes(stage) 
                              ? 'bg-[rgb(196,227,230)] text-black border-[rgb(196,227,230)]' 
                              : 'text-white/70 hover:bg-white/10'
                          }`}
                          onClick={() => toggleStage(stage)}
                          data-testid={`badge-stage-${stage.toLowerCase().replace(/\+/g, 'plus').replace(/\s/g, '-')}`}
                        >
                          {stage}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/70 font-light">Investment Focus * (select all that apply)</Label>
                    <div className="flex flex-wrap gap-2">
                      {industries.map(industry => (
                        <Badge
                          key={industry}
                          variant="outline"
                          className={`cursor-pointer transition-all border-white/20 ${
                            formData.industries.includes(industry) 
                              ? 'bg-[rgb(196,227,230)] text-black border-[rgb(196,227,230)]' 
                              : 'text-white/70 hover:bg-white/10'
                          }`}
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
                      <Label className="text-white/70 font-light">Minimum Check Size</Label>
                      <Input
                        value={formData.checkSizeMin}
                        onChange={(e) => setFormData(prev => ({ ...prev, checkSizeMin: e.target.value }))}
                        placeholder="$50,000"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-12 rounded-xl"
                        data-testid="input-check-min"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/70 font-light">Maximum Check Size</Label>
                      <Input
                        value={formData.checkSizeMax}
                        onChange={(e) => setFormData(prev => ({ ...prev, checkSizeMax: e.target.value }))}
                        placeholder="$500,000"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-12 rounded-xl"
                        data-testid="input-check-max"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/70 font-light">LinkedIn Profile</Label>
                    <Input
                      value={formData.linkedinUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, linkedinUrl: e.target.value }))}
                      placeholder="https://linkedin.com/in/..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-12 rounded-xl"
                      data-testid="input-linkedin"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/70 font-light">Short Bio</Label>
                    <Textarea
                      value={formData.bio}
                      onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                      placeholder="Tell founders about your investment thesis..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 min-h-[100px] rounded-xl"
                      data-testid="input-bio"
                    />
                  </div>

                  <button
                    onClick={handleComplete}
                    disabled={saving}
                    className="w-full h-14 rounded-full bg-gradient-to-r from-[rgb(196,227,230)] to-[rgb(142,132,247)] text-white font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                    data-testid="button-complete-onboarding"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Setting up your account...
                      </>
                    ) : (
                      <>
                        Complete Setup
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
