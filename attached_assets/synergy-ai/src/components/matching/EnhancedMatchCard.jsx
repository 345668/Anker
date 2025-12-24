import React, { useState } from 'react';
import { 
  Building2, ExternalLink, TrendingUp, Globe, Target, 
  CheckCircle, AlertTriangle, Sparkles, Mail, ChevronDown,
  ChevronUp, DollarSign, MapPin, Briefcase, Users, Activity
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import MatchFeedback from './MatchFeedback';

export default function EnhancedMatchCard({ match, onInitiateOutreach, onSaveMatch, onFeedbackSubmit }) {
  const [expanded, setExpanded] = useState(false);

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-slate-600';
  };

  const getScoreBgColor = (score) => {
    if (score >= 80) return 'bg-emerald-50 border-emerald-200';
    if (score >= 60) return 'bg-amber-50 border-amber-200';
    return 'bg-slate-50 border-slate-200';
  };

  const getScoreLabel = (score) => {
    if (score >= 85) return 'Excellent Match';
    if (score >= 70) return 'Strong Match';
    if (score >= 50) return 'Good Match';
    return 'Potential Match';
  };

  return (
    <Card className={cn(
      "overflow-hidden transition-all hover:shadow-lg",
      match.already_contacted && "opacity-60"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-slate-900 truncate">
                  {match.investor_name}
                </h3>
                {match.investor_type && (
                  <Badge variant="secondary" className="text-xs">
                    {match.investor_type}
                  </Badge>
                )}
                {match.already_contacted && (
                  <Badge className="bg-blue-100 text-blue-800 text-xs">
                    Already Contacted
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                {match.investor_website && (
                  <a 
                    href={match.investor_website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-indigo-600"
                  >
                    <Globe className="w-3 h-3" />
                    Website
                  </a>
                )}
                {match.investor_linkedin && (
                  <a 
                    href={match.investor_linkedin} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-indigo-600"
                  >
                    <ExternalLink className="w-3 h-3" />
                    LinkedIn
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Fit Score */}
          <div className={cn(
            "flex flex-col items-center px-4 py-2 rounded-lg border-2 ml-3",
            getScoreBgColor(match.fit_score)
          )}>
            <div className={cn("text-3xl font-bold", getScoreColor(match.fit_score))}>
              {match.fit_score}
            </div>
            <div className="text-xs text-slate-600 mt-1">
              {getScoreLabel(match.fit_score)}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Progress bar */}
        <div className="space-y-1">
          <Progress 
            value={match.fit_score} 
            className={cn(
              "h-2",
              match.fit_score >= 80 && "bg-emerald-100",
              match.fit_score >= 60 && match.fit_score < 80 && "bg-amber-100"
            )}
          />
        </div>

        {/* Key Info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {match.check_size_min && match.check_size_max && (
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600">
                ${(match.check_size_min / 1000000).toFixed(1)}M - ${(match.check_size_max / 1000000).toFixed(1)}M
              </span>
            </div>
          )}
          {match.investment_stages?.length > 0 && (
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600">
                {match.investment_stages.slice(0, 2).join(', ')}
              </span>
            </div>
          )}
          {match.geographic_focus?.length > 0 && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600">
                {match.geographic_focus.slice(0, 2).join(', ')}
              </span>
            </div>
          )}
          {match.investment_focus?.length > 0 && (
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600">
                {match.investment_focus.slice(0, 2).join(', ')}
              </span>
            </div>
          )}
        </div>

        {/* Match Reasons */}
        {match.match_reasons?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-700 flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-600" />
              Why this is a match
            </p>
            <ul className="space-y-1">
              {match.match_reasons.map((reason, i) => (
                <li key={i} className="text-sm text-slate-600 pl-4 flex items-start">
                  <span className="mr-2">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Risk Factors */}
        {match.risk_factors?.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Considerations
            </p>
            <ul className="space-y-1">
              {match.risk_factors.map((risk, i) => (
                <li key={i} className="text-sm text-amber-700 pl-4 flex items-start">
                  <span className="mr-2">•</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Expandable Recommendations */}
        {match.recommendations?.length > 0 && (
          <div className="pt-2 border-t">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center justify-between w-full text-sm font-medium text-indigo-700 hover:text-indigo-800"
            >
              <span className="flex items-center gap-1">
                <Sparkles className="w-4 h-4" />
                Outreach Recommendations
              </span>
              {expanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {expanded && (
              <div className="mt-3 space-y-3 p-3 bg-indigo-50 rounded-lg">
                {match.recommendations.map((rec, i) => (
                  <div key={i}>
                    {rec.type === 'intro_angle' && (
                      <div>
                        <p className="text-xs font-medium text-indigo-900 mb-1">
                          🎯 Recommended Intro Angle
                        </p>
                        <p className="text-sm text-indigo-800">{rec.text}</p>
                      </div>
                    )}
                    {rec.type === 'materials' && (
                      <div>
                        <p className="text-xs font-medium text-indigo-900 mb-1">
                          📄 Materials to Prepare
                        </p>
                        <ul className="space-y-1">
                          {rec.items.map((item, j) => (
                            <li key={j} className="text-sm text-indigo-800 pl-4">
                              • {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {rec.type === 'meeting' && (
                      <div>
                        <p className="text-xs font-medium text-indigo-900 mb-1">
                          📅 Meeting Ask
                        </p>
                        <p className="text-sm text-indigo-800">{rec.text}</p>
                      </div>
                    )}
                    {rec.type === 'timing' && (
                      <div>
                        <p className="text-xs font-medium text-indigo-900 mb-1">
                          ⏰ Timing
                        </p>
                        <p className="text-sm text-indigo-800">{rec.text}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 pt-2">
          <div className="flex gap-2">
            <Button
              onClick={() => onInitiateOutreach(match)}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              disabled={match.already_contacted}
            >
              <Mail className="w-4 h-4 mr-2" />
              {match.already_contacted ? 'Already Contacted' : 'Initiate Outreach'}
            </Button>
            {!match.already_contacted && (
              <Button
                onClick={() => onSaveMatch(match)}
                variant="outline"
              >
                Save
              </Button>
            )}
          </div>
          
          {/* Match Feedback */}
          <div className="flex justify-center">
            <MatchFeedback 
              match={match}
              onFeedbackSubmit={onFeedbackSubmit}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}