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
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Rocket, Building2, Users, ArrowRight, ArrowLeft, CheckCircle,
  Target, DollarSign, Loader2, Zap, Briefcase
} from "lucide-react";

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
    // Pre-fill form with existing user data
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
    
    // Validate required fields
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

      // Refetch user and redirect
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
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
          <span className="text-white">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(18,18,18)] text-white">
      <nav className="border-b border-white/10 backdrop-blur-xl bg-black/50">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-light">Anker Platform</span>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {step === 'select-type' && (
            <motion.div
              key="select-type"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="text-center">
                <h1 className="text-3xl font-light mb-3">Welcome to Anker Platform</h1>
                <p className="text-white/50">Tell us about yourself to get started</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <Card 
                  className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors cursor-pointer"
                  onClick={() => handleTypeSelect('founder')}
                  data-testid="card-founder"
                >
                  <CardContent className="p-8">
                    <div className="flex items-start justify-between mb-6">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] flex items-center justify-center">
                        <Rocket className="w-7 h-7 text-white" />
                      </div>
                    </div>
                    <h2 className="text-2xl font-light text-white mb-2">I'm a Founder</h2>
                    <p className="text-white/50 mb-6">Looking to raise funding and connect with investors</p>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-white/80">
                        <CheckCircle className="w-5 h-5 text-[rgb(196,227,230)]" />
                        <span>Access investor database</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/80">
                        <CheckCircle className="w-5 h-5 text-[rgb(196,227,230)]" />
                        <span>AI-powered matching</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/80">
                        <CheckCircle className="w-5 h-5 text-[rgb(196,227,230)]" />
                        <span>Track fundraising pipeline</span>
                      </div>
                    </div>
                    <Button className="w-full mt-8 bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] hover:opacity-90">
                      Continue as Founder
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>

                <Card 
                  className="bg-white/5 border-white/10 hover:bg-white/10 transition-colors cursor-pointer"
                  onClick={() => handleTypeSelect('investor')}
                  data-testid="card-investor"
                >
                  <CardContent className="p-8">
                    <div className="flex items-start justify-between mb-6">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[rgb(196,227,230)] to-[rgb(142,132,247)] flex items-center justify-center">
                        <Building2 className="w-7 h-7 text-white" />
                      </div>
                    </div>
                    <h2 className="text-2xl font-light text-white mb-2">I'm an Investor</h2>
                    <p className="text-white/50 mb-6">Looking to discover and invest in startups</p>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-white/80">
                        <CheckCircle className="w-5 h-5 text-[rgb(196,227,230)]" />
                        <span>Curated deal flow</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/80">
                        <CheckCircle className="w-5 h-5 text-[rgb(196,227,230)]" />
                        <span>Portfolio management</span>
                      </div>
                      <div className="flex items-center gap-3 text-white/80">
                        <CheckCircle className="w-5 h-5 text-[rgb(196,227,230)]" />
                        <span>Due diligence tools</span>
                      </div>
                    </div>
                    <Button className="w-full mt-8 bg-gradient-to-r from-[rgb(196,227,230)] to-[rgb(142,132,247)] hover:opacity-90 text-black">
                      Continue as Investor
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          )}

          {step === 'founder-profile' && (
            <motion.div
              key="founder-profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setStep('select-type')}
                  className="text-white/50 hover:text-white"
                  data-testid="button-back"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h1 className="text-2xl font-light">Complete Your Founder Profile</h1>
                  <p className="text-white/50">Tell us about yourself and your startup</p>
                </div>
              </div>

              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-8 space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white/80">First Name *</Label>
                      <Input
                        value={formData.firstName}
                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                        placeholder="John"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                        data-testid="input-first-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/80">Last Name *</Label>
                      <Input
                        value={formData.lastName}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        placeholder="Doe"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                        data-testid="input-last-name"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white/80">Company Name *</Label>
                      <Input
                        value={formData.companyName}
                        onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                        placeholder="My Startup Inc."
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                        data-testid="input-company-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/80">Your Role</Label>
                      <Input
                        value={formData.jobTitle}
                        onChange={(e) => setFormData(prev => ({ ...prev, jobTitle: e.target.value }))}
                        placeholder="CEO & Co-Founder"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                        data-testid="input-job-title"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/80">Current Stage *</Label>
                    <Select value={formData.stage} onValueChange={(value) => setFormData(prev => ({ ...prev, stage: value }))}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-stage">
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
                    <Label className="text-white/80">Industries * (select all that apply)</Label>
                    <div className="flex flex-wrap gap-2">
                      {industries.map(industry => (
                        <Badge
                          key={industry}
                          variant={formData.industries.includes(industry) ? "default" : "outline"}
                          className={`cursor-pointer ${formData.industries.includes(industry) 
                            ? 'bg-[rgb(142,132,247)] hover:opacity-90' 
                            : 'border-white/20 text-white/80 hover:bg-white/10'}`}
                          onClick={() => toggleIndustry(industry)}
                          data-testid={`badge-industry-${industry.toLowerCase().replace(/\//g, '-')}`}
                        >
                          {industry}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/80">LinkedIn Profile</Label>
                    <Input
                      value={formData.linkedinUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, linkedinUrl: e.target.value }))}
                      placeholder="https://linkedin.com/in/..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                      data-testid="input-linkedin"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/80">Short Bio</Label>
                    <Textarea
                      value={formData.bio}
                      onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                      placeholder="Tell investors about yourself and your vision..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 min-h-[100px]"
                      data-testid="input-bio"
                    />
                  </div>

                  <Button 
                    onClick={handleComplete}
                    disabled={saving}
                    className="w-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] hover:opacity-90"
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
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 'investor-profile' && (
            <motion.div
              key="investor-profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setStep('select-type')}
                  className="text-white/50 hover:text-white"
                  data-testid="button-back"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h1 className="text-2xl font-light">Complete Your Investor Profile</h1>
                  <p className="text-white/50">Define your investment preferences</p>
                </div>
              </div>

              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-8 space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white/80">First Name *</Label>
                      <Input
                        value={formData.firstName}
                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                        placeholder="John"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                        data-testid="input-first-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/80">Last Name *</Label>
                      <Input
                        value={formData.lastName}
                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                        placeholder="Doe"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                        data-testid="input-last-name"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white/80">Firm Name *</Label>
                      <Input
                        value={formData.companyName}
                        onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                        placeholder="Acme Ventures"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                        data-testid="input-company-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/80">Your Role *</Label>
                      <Select value={formData.firmRole} onValueChange={(value) => setFormData(prev => ({ ...prev, firmRole: value }))}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white" data-testid="select-firm-role">
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
                    <Label className="text-white/80">Preferred Stages * (select all that apply)</Label>
                    <div className="flex flex-wrap gap-2">
                      {stages.map(stage => (
                        <Badge
                          key={stage}
                          variant={formData.preferredStages.includes(stage) ? "default" : "outline"}
                          className={`cursor-pointer ${formData.preferredStages.includes(stage) 
                            ? 'bg-[rgb(196,227,230)] text-black hover:opacity-90' 
                            : 'border-white/20 text-white/80 hover:bg-white/10'}`}
                          onClick={() => toggleStage(stage)}
                          data-testid={`badge-stage-${stage.toLowerCase().replace(/\+/g, 'plus').replace(/\s/g, '-')}`}
                        >
                          {stage}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/80">Investment Focus * (select all that apply)</Label>
                    <div className="flex flex-wrap gap-2">
                      {industries.map(industry => (
                        <Badge
                          key={industry}
                          variant={formData.industries.includes(industry) ? "default" : "outline"}
                          className={`cursor-pointer ${formData.industries.includes(industry) 
                            ? 'bg-[rgb(196,227,230)] text-black hover:opacity-90' 
                            : 'border-white/20 text-white/80 hover:bg-white/10'}`}
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
                      <Label className="text-white/80">Check Size Min ($)</Label>
                      <Input
                        type="number"
                        value={formData.checkSizeMin}
                        onChange={(e) => setFormData(prev => ({ ...prev, checkSizeMin: e.target.value }))}
                        placeholder="50000"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                        data-testid="input-check-min"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/80">Check Size Max ($)</Label>
                      <Input
                        type="number"
                        value={formData.checkSizeMax}
                        onChange={(e) => setFormData(prev => ({ ...prev, checkSizeMax: e.target.value }))}
                        placeholder="500000"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                        data-testid="input-check-max"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/80">LinkedIn Profile</Label>
                    <Input
                      value={formData.linkedinUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, linkedinUrl: e.target.value }))}
                      placeholder="https://linkedin.com/in/..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                      data-testid="input-linkedin"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/80">Short Bio</Label>
                    <Textarea
                      value={formData.bio}
                      onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                      placeholder="Tell founders about your investment philosophy..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 min-h-[100px]"
                      data-testid="input-bio"
                    />
                  </div>

                  <Button 
                    onClick={handleComplete}
                    disabled={saving}
                    className="w-full bg-gradient-to-r from-[rgb(196,227,230)] to-[rgb(142,132,247)] hover:opacity-90 text-black"
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
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
