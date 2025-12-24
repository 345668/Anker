import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Shield, Clock, Users, AlertTriangle, CheckCircle, 
  TrendingUp, ExternalLink, Loader2, RefreshCw, MessageSquare,
  Award, Activity, Network
} from 'lucide-react';
import CoInvestorNetworkGraph from './CoInvestorNetworkGraph';
import SentimentNewsAnalysis from './SentimentNewsAnalysis';
import ConflictAlertManager from './ConflictAlertManager';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export default function InvestorDueDiligence({ firm, startupIndustries = [] }) {
  const [ddData, setDdData] = useState(null);
  const [loading, setLoading] = useState(false);

  const runDueDiligence = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('investorDueDiligence', {
        firmId: firm.id,
        startupIndustries: startupIndustries
      });

      if (response.data.success) {
        setDdData(response.data);
      }
    } catch (error) {
      console.error('Due diligence error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (firm) {
      runDueDiligence();
    }
  }, [firm.id]);

  if (loading && !ddData) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
          <p className="text-sm text-slate-600">Running due diligence analysis...</p>
        </CardContent>
      </Card>
    );
  }

  if (!ddData) return null;

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const getSeverityColor = (severity) => {
    if (severity === 'high') return 'bg-red-100 text-red-800 border-red-200';
    if (severity === 'medium') return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-blue-100 text-blue-800 border-blue-200';
  };

  return (
    <div className="space-y-6">
      {/* Sentiment & News Analysis */}
      <SentimentNewsAnalysis firm={firm} />

      {/* Co-Investor Network Graph */}
      {ddData?.co_investor_network?.length > 0 && (
        <CoInvestorNetworkGraph 
          coInvestors={ddData.co_investor_network} 
          firmName={firm.company_name}
        />
      )}

      {/* Conflict Alert Manager */}
      <ConflictAlertManager 
        firm={firm}
        conflicts={ddData?.conflicts || []}
        onAlertsUpdate={runDueDiligence}
      />

      {/* Header Scores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-indigo-900 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Due Diligence Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className={cn("text-4xl font-bold", getScoreColor(ddData.due_diligence_score))}>
                {ddData.due_diligence_score}
              </span>
              <span className="text-sm text-slate-500">/100</span>
            </div>
            <Progress value={ddData.due_diligence_score} className="h-2 mt-3" />
            {ddData.conflicts?.length > 0 && (
              <p className="text-xs text-amber-700 mt-2">
                {ddData.conflicts.length} potential issue{ddData.conflicts.length > 1 ? 's' : ''} detected
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-emerald-900 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Engagement Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className={cn("text-4xl font-bold", getScoreColor(ddData.engagement_score))}>
                {ddData.engagement_score}
              </span>
              <span className="text-sm text-slate-500">/100</span>
            </div>
            <Progress value={ddData.engagement_score} className="h-2 mt-3" />
            {ddData.response_metrics.reply_rate > 0 && (
              <p className="text-xs text-slate-600 mt-2">
                {ddData.response_metrics.reply_rate}% reply rate
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Key Recommendations */}
      {ddData.recommendations?.length > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-amber-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Key Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {ddData.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                  <span className="mt-1">•</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Accordion type="multiple" className="space-y-4">
        {/* Response Metrics */}
        <AccordionItem value="response" className="border rounded-lg px-4 bg-white">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-slate-600" />
              <div className="text-left">
                <p className="font-semibold">Response Time Analysis</p>
                <p className="text-xs text-slate-500">
                  {ddData.response_metrics.total_interactions} interactions tracked
                </p>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600 mb-1">Avg Response</p>
                <p className="text-lg font-bold text-slate-900">
                  {ddData.response_metrics.avgResponseTime 
                    ? `${ddData.response_metrics.avgResponseTime.toFixed(1)}h`
                    : 'N/A'}
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600 mb-1">Fastest</p>
                <p className="text-lg font-bold text-emerald-600">
                  {ddData.response_metrics.fastestResponse 
                    ? `${ddData.response_metrics.fastestResponse.toFixed(1)}h`
                    : 'N/A'}
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600 mb-1">Slowest</p>
                <p className="text-lg font-bold text-red-600">
                  {ddData.response_metrics.slowestResponse 
                    ? `${ddData.response_metrics.slowestResponse.toFixed(1)}h`
                    : 'N/A'}
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-600 mb-1">Reply Rate</p>
                <p className="text-lg font-bold text-indigo-600">
                  {ddData.response_metrics.reply_rate}%
                </p>
              </div>
            </div>
            {ddData.response_metrics.responseCount > 0 && (
              <p className="text-xs text-slate-500 mt-3">
                Based on {ddData.response_metrics.responseCount} email exchange{ddData.response_metrics.responseCount > 1 ? 's' : ''}
              </p>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Co-Investor Network */}
        {ddData.co_investor_network?.length > 0 && (
          <AccordionItem value="network" className="border rounded-lg px-4 bg-white">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <Network className="w-5 h-5 text-slate-600" />
                <div className="text-left">
                  <p className="font-semibold">Co-Investor Network</p>
                  <p className="text-xs text-slate-500">
                    {ddData.co_investor_network.length} frequent co-investors
                  </p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="space-y-3">
                {ddData.co_investor_network.map((coInvestor, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{coInvestor.firm_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {coInvestor.firm_type && (
                          <Badge variant="secondary" className="text-xs">
                            {coInvestor.firm_type}
                          </Badge>
                        )}
                        <span className="text-xs text-slate-500">
                          {coInvestor.co_investment_count} co-investment{coInvestor.co_investment_count > 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <Badge className="bg-indigo-100 text-indigo-700">
                      #{i + 1}
                    </Badge>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-4">
                💡 These firms frequently co-invest - consider reaching out to them as well
              </p>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Conflicts & Red Flags */}
        {ddData.conflicts?.length > 0 && (
          <AccordionItem value="conflicts" className="border rounded-lg px-4 bg-white">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <div className="text-left">
                  <p className="font-semibold">Potential Conflicts</p>
                  <p className="text-xs text-slate-500">
                    {ddData.conflicts.length} item{ddData.conflicts.length > 1 ? 's' : ''} to review
                  </p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="space-y-3">
                {ddData.conflicts.map((conflict, i) => (
                  <div key={i} className={cn("p-4 rounded-lg border", getSeverityColor(conflict.severity))}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <Badge className={cn("text-xs", getSeverityColor(conflict.severity))}>
                          {conflict.severity} severity
                        </Badge>
                        <p className="text-xs text-slate-500 mt-1 uppercase tracking-wide">
                          {conflict.type.replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-slate-900 mb-2">
                      {conflict.description}
                    </p>
                    <p className="text-xs text-slate-600">
                      <strong>Recommendation:</strong> {conflict.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Web Research */}
        {ddData.web_research && (
          <AccordionItem value="research" className="border rounded-lg px-4 bg-white">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <ExternalLink className="w-5 h-5 text-slate-600" />
                <div className="text-left">
                  <p className="font-semibold">Web Research Summary</p>
                  <p className="text-xs text-slate-500">
                    Latest insights from online sources
                  </p>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 space-y-4">
              {/* Summary */}
              {ddData.web_research.summary && (
                <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                  <p className="text-sm text-indigo-900">{ddData.web_research.summary}</p>
                </div>
              )}

              {/* Reputation Scores */}
              <div className="grid grid-cols-2 gap-4">
                {ddData.web_research.reputation_score && (
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-600 mb-1 flex items-center gap-1">
                      <Award className="w-3 h-3" />
                      Reputation
                    </p>
                    <p className={cn("text-2xl font-bold", getScoreColor(ddData.web_research.reputation_score))}>
                      {ddData.web_research.reputation_score}/100
                    </p>
                  </div>
                )}
                {ddData.web_research.founder_friendly_rating && (
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-slate-600 mb-1 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      Founder Friendly
                    </p>
                    <p className={cn("text-2xl font-bold", getScoreColor(ddData.web_research.founder_friendly_rating * 10))}>
                      {ddData.web_research.founder_friendly_rating}/10
                    </p>
                  </div>
                )}
              </div>

              {/* Recent News */}
              {ddData.web_research.recent_news?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-900 mb-2">Recent News</p>
                  <ul className="space-y-2">
                    {ddData.web_research.recent_news.map((news, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700 p-2 bg-slate-50 rounded">
                        <MessageSquare className="w-4 h-4 text-slate-400 mt-0.5" />
                        {news}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Investment Philosophy */}
              {ddData.web_research.investment_philosophy && (
                <div>
                  <p className="text-sm font-medium text-slate-900 mb-2">Investment Philosophy</p>
                  <p className="text-sm text-slate-700 p-3 bg-slate-50 rounded-lg">
                    {ddData.web_research.investment_philosophy}
                  </p>
                </div>
              )}

              {/* Key Team */}
              {ddData.web_research.key_team_members?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-900 mb-2">Key Team Members</p>
                  <div className="space-y-2">
                    {ddData.web_research.key_team_members.map((member, i) => (
                      <div key={i} className="p-3 bg-slate-50 rounded-lg">
                        <p className="font-medium text-slate-900">{member.name}</p>
                        <p className="text-xs text-slate-600">{member.role}</p>
                        <p className="text-xs text-slate-600 mt-1">{member.background}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Value-Add Services */}
              {ddData.web_research.value_add_services?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-900 mb-2">Value-Add Services</p>
                  <div className="flex flex-wrap gap-2">
                    {ddData.web_research.value_add_services.map((service, i) => (
                      <Badge key={i} variant="outline" className="bg-emerald-50 text-emerald-700">
                        {service}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Red Flags */}
              {ddData.web_research.red_flags?.length > 0 && (
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm font-medium text-red-900 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Red Flags Identified
                  </p>
                  <ul className="space-y-1">
                    {ddData.web_research.red_flags.map((flag, i) => (
                      <li key={i} className="text-sm text-red-800 pl-4">• {flag}</li>
                    ))}
                  </ul>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        )}
      </Accordion>

      {/* Refresh Button */}
      <div className="flex justify-center pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={runDueDiligence}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Refresh Analysis
        </Button>
      </div>
    </div>
  );
}