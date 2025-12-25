import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Rocket, Loader2, ArrowLeft, Edit, Globe, Linkedin,
  Users, DollarSign, MapPin, Calendar
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import TeamAnalysis from '@/components/startup/TeamAnalysis';
import MarketValidation from '@/components/startup/MarketValidation';
import CompanyEnricher from '@/components/startup/CompanyEnricher';
import PitchDeckAnalysis from '@/components/pitch/PitchDeckAnalysis';
import FundingGoalEditor from '@/components/startup/FundingGoalEditor';

export default function StartupProfile() {
  const [startupId, setStartupId] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setStartupId(params.get('id'));
  }, []);

  const { data: startup, isLoading } = useQuery({
    queryKey: ['startup', startupId],
    queryFn: async () => {
      const results = await base44.entities.Startup.filter({ id: startupId });
      return results[0];
    },
    enabled: !!startupId,
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Startup.update(startupId, data),
    onSuccess: () => queryClient.invalidateQueries(['startup', startupId]),
  });

  if (isLoading || !startup) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to={createPageUrl('MyStartups')}>
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div className="flex items-center gap-4 flex-1">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-xl flex items-center justify-center text-white text-xl font-bold">
            {startup.company_name?.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{startup.company_name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <Badge variant="secondary">{startup.stage}</Badge>
              {startup.industry?.slice(0, 2).map((ind, i) => (
                <Badge key={i} variant="outline">{ind}</Badge>
              ))}
            </div>
          </div>
        </div>
        <Button variant="outline">
          <Edit className="w-4 h-4 mr-2" />
          Edit
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {startup.location && (
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <MapPin className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Location</p>
                <p className="font-medium">{startup.location}</p>
              </div>
            </CardContent>
          </Card>
        )}
        {startup.funding_sought && (
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Raising</p>
                <p className="font-medium">${(startup.funding_sought / 1000000).toFixed(1)}M</p>
              </div>
            </CardContent>
          </Card>
        )}
        <FundingGoalEditor 
          startup={startup}
          onUpdate={(data) => updateMutation.mutate(data)}
        />
        {startup.team_size && (
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Team Size</p>
                <p className="font-medium">{startup.team_size}</p>
              </div>
            </CardContent>
          </Card>
        )}
        {startup.founding_date && (
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Calendar className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-sm text-slate-500">Founded</p>
                <p className="font-medium">{new Date(startup.founding_date).getFullYear()}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pitch">Pitch Deck</TabsTrigger>
          <TabsTrigger value="team">Team Analysis</TabsTrigger>
          <TabsTrigger value="market">Market Validation</TabsTrigger>
          <TabsTrigger value="enrichment">Company Data</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {startup.one_liner && (
                <p className="text-lg text-slate-700">{startup.one_liner}</p>
              )}
              {startup.problem && (
                <div>
                  <h4 className="text-sm font-medium text-slate-900 mb-1">Problem</h4>
                  <p className="text-sm text-slate-600">{startup.problem}</p>
                </div>
              )}
              {startup.solution && (
                <div>
                  <h4 className="text-sm font-medium text-slate-900 mb-1">Solution</h4>
                  <p className="text-sm text-slate-600">{startup.solution}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Team Bios */}
          {startup.team_bios?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Team</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {startup.team_bios.map((member, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-medium">
                        {member.name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{member.name}</p>
                        <p className="text-sm text-slate-500">{member.role}</p>
                        {member.bio && (
                          <p className="text-sm text-slate-600 mt-1">{member.bio}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Links */}
          <div className="flex gap-3">
            {startup.website && (
              <Button variant="outline" asChild>
                <a href={startup.website} target="_blank" rel="noopener noreferrer">
                  <Globe className="w-4 h-4 mr-2" />
                  Website
                </a>
              </Button>
            )}
            {startup.linkedin_url && (
              <Button variant="outline" asChild>
                <a href={startup.linkedin_url} target="_blank" rel="noopener noreferrer">
                  <Linkedin className="w-4 h-4 mr-2" />
                  LinkedIn
                </a>
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="pitch" className="mt-6">
          <PitchDeckAnalysis 
            startup={startup}
            onAnalysisComplete={(analysis) => {
              updateMutation.mutate({
                pitch_deck_extracted: {
                  ...startup.pitch_deck_extracted,
                  analysis
                }
              });
            }}
            onDeckUpload={(url) => {
              updateMutation.mutate({ pitch_deck_url: url });
            }}
          />
        </TabsContent>

        <TabsContent value="team" className="mt-6">
          <TeamAnalysis 
            startup={startup}
            onAnalysisComplete={(analysis) => {
              updateMutation.mutate({ team_analysis: analysis });
            }}
          />
        </TabsContent>

        <TabsContent value="market" className="mt-6">
          <MarketValidation 
            startup={startup}
            onAnalysisComplete={(analysis) => {
              updateMutation.mutate({ market_validation: analysis });
            }}
          />
        </TabsContent>

        <TabsContent value="enrichment" className="mt-6">
          <CompanyEnricher 
            startup={startup}
            onEnrichComplete={(data) => {
              updateMutation.mutate({ enriched_data: data });
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}