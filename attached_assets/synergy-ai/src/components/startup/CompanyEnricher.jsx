import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Globe, Loader2, CheckCircle, Building2, Users, 
  DollarSign, Calendar, MapPin, Linkedin, ExternalLink, AlertCircle
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function CompanyEnricher({ startup, onEnrichComplete }) {
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichedData, setEnrichedData] = useState(startup?.enriched_data || null);
  const [status, setStatus] = useState(startup?.enrichment_status || 'pending');

  // Auto-enrich on mount if no data
  useEffect(() => {
    if (startup && !startup.enriched_data && startup.enrichment_status !== 'enriching' && startup.enrichment_status !== 'failed') {
      enrichCompany();
    }
  }, [startup?.id]);

  const enrichCompany = async () => {
    if (!startup?.company_name) return;
    
    setIsEnriching(true);
    setStatus('enriching');

    try {
      // Update status in DB
      await base44.entities.Startup.update(startup.id, { enrichment_status: 'enriching' });

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Find and compile comprehensive company data for this startup. Search for real information from Crunchbase, LinkedIn, and other sources.

Company: ${startup.company_name}
Website: ${startup.website || 'Not provided'}
Industry: ${startup.industry?.join(', ')}
Location: ${startup.location}

Find:
1. Company description and key facts
2. Funding history (rounds, amounts, investors)
3. Team size and key executives
4. Social media presence
5. Recent news and press
6. Technology stack if available
7. Key customers or partnerships
8. Competitors
9. Office locations
10. Any awards or recognitions`,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            founded_year: { type: 'number' },
            headquarters: { type: 'string' },
            employee_count: { type: 'string' },
            total_funding: { type: 'string' },
            funding_rounds: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  round: { type: 'string' },
                  amount: { type: 'string' },
                  date: { type: 'string' },
                  investors: { type: 'array', items: { type: 'string' } }
                }
              }
            },
            key_executives: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  title: { type: 'string' },
                  linkedin: { type: 'string' }
                }
              }
            },
            social_links: {
              type: 'object',
              properties: {
                linkedin: { type: 'string' },
                twitter: { type: 'string' },
                crunchbase: { type: 'string' }
              }
            },
            recent_news: { type: 'array', items: { type: 'string' } },
            key_customers: { type: 'array', items: { type: 'string' } },
            awards: { type: 'array', items: { type: 'string' } },
            tech_stack: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      setEnrichedData(result);
      setStatus('enriched');
      
      // Update status in DB
      await base44.entities.Startup.update(startup.id, { 
        enriched_data: result,
        enrichment_status: 'enriched'
      });
      
      toast.success('Company data enriched successfully');
      
      if (onEnrichComplete) {
        onEnrichComplete(result);
      }
    } catch (error) {
      console.error('Enrichment error:', error);
      setStatus('failed');
      await base44.entities.Startup.update(startup.id, { enrichment_status: 'failed' });
      toast.error('Failed to enrich company data');
    } finally {
      setIsEnriching(false);
    }
  };

  const statusConfig = {
    pending: { icon: Globe, color: 'bg-slate-100 text-slate-600', label: 'Pending' },
    enriching: { icon: Loader2, color: 'bg-blue-100 text-blue-700', label: 'Enriching...', spin: true },
    enriched: { icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700', label: 'Enriched' },
    failed: { icon: AlertCircle, color: 'bg-red-100 text-red-700', label: 'Failed' }
  };

  const StatusIcon = statusConfig[status]?.icon || Globe;

  if (!enrichedData) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-indigo-600" />
              Company Data Enrichment
            </CardTitle>
            <Badge className={cn("flex items-center gap-1.5", statusConfig[status]?.color)}>
              <StatusIcon className={cn("w-3.5 h-3.5", statusConfig[status]?.spin && "animate-spin")} />
              {statusConfig[status]?.label}
            </Badge>
          </div>
          <CardDescription>
            Pull company data from Crunchbase, LinkedIn, and other sources
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'enriching' ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-3" />
              <p className="text-sm text-slate-600">Searching external sources...</p>
              <p className="text-xs text-slate-400 mt-1">This may take a moment</p>
            </div>
          ) : (
            <Button 
              onClick={enrichCompany}
              disabled={isEnriching}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {status === 'failed' ? (
                <>
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Retry Enrichment
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4 mr-2" />
                  Enrich Company Data
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-600" />
            Company Data
          </CardTitle>
          <Badge className={cn("flex items-center gap-1.5", statusConfig[status]?.color)}>
            <StatusIcon className={cn("w-3.5 h-3.5", statusConfig[status]?.spin && "animate-spin")} />
            {statusConfig[status]?.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Key Stats */}
        <div className="grid grid-cols-3 gap-4">
          {enrichedData.founded_year && (
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <Calendar className="w-5 h-5 text-slate-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-slate-900">{enrichedData.founded_year}</p>
              <p className="text-xs text-slate-500">Founded</p>
            </div>
          )}
          {enrichedData.employee_count && (
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <Users className="w-5 h-5 text-slate-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-slate-900">{enrichedData.employee_count}</p>
              <p className="text-xs text-slate-500">Employees</p>
            </div>
          )}
          {enrichedData.total_funding && (
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <DollarSign className="w-5 h-5 text-slate-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-slate-900">{enrichedData.total_funding}</p>
              <p className="text-xs text-slate-500">Raised</p>
            </div>
          )}
        </div>

        {/* Description */}
        {enrichedData.description && (
          <div>
            <h4 className="text-sm font-medium text-slate-900 mb-2">About</h4>
            <p className="text-sm text-slate-600">{enrichedData.description}</p>
          </div>
        )}

        {/* Funding Rounds */}
        {enrichedData.funding_rounds?.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-900 mb-3">Funding History</h4>
            <div className="space-y-2">
              {enrichedData.funding_rounds.map((round, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">{round.round}</p>
                    <p className="text-xs text-slate-500">{round.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-emerald-600">{round.amount}</p>
                    {round.investors?.length > 0 && (
                      <p className="text-xs text-slate-500">{round.investors.slice(0, 2).join(', ')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key Executives */}
        {enrichedData.key_executives?.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-900 mb-3">Key Executives</h4>
            <div className="grid grid-cols-2 gap-2">
              {enrichedData.key_executives.map((exec, i) => (
                <div key={i} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-medium text-sm">
                    {exec.name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{exec.name}</p>
                    <p className="text-xs text-slate-500 truncate">{exec.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Social Links */}
        {enrichedData.social_links && (
          <div className="flex gap-2">
            {enrichedData.social_links.linkedin && (
              <Button variant="outline" size="sm" asChild>
                <a href={enrichedData.social_links.linkedin} target="_blank" rel="noopener noreferrer">
                  <Linkedin className="w-4 h-4 mr-1" />
                  LinkedIn
                </a>
              </Button>
            )}
            {enrichedData.social_links.crunchbase && (
              <Button variant="outline" size="sm" asChild>
                <a href={enrichedData.social_links.crunchbase} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Crunchbase
                </a>
              </Button>
            )}
          </div>
        )}

        {/* Recent News */}
        {enrichedData.recent_news?.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-slate-900 mb-2">Recent News</h4>
            <ul className="space-y-1">
              {enrichedData.recent_news.slice(0, 3).map((news, i) => (
                <li key={i} className="text-sm text-slate-600">• {news}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}