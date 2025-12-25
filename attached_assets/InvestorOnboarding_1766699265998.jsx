import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Sparkles, ChevronRight, ChevronLeft, Check, Loader2,
  FileText, Users, MessageSquare, Target
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import OnboardingProfile from '@/components/onboarding/OnboardingProfile';
import OnboardingDocuments from '@/components/onboarding/OnboardingDocuments';
import OnboardingIntroductions from '@/components/onboarding/OnboardingIntroductions';
import OnboardingDiscussion from '@/components/onboarding/OnboardingDiscussion';

const steps = [
  { id: 'profile', label: 'Your Profile', icon: Target },
  { id: 'documents', label: 'Key Documents', icon: FileText },
  { id: 'introductions', label: 'Introductions', icon: Users },
  { id: 'discussion', label: 'Discussion Points', icon: MessageSquare },
];

export default function InvestorOnboarding() {
  const [currentStep, setCurrentStep] = useState(0);
  const [user, setUser] = useState(null);
  const [investorProfile, setInvestorProfile] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [generating, setGenerating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
      
      // Check if already onboarded
      if (userData.investor_onboarded) {
        navigate(createPageUrl('Dashboard'));
      }
    };
    loadUser();
  }, []);

  const { data: startups = [] } = useQuery({
    queryKey: ['startups'],
    queryFn: () => base44.entities.Startup.list('-created_date', 50),
    enabled: !!user,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.list('-created_date', 100),
    enabled: !!user,
  });

  const generateRecommendations = async (profile) => {
    setGenerating(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate personalized onboarding recommendations for this new investor.

INVESTOR PROFILE:
Name: ${user?.full_name}
Investment Focus: ${profile.investment_focus?.join(', ')}
Investment Stages: ${profile.investment_stages?.join(', ')}
Preferred Geography: ${profile.preferred_geography?.join(', ')}
Check Size: $${profile.check_size_min} - $${profile.check_size_max}
Industry Experience: ${profile.industry_experience}

AVAILABLE STARTUPS (sample):
${startups.slice(0, 10).map(s => `- ${s.company_name}: ${s.industry?.join(', ')} | ${s.stage} | ${s.location}`).join('\n')}

Based on this profile, provide:
1. Top 5 relevant startups to review first (from the list above)
2. Key documents they should review for each startup
3. Relevant founders/contacts to connect with
4. Initial discussion topics tailored to their expertise
5. Investment thesis suggestions
6. Red flags to watch for based on their focus

Be specific and actionable.`,
        response_json_schema: {
          type: 'object',
          properties: {
            recommended_startups: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  startup_name: { type: 'string' },
                  match_score: { type: 'number' },
                  why_relevant: { type: 'string' },
                  key_documents: { type: 'array', items: { type: 'string' } },
                  initial_questions: { type: 'array', items: { type: 'string' } }
                }
              }
            },
            suggested_connections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  role: { type: 'string' },
                  reason: { type: 'string' }
                }
              }
            },
            discussion_topics: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  topic: { type: 'string' },
                  key_questions: { type: 'array', items: { type: 'string' } },
                  evaluation_criteria: { type: 'array', items: { type: 'string' } }
                }
              }
            },
            investment_thesis: {
              type: 'object',
              properties: {
                core_focus: { type: 'string' },
                sweet_spot: { type: 'string' },
                value_add: { type: 'array', items: { type: 'string' } }
              }
            },
            red_flags: { type: 'array', items: { type: 'string' } },
            next_steps: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      setRecommendations(result);
    } catch (error) {
      console.error('Error generating recommendations:', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleProfileComplete = (profile) => {
    setInvestorProfile(profile);
    generateRecommendations(profile);
    setCurrentStep(1);
  };

  const completeOnboarding = async () => {
    await base44.auth.updateMe({ investor_onboarded: true });
    navigate(createPageUrl('Dashboard'));
  };

  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome to MatchFlow</h1>
          <p className="text-slate-600">Let's personalize your investment journey with AI</p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isComplete = index < currentStep;
              
              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors ${
                      isComplete ? 'bg-emerald-500 text-white' :
                      isActive ? 'bg-indigo-600 text-white' :
                      'bg-slate-200 text-slate-400'
                    }`}>
                      {isComplete ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                    </div>
                    <span className={`text-xs font-medium text-center ${
                      isActive ? 'text-indigo-600' : 'text-slate-500'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-2 transition-colors ${
                      isComplete ? 'bg-emerald-500' : 'bg-slate-200'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Loading State */}
        {generating && (
          <Card className="border-indigo-200 bg-indigo-50">
            <CardContent className="pt-6 flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              <span className="text-sm text-indigo-700">
                AI is analyzing your profile and generating personalized recommendations...
              </span>
            </CardContent>
          </Card>
        )}

        {/* Step Content */}
        {!generating && (
          <>
            {currentStep === 0 && (
              <OnboardingProfile onComplete={handleProfileComplete} user={user} />
            )}

            {currentStep === 1 && recommendations && (
              <OnboardingDocuments 
                recommendations={recommendations}
                startups={startups}
              />
            )}

            {currentStep === 2 && recommendations && (
              <OnboardingIntroductions 
                recommendations={recommendations}
                contacts={contacts}
              />
            )}

            {currentStep === 3 && recommendations && (
              <OnboardingDiscussion 
                recommendations={recommendations}
                profile={investorProfile}
              />
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-6">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              
              {currentStep < steps.length - 1 ? (
                <Button
                  onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
                  disabled={!recommendations && currentStep > 0}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  Continue
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={completeOnboarding}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Complete Setup
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}