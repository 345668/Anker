import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Loader2, UserPlus, CheckCircle, Mail, Linkedin as LinkedinIcon } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function FirmKeyPartnersExtractor({ firm, existingContacts }) {
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [foundPartners, setFoundPartners] = useState([]);
  const queryClient = useQueryClient();

  const extractPartners = async () => {
    setExtracting(true);
    setProgress(20);
    setFoundPartners([]);
    
    try {
      toast.info(`Extracting key partners from ${firm.company_name}...`);
      
      // Research key investment team members
      const partnersData = await base44.integrations.Core.InvokeLLM({
        prompt: `Identify key investment professionals at ${firm.company_name}.

Firm: ${firm.company_name}
Website: ${firm.website || 'Unknown'}
LinkedIn: ${firm.linkedin_url || 'Unknown'}
Type: ${firm.firm_type || 'Unknown'}

RESEARCH TASKS:
1. Find all Partners, Managing Directors, Principals
2. Get their full names, titles, and roles
3. Find their work emails (use common patterns: first.last@domain.com)
4. Find their LinkedIn profiles
5. Find their direct phone numbers if available
6. Identify their investment focus areas
7. Get brief bios or backgrounds

Focus on decision-makers and active investors.
Use the company website's team page, LinkedIn company page, Crunchbase, news articles, and press releases.

IMPORTANT: Only include people who are CURRENTLY at the firm.
Verify each person is still actively working there.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            partners: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  full_name: { type: 'string' },
                  first_name: { type: 'string' },
                  last_name: { type: 'string' },
                  title: { type: 'string' },
                  work_email: { type: 'string' },
                  linkedin_url: { type: 'string' },
                  primary_phone: { type: 'string' },
                  investment_focus: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  bio: { type: 'string' },
                  is_partner: { type: 'boolean' }
                }
              }
            },
            total_team_size: { type: 'number' },
            data_confidence: { type: 'string' }
          }
        }
      });

      setProgress(60);

      const partners = partnersData.partners || [];
      
      // Filter out existing contacts by name/email match
      const newPartners = partners.filter(partner => {
        return !existingContacts.some(contact => 
          contact.full_name?.toLowerCase() === partner.full_name?.toLowerCase() ||
          (partner.work_email && contact.work_email?.toLowerCase() === partner.work_email?.toLowerCase())
        );
      });

      setFoundPartners(newPartners);
      setProgress(80);

      if (newPartners.length === 0) {
        toast.info('No new partners found - all existing team members are already in your contacts');
        setExtracting(false);
        setProgress(0);
        return;
      }

      // Create contact records for new partners
      let created = 0;
      for (const partner of newPartners) {
        try {
          await base44.entities.Contact.create({
            full_name: partner.full_name,
            first_name: partner.first_name,
            last_name: partner.last_name,
            title: partner.title,
            work_email: partner.work_email,
            primary_phone: partner.primary_phone,
            linkedin_url: partner.linkedin_url,
            investment_focus: partner.investment_focus,
            bio: partner.bio,
            firm_id: firm.id,
            firm_name: firm.company_name,
            is_primary: partner.is_partner || false,
            enrichment_status: 'enriched',
            last_enriched: new Date().toISOString()
          });
          created++;
        } catch (error) {
          console.error('Failed to create contact:', partner.full_name, error);
        }
      }

      setProgress(100);
      queryClient.invalidateQueries(['contacts']);
      toast.success(`Created ${created} new contact${created === 1 ? '' : 's'}!`);
      
    } catch (error) {
      console.error('Partner extraction error:', error);
      toast.error('Failed to extract partners');
    } finally {
      setExtracting(false);
      setProgress(0);
      setTimeout(() => setFoundPartners([]), 3000);
    }
  };

  return (
    <div className="bg-white/60 rounded-lg border-2 border-white/60 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-600" />
          <h4 className="font-semibold text-sm text-slate-700">Key Investment Partners</h4>
          {existingContacts.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {existingContacts.length} known
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={extractPartners}
          disabled={extracting}
        >
          {extracting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <UserPlus className="w-4 h-4 mr-2" />
          )}
          {extracting ? 'Extracting...' : 'Find Partners'}
        </Button>
      </div>

      {extracting && (
        <div className="mb-4">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-slate-500 mt-2">
            Researching team members, partners, and decision-makers...
          </p>
        </div>
      )}

      {foundPartners.length > 0 && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-green-800">
              Found {foundPartners.length} new partner{foundPartners.length === 1 ? '' : 's'}!
            </span>
          </div>
          <div className="space-y-2">
            {foundPartners.map((partner, i) => (
              <div key={i} className="text-xs text-green-700">
                {partner.full_name} - {partner.title}
                {partner.work_email && ` • ${partner.work_email}`}
              </div>
            ))}
          </div>
        </div>
      )}

      {existingContacts.length > 0 ? (
        <div className="space-y-2">
          {existingContacts.slice(0, 5).map((contact) => (
            <div key={contact.id} className="flex items-start justify-between p-2 bg-white/60 rounded-lg border border-white/60">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">{contact.full_name}</p>
                <p className="text-xs text-slate-600">{contact.title || '—'}</p>
              </div>
              <div className="flex items-center gap-1">
                {contact.work_email && (
                  <a href={`mailto:${contact.work_email}`} className="text-indigo-600 hover:text-indigo-800">
                    <Mail className="w-3 h-3" />
                  </a>
                )}
                {contact.linkedin_url && (
                  <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800">
                    <LinkedinIcon className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
          {existingContacts.length > 5 && (
            <p className="text-xs text-slate-500 text-center">
              +{existingContacts.length - 5} more contacts
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500 text-center py-4">
          No contacts yet. Click "Find Partners" to automatically discover key team members.
        </p>
      )}
    </div>
  );
}