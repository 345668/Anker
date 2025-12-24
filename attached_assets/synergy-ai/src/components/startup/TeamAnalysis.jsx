import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Users, Loader2, Star, AlertTriangle, CheckCircle,
  Linkedin, Briefcase, GraduationCap, Award
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
import { cn } from "@/lib/utils";

export default function TeamAnalysis({ startup, onAnalysisComplete }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(startup?.team_analysis || null);

  const analyzeTeam = async () => {
    setIsAnalyzing(true);

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this startup team for investor due diligence:

Startup: ${startup.company_name}
Industry: ${startup.industry?.join(', ')}
Team Bios: ${JSON.stringify(startup.team_bios || [])}

Evaluate:
1. Overall team score (0-100)
2. Team completeness (missing key roles)
3. Founder-market fit assessment
4. Key strengths of the team
5. Gaps or concerns
6. Domain expertise evaluation
7. Previous exit experience
8. Network quality indicators
9. Recommendations for strengthening the team`,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            overall_score: { type: 'number' },
            completeness: { type: 'string' },
            missing_roles: { type: 'array', items: { type: 'string' } },
            founder_market_fit: { type: 'string' },
            fit_score: { type: 'number' },
            strengths: { type: 'array', items: { type: 'string' } },
            concerns: { type: 'array', items: { type: 'string' } },
            domain_expertise: { type: 'string' },
            exit_experience: { type: 'boolean' },
            network_quality: { type: 'string' },
            recommendations: { type: 'array', items: { type: 'string' } },
            member_assessments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  role: { type: 'string' },
                  score: { type: 'number' },
                  highlights: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          }
        }
      });

      setAnalysis(result);
      if (onAnalysisComplete) {
        onAnalysisComplete(result);
      }
    } catch (error) {
      console.error('Team analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!analysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Team Analysis
          </CardTitle>
          <CardDescription>
            AI-powered evaluation of your founding team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={analyzeTeam}
            disabled={isAnalyzing}
            className="w-full bg-indigo-600 hover:bg-indigo-700"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Team...
              </>
            ) : (
              <>
                <Users className="w-4 h-4 mr-2" />
                Analyze Team
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Team Analysis
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className={cn(
              "px-3 py-1 rounded-full text-sm font-medium",
              analysis.overall_score >= 70 ? "bg-emerald-100 text-emerald-700" :
              analysis.overall_score >= 50 ? "bg-amber-100 text-amber-700" :
              "bg-red-100 text-red-700"
            )}>
              {analysis.overall_score}/100
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Founder-Market Fit */}
        <div className="p-4 bg-slate-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Founder-Market Fit</span>
            <Badge className={cn(
              analysis.fit_score >= 70 ? "bg-emerald-100 text-emerald-700" :
              analysis.fit_score >= 50 ? "bg-amber-100 text-amber-700" :
              "bg-red-100 text-red-700"
            )}>
              {analysis.fit_score}%
            </Badge>
          </div>
          <p className="text-sm text-slate-600">{analysis.founder_market_fit}</p>
        </div>

        {/* Team Members */}
        {analysis.member_assessments?.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-900 mb-3">Team Members</h4>
            <div className="space-y-3">
              {analysis.member_assessments.map((member, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-white border rounded-lg">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-medium">
                    {member.name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-900">{member.name}</p>
                      <Badge variant="outline">{member.score}/100</Badge>
                    </div>
                    <p className="text-sm text-slate-500">{member.role}</p>
                    {member.highlights?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {member.highlights.map((h, j) => (
                          <Badge key={j} variant="secondary" className="text-xs">
                            {h}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Strengths */}
        {analysis.strengths?.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-emerald-700 mb-2 flex items-center gap-1">
              <CheckCircle className="w-4 h-4" />
              Strengths
            </h4>
            <ul className="space-y-1">
              {analysis.strengths.map((s, i) => (
                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                  <Star className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Missing Roles */}
        {analysis.missing_roles?.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              Missing Roles
            </h4>
            <div className="flex flex-wrap gap-2">
              {analysis.missing_roles.map((role, i) => (
                <Badge key={i} variant="outline" className="border-amber-300 text-amber-700">
                  {role}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {analysis.recommendations?.length > 0 && (
          <div className="p-4 bg-indigo-50 rounded-lg">
            <h4 className="text-sm font-medium text-indigo-700 mb-2">Recommendations</h4>
            <ul className="space-y-1">
              {analysis.recommendations.map((r, i) => (
                <li key={i} className="text-sm text-indigo-900">• {r}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}