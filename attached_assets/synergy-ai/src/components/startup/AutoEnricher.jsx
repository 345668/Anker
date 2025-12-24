import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle, AlertCircle, Globe } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function AutoEnricher({ startup, onEnrichComplete }) {
  const [status, setStatus] = useState(startup?.enrichment_status || 'pending');

  useEffect(() => {
    // Auto-trigger enrichment if needed
    if (startup && !startup.enriched_data && startup.enrichment_status !== 'enriching' && startup.enrichment_status !== 'failed') {
      triggerAutoEnrichment();
    }
  }, [startup?.id]);

  const triggerAutoEnrichment = async () => {
    if (!startup?.company_name) return;
    
    setStatus('enriching');
    
    try {
      // Update status to enriching
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

      await base44.entities.Startup.update(startup.id, { 
        enriched_data: result,
        enrichment_status: 'enriched'
      });
      
      setStatus('enriched');
      toast.success('Company data enriched successfully');
      
      if (onEnrichComplete) {
        onEnrichComplete(result);
      }
    } catch (error) {
      console.error('Auto-enrichment error:', error);
      await base44.entities.Startup.update(startup.id, { enrichment_status: 'failed' });
      setStatus('failed');
      toast.error('Failed to enrich company data');
    }
  };

  const statusConfig = {
    pending: { icon: Globe, color: 'bg-slate-100 text-slate-600', label: 'Pending' },
    enriching: { icon: Loader2, color: 'bg-blue-100 text-blue-700', label: 'Enriching...', spin: true },
    enriched: { icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700', label: 'Enriched' },
    failed: { icon: AlertCircle, color: 'bg-red-100 text-red-700', label: 'Failed' }
  };

  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <Badge className={cn("flex items-center gap-1.5", config.color)}>
      <Icon className={cn("w-3.5 h-3.5", config.spin && "animate-spin")} />
      {config.label}
    </Badge>
  );
}