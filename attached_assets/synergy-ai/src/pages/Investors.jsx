import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Building2, Plus, Loader2, Search, Filter, ExternalLink,
  Edit, Trash2, Users, Globe, DollarSign, MapPin, MoreHorizontal,
  Sparkles, Tags, Brain, ChevronDown, ChevronRight, Mail, Phone, Linkedin as LinkedinIcon, UserPlus,
  TrendingUp, Calendar, Target, Briefcase, CheckCircle, AlertCircle, X
} from 'lucide-react';
import InvestorAutoTagger from '@/components/crm/InvestorAutoTagger';
import FieldVisibilityManager from '@/components/crm/FieldVisibilityManager';
import FirmDealHistory from '@/components/crm/FirmDealHistory';
import InvestorDueDiligence from '@/components/crm/InvestorDueDiligence';
import FirmActivityTracker from '@/components/crm/FirmActivityTracker';
import FirmKeyPartnersExtractor from '@/components/crm/FirmKeyPartnersExtractor';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

const firmTypes = ['VC', 'CVC', 'Family Office', 'Angel', 'Bank', 'Pension Fund', 'Asset Manager', 'Wealth Manager', 'Fund of Funds', 'Accelerator', 'Other'];
const stages = ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Growth'];

/**
 * Investors — SynergyAI "Liquid Glass" restyle
 */

function AnimatedGrid() {
  return (
    <div
      className="absolute inset-0 opacity-[0.22] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_70%)]"
      aria-hidden="true"
    >
      <div className="h-full w-full bg-[linear-gradient(to_right,rgba(15,23,42,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.07)_1px,transparent_1px)] bg-[size:56px_56px] animate-[gridDrift_18s_linear_infinite]" />
      <style>{`
        @keyframes gridDrift {
          from { transform: translateY(0px); }
          to { transform: translateY(56px); }
        }
      `}</style>
    </div>
  );
}

function PageBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />
      <AnimatedGrid />
      <div className="absolute -top-24 -right-28 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-purple-400/20 to-pink-400/16 blur-3xl" />
      <div className="absolute top-1/3 right-[10%] h-[420px] w-[420px] rounded-full bg-gradient-to-br from-orange-400/14 to-yellow-400/12 blur-3xl" />
      <div className="absolute -bottom-24 left-[12%] h-[520px] w-[520px] rounded-full bg-gradient-to-br from-green-400/12 to-blue-400/14 blur-3xl" />
    </div>
  );
}

function GlassSurface({ className, children }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl",
        "border-2 border-white/60",
        "bg-gradient-to-br from-white/55 to-white/30",
        "backdrop-blur-2xl",
        "shadow-lg hover:shadow-xl transition-shadow",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.65),transparent_55%)] opacity-60" />
      {children}
    </div>
  );
}

function UnderGlow({ className }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute -inset-4 -z-10 rounded-[2.25rem] blur-3xl opacity-30",
        "bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400",
        className
      )}
      aria-hidden="true"
    />
  );
}

function Pill({ children, className }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1",
        "border-2 border-white/60 bg-white/55 backdrop-blur-2xl",
        "text-xs font-semibold text-slate-700",
        className
      )}
    >
      <span className="h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
      {children}
    </div>
  );
}

function RainbowCTA({ className, children, ...props }) {
  return (
    <Button
      className={cn(
        "group relative h-11 overflow-hidden rounded-full px-6 font-semibold text-white",
        "shadow-lg hover:shadow-xl transition-shadow",
        className
      )}
      {...props}
    >
      <span className="absolute inset-0 bg-[linear-gradient(90deg,#7c3aed,#ec4899,#fb923c,#facc15,#22c55e,#3b82f6,#7c3aed)] bg-[length:220%_100%] animate-[rainbow_7s_linear_infinite]" />
      <span className="absolute -inset-y-8 -left-1/3 w-1/3 rotate-12 bg-white/25 blur-md opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:translate-x-[220%]" />
      <span className="relative flex items-center justify-center">{children}</span>

      <style>{`
        @keyframes rainbow {
          0% { background-position: 0% 50%; }
          100% { background-position: 220% 50%; }
        }
      `}</style>
    </Button>
  );
}

function SecondaryButton({ className, ...props }) {
  return (
    <Button
      variant="outline"
      className={cn(
        "h-11 rounded-full px-5",
        "border-2 border-white/60 bg-white/55 backdrop-blur-2xl",
        "text-slate-800 hover:bg-white/70",
        "shadow-lg hover:shadow-xl transition-shadow",
        className
      )}
      {...props}
    />
  );
}

function GlassInput({ className, ...props }) {
  return (
    <Input
      className={cn(
        "h-11 rounded-2xl",
        "border-2 border-white/60 bg-white/55 backdrop-blur-2xl",
        "placeholder:text-slate-500",
        "shadow-lg focus-visible:ring-0",
        className
      )}
      {...props}
    />
  );
}

function GlassSelectTrigger({ className, ...props }) {
  return (
    <SelectTrigger
      className={cn(
        "h-11 rounded-2xl",
        "border-2 border-white/60 bg-white/55 backdrop-blur-2xl",
        "shadow-lg focus:ring-0",
        className
      )}
      {...props}
    />
  );
}

export default function Investors() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('company_name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [showDialog, setShowDialog] = useState(false);
  const [showTagger, setShowTagger] = useState(false);
  const [editingFirm, setEditingFirm] = useState(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState({ 
    current: 0, 
    total: 0, 
    currentFirm: '', 
    currentBatch: 0, 
    totalBatches: 0 
  });
  const [enrichmentLimit, setEnrichmentLimit] = useState(10000);
  const [showEnrichmentDialog, setShowEnrichmentDialog] = useState(false);
  const [importingContacts, setImportingContacts] = useState(false);
  const [contactImportProgress, setContactImportProgress] = useState({ 
    current: 0, 
    total: 0, 
    currentBatch: 0, 
    totalBatches: 0 
  });
  const [taggingLimit, setTaggingLimit] = useState(10000);
  const [showTaggingDialog, setShowTaggingDialog] = useState(false);
  const [visibleFields, setVisibleFields] = useState([
    'company_name', 'firm_type', 'investment_focus', 'investment_stages', 'enrichment_status'
  ]);
  const [expandedFirms, setExpandedFirms] = useState(new Set());
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [selectedFirm, setSelectedFirm] = useState(null);
  const [contactFormData, setContactFormData] = useState({
    full_name: '',
    first_name: '',
    last_name: '',
    title: '',
    work_email: '',
    personal_email: '',
    primary_phone: '',
    linkedin_url: '',
    twitter_url: '',
    bio: '',
  });
  const [deduplicating, setDeduplicating] = useState(false);
  const [dedupeProgress, setDedupeProgress] = useState({ 
    current: 0, 
    total: 0, 
    currentBatch: 0, 
    totalBatches: 0 
  });
  const [formData, setFormData] = useState({
    company_name: '',
    parent_company: '',
    website: '',
    linkedin_url: '',
    firm_type: '',
    investment_focus: [],
    investment_stages: [],
    geographic_focus: [],
    check_size_min: '',
    check_size_max: '',
    notes: '',
    current_fund_name: '',
    current_fund_target: '',
    current_fund_raised: '',
    fund_close_date: '',
    fund_status: '',
  });

  const queryClient = useQueryClient();

  const { data: firms = [], isLoading } = useQuery({
    queryKey: ['firms'],
    queryFn: () => base44.entities.InvestorFirm.list('-created_date', 50000),
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.list('-created_date', 50000),
  });

  const { data: deals = [] } = useQuery({
    queryKey: ['deals'],
    queryFn: () => base44.entities.InvestmentDeal.list('-created_date', 50000),
  });

  const contactCountByFirm = contacts.reduce((acc, c) => {
    acc[c.firm_id] = (acc[c.firm_id] || 0) + 1;
    return acc;
  }, {});

  const dealCountByFirm = deals.reduce((acc, d) => {
    acc[d.firm_id] = (acc[d.firm_id] || 0) + 1;
    return acc;
  }, {});

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.InvestorFirm.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['firms']);
      setShowDialog(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.InvestorFirm.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['firms']);
      setShowDialog(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.InvestorFirm.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['firms']),
  });

  const createContactMutation = useMutation({
    mutationFn: (data) => base44.entities.Contact.create(data),
    onSuccess: async (newContact) => {
      queryClient.invalidateQueries(['contacts']);
      
      // Sync to Folk CRM if firm has folk_id
      if (selectedFirm?.folk_id) {
        try {
          await base44.functions.invoke('folkApi', {
            action: 'createPerson',
            data: {
              fullName: newContact.full_name,
              firstName: newContact.first_name,
              lastName: newContact.last_name,
              jobTitle: newContact.title,
              emails: [newContact.work_email, newContact.personal_email].filter(Boolean),
              phones: [newContact.primary_phone].filter(Boolean),
              urls: [newContact.linkedin_url, newContact.twitter_url].filter(Boolean),
              description: newContact.bio,
              companies: [{ id: selectedFirm.folk_id }]
            }
          });
          toast.success('Contact created and synced to Folk CRM');
        } catch (error) {
          toast.warning('Contact created locally but failed to sync to Folk');
        }
      }
      
      setShowContactDialog(false);
      resetContactForm();
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Contact.update(id, data),
    onSuccess: async (updatedContact) => {
      queryClient.invalidateQueries(['contacts']);
      
      // Sync to Folk CRM if contact has folk_id
      if (updatedContact.folk_id) {
        try {
          await base44.functions.invoke('folkApi', {
            action: 'updatePerson',
            data: {
              id: updatedContact.folk_id,
              updates: {
                fullName: updatedContact.full_name,
                firstName: updatedContact.first_name,
                lastName: updatedContact.last_name,
                jobTitle: updatedContact.title,
                emails: [updatedContact.work_email, updatedContact.personal_email].filter(Boolean),
                phones: [updatedContact.primary_phone].filter(Boolean),
                urls: [updatedContact.linkedin_url, updatedContact.twitter_url].filter(Boolean),
                description: updatedContact.bio,
              }
            }
          });
          
          await base44.entities.Contact.update(updatedContact.id, {
            folk_sync_status: 'synced',
            folk_last_synced_at: new Date().toISOString()
          });
          
          toast.success('Contact updated and synced to Folk CRM');
        } catch (error) {
          await base44.entities.Contact.update(updatedContact.id, {
            folk_sync_status: 'error',
            folk_sync_error: error.message
          });
          toast.warning('Contact updated locally but failed to sync to Folk');
        }
      } else {
        await base44.entities.Contact.update(updatedContact.id, {
          folk_sync_status: 'pending'
        });
      }
      
      setShowContactDialog(false);
      resetContactForm();
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: (id) => base44.entities.Contact.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['contacts']),
  });

  const resetForm = () => {
    setFormData({
      company_name: '',
      parent_company: '',
      website: '',
      linkedin_url: '',
      firm_type: '',
      investment_focus: [],
      investment_stages: [],
      geographic_focus: [],
      check_size_min: '',
      check_size_max: '',
      notes: '',
      current_fund_name: '',
      current_fund_target: '',
      current_fund_raised: '',
      fund_close_date: '',
      fund_status: '',
    });
    setEditingFirm(null);
  };

  const resetContactForm = () => {
    setContactFormData({
      full_name: '',
      first_name: '',
      last_name: '',
      title: '',
      work_email: '',
      personal_email: '',
      primary_phone: '',
      linkedin_url: '',
      twitter_url: '',
      bio: '',
    });
    setEditingContact(null);
    setSelectedFirm(null);
  };

  const toggleFirmExpansion = (firmId) => {
    const newExpanded = new Set(expandedFirms);
    if (newExpanded.has(firmId)) {
      newExpanded.delete(firmId);
    } else {
      newExpanded.add(firmId);
    }
    setExpandedFirms(newExpanded);
  };

  const handleAddContact = (firm) => {
    setSelectedFirm(firm);
    setEditingContact(null);
    resetContactForm();
    setShowContactDialog(true);
  };

  const handleEditContact = (contact, firm) => {
    setSelectedFirm(firm);
    setEditingContact(contact);
    setContactFormData({
      full_name: contact.full_name || '',
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      title: contact.title || '',
      work_email: contact.work_email || '',
      personal_email: contact.personal_email || '',
      primary_phone: contact.primary_phone || '',
      linkedin_url: contact.linkedin_url || '',
      twitter_url: contact.twitter_url || '',
      bio: contact.bio || '',
    });
    setShowContactDialog(true);
  };

  const handleSubmitContact = (e) => {
    e.preventDefault();
    const data = {
      ...contactFormData,
      firm_id: selectedFirm.id,
      firm_name: selectedFirm.company_name,
    };

    if (editingContact) {
      updateContactMutation.mutate({ id: editingContact.id, data });
    } else {
      createContactMutation.mutate(data);
    }
  };

  const removeDuplicateFirms = async () => {
    setDeduplicating(true);
    setDedupeProgress({ current: 0, total: 0, currentBatch: 0, totalBatches: 0 });
    toast.info('Scanning for duplicate firms...');

    try {
      // Group firms by company name
      const firmsByName = {};
      firms.forEach(firm => {
        if (firm.company_name) {
          const key = firm.company_name.toLowerCase().trim();
          if (!firmsByName[key]) {
            firmsByName[key] = [];
          }
          firmsByName[key].push(firm);
        }
      });

      // Find duplicates
      const duplicateGroups = Object.entries(firmsByName).filter(([_, group]) => group.length > 1);

      if (duplicateGroups.length === 0) {
        toast.info('No duplicate firms found');
        setDeduplicating(false);
        return;
      }

      // Split into batches of 10
      const BATCH_SIZE = 10;
      const batches = [];
      for (let i = 0; i < duplicateGroups.length; i += BATCH_SIZE) {
        batches.push(duplicateGroups.slice(i, i + BATCH_SIZE));
      }

      const totalBatches = batches.length;
      toast.success(`Found ${duplicateGroups.length} groups of duplicates in ${totalBatches} batches. Removing...`);
      setDedupeProgress({ current: 0, total: duplicateGroups.length, currentBatch: 0, totalBatches });

      let removed = 0;
      let processedCount = 0;

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        setDedupeProgress({ 
          current: processedCount, 
          total: duplicateGroups.length, 
          currentBatch: batchIndex + 1, 
          totalBatches 
        });

        for (let i = 0; i < batch.length; i++) {
          const [name, group] = batch[i];

        try {
          // Sort by created_date (keep the oldest one)
          const sorted = [...group].sort((a, b) => 
            new Date(a.created_date) - new Date(b.created_date)
          );
          
          const keepFirm = sorted[0];
          const duplicates = sorted.slice(1);

          // Delete duplicates
          for (const dup of duplicates) {
            await base44.entities.InvestorFirm.delete(dup.id);
            removed++;
          }

          // Update contacts that reference deleted firms
          const affectedContacts = contacts.filter(c => 
            duplicates.some(d => d.id === c.firm_id)
          );
          
          for (const contact of affectedContacts) {
            await base44.entities.Contact.update(contact.id, {
              firm_id: keepFirm.id,
              firm_name: keepFirm.company_name
            });
          }
        } catch (error) {
          console.error('Dedupe error for:', name, error);
        }

        processedCount++;
        setDedupeProgress({ 
          current: processedCount, 
          total: duplicateGroups.length, 
          currentBatch: batchIndex + 1, 
          totalBatches 
        });
        }
        }

        queryClient.invalidateQueries(['firms']);
        queryClient.invalidateQueries(['contacts']);
        toast.success(`Removed ${removed} duplicate firms`);
        } catch (error) {
        console.error('Deduplication error:', error);
        toast.error(`Failed to remove duplicates: ${error.message}`);
        } finally {
        setDeduplicating(false);
        setDedupeProgress({ current: 0, total: 0, currentBatch: 0, totalBatches: 0 });
        }
        };

  const matchContactsWithFirms = async () => {
    setImportingContacts(true);
    setContactImportProgress({ current: 0, total: 0, currentBatch: 0, totalBatches: 0 });
    toast.info('AI-powered contact matching starting...');

    try {
      // Get contacts that need firm matching
      const unmatchedContacts = contacts.filter(c => !c.firm_id);

      if (unmatchedContacts.length === 0) {
        toast.info('All contacts are already matched with firms');
        setImportingContacts(false);
        return;
      }

      // Split into batches of 10 for AI processing
      const BATCH_SIZE = 10;
      const batches = [];
      for (let i = 0; i < unmatchedContacts.length; i += BATCH_SIZE) {
        batches.push(unmatchedContacts.slice(i, i + BATCH_SIZE));
      }

      const totalBatches = batches.length;
      setContactImportProgress({ 
        current: 0, 
        total: unmatchedContacts.length, 
        currentBatch: 0, 
        totalBatches 
      });

      toast.success(`Found ${unmatchedContacts.length} unmatched contacts in ${totalBatches} batches. Starting AI matching...`);

      // Build firm lookup structures
      const firmsByName = {};
      const firmsByDomain = {};
      const firmsList = [];
      
      firms.forEach(firm => {
        if (firm.company_name) {
          const key = firm.company_name.toLowerCase().trim();
          firmsByName[key] = firm;
          firmsList.push({
            id: firm.id,
            name: firm.company_name,
            website: firm.website,
            linkedin: firm.linkedin_url
          });
          
          // Extract domain from website
          if (firm.website) {
            try {
              const domain = new URL(firm.website).hostname.replace('www.', '');
              firmsByDomain[domain] = firm;
            } catch (e) {}
          }
        }
      });

      let matched = 0;
      let aiMatched = 0;
      let skipped = 0;
      let processedCount = 0;

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        setContactImportProgress({ 
          current: processedCount, 
          total: unmatchedContacts.length,
          currentBatch: batchIndex + 1,
          totalBatches
        });

        // Process batch in parallel
        const batchPromises = batch.map(async (contact) => {
          try {
            let matchedFirm = null;

            // Strategy 1: Direct name match
            if (contact.firm_name) {
              const firmKey = contact.firm_name.toLowerCase().trim();
              matchedFirm = firmsByName[firmKey];
            }

            // Strategy 2: Email domain match
            if (!matchedFirm && contact.work_email) {
              try {
                const emailDomain = contact.work_email.split('@')[1];
                matchedFirm = firmsByDomain[emailDomain];
              } catch (e) {}
            }

            // Strategy 3: AI-powered fuzzy matching
            if (!matchedFirm && (contact.firm_name || contact.work_email || contact.linkedin_url)) {
              try {
                const aiResult = await base44.integrations.Core.InvokeLLM({
                  prompt: `Match this contact to the correct investor firm using intelligent analysis.

Contact Information:
- Name: ${contact.full_name}
- Firm Name (from contact): ${contact.firm_name || 'Not specified'}
- Work Email: ${contact.work_email || 'Not specified'}
- LinkedIn: ${contact.linkedin_url || 'Not specified'}
- Title: ${contact.title || 'Not specified'}

Available Firms (sample of ${Math.min(firmsList.length, 50)}):
${firmsList.slice(0, 50).map(f => `- ${f.name} (website: ${f.website || 'N/A'})`).join('\n')}

MATCHING INSTRUCTIONS:
1. Match by email domain (e.g., john@acmevc.com → Acme Ventures)
2. Match by firm name variations (e.g., "Acme VC" = "Acme Ventures" = "Acme Capital")
3. Use LinkedIn company info if available
4. Consider common abbreviations (VC, LP, Capital, Ventures, Partners)
5. Return null if no confident match (>70% confidence)

Provide the EXACT firm name from the list above that matches, or null if no good match.`,
                  response_json_schema: {
                    type: 'object',
                    properties: {
                      matched_firm_name: { type: 'string' },
                      confidence: { type: 'number' },
                      reasoning: { type: 'string' }
                    }
                  }
                });

                if (aiResult.matched_firm_name && aiResult.confidence >= 70) {
                  const firmKey = aiResult.matched_firm_name.toLowerCase().trim();
                  matchedFirm = firmsByName[firmKey];
                  
                  if (matchedFirm) {
                    return { 
                      success: true, 
                      aiMatch: true, 
                      confidence: aiResult.confidence,
                      reasoning: aiResult.reasoning,
                      contact,
                      firm: matchedFirm
                    };
                  }
                }
              } catch (error) {
                console.error('AI matching error for:', contact.full_name, error);
              }
            }

            // Update if match found
            if (matchedFirm) {
              await base44.entities.Contact.update(contact.id, {
                firm_id: matchedFirm.id,
                firm_name: matchedFirm.company_name
              });
              return { success: true, aiMatch: false, contact, firm: matchedFirm };
            }

            return { success: false };
          } catch (error) {
            console.error('Contact matching error:', contact.full_name, error);
            return { success: false };
          }
        });

        const results = await Promise.all(batchPromises);
        
        results.forEach(result => {
          if (result.success) {
            matched++;
            if (result.aiMatch) {
              aiMatched++;
            }
          } else {
            skipped++;
          }
        });

        processedCount += batch.length;
        setContactImportProgress({ 
          current: processedCount, 
          total: unmatchedContacts.length,
          currentBatch: batchIndex + 1,
          totalBatches
        });
      }

      queryClient.invalidateQueries(['contacts']);
      toast.success(`Matching complete! ${matched} matched (${aiMatched} by AI), ${skipped} skipped.`);
    } catch (error) {
      console.error('Contact matching error:', error);
      toast.error(`Failed to match contacts: ${error.message}`);
    } finally {
      setImportingContacts(false);
      setContactImportProgress({ current: 0, total: 0, currentBatch: 0, totalBatches: 0 });
    }
  };

  const handleEdit = (firm) => {
    setEditingFirm(firm);
    setFormData({
      company_name: firm.company_name || '',
      parent_company: firm.parent_company || '',
      website: firm.website || '',
      linkedin_url: firm.linkedin_url || '',
      firm_type: firm.firm_type || '',
      investment_focus: firm.investment_focus || [],
      investment_stages: firm.investment_stages || [],
      geographic_focus: firm.geographic_focus || [],
      check_size_min: firm.check_size_min || '',
      check_size_max: firm.check_size_max || '',
      notes: firm.notes || '',
      current_fund_name: firm.current_fund_name || '',
      current_fund_target: firm.current_fund_target || '',
      current_fund_raised: firm.current_fund_raised || '',
      fund_close_date: firm.fund_close_date || '',
      fund_status: firm.fund_status || '',
    });
    setShowDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...formData,
      check_size_min: formData.check_size_min ? Number(formData.check_size_min) : undefined,
      check_size_max: formData.check_size_max ? Number(formData.check_size_max) : undefined,
      current_fund_target: formData.current_fund_target ? Number(formData.current_fund_target) : undefined,
      current_fund_raised: formData.current_fund_raised ? Number(formData.current_fund_raised) : undefined,
    };

    if (editingFirm) {
      updateMutation.mutate({ id: editingFirm.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const filteredFirms = firms.filter(firm => {
    if (typeFilter !== 'all' && firm.firm_type !== typeFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!firm.company_name?.toLowerCase().includes(query) &&
          !firm.investment_focus?.some(f => f.toLowerCase().includes(query))) {
        return false;
      }
    }
    return true;
  });

  const sortedFirms = [...filteredFirms].sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];
    
    if (Array.isArray(aVal)) aVal = aVal.join(', ');
    if (Array.isArray(bVal)) bVal = bVal.join(', ');
    
    if (aVal == null) aVal = '';
    if (bVal == null) bVal = '';
    
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
    
    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    }
  });

  const toggleArrayField = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(v => v !== value)
        : [...prev[field], value]
    }));
  };

  const enrichAllInvestors = async () => {
    setShowEnrichmentDialog(false);
    setEnriching(true);
    
    const firmsToEnrich = filteredFirms
      .filter(f => 
        !f.last_enriched || 
        new Date(f.last_enriched) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      )
      .slice(0, enrichmentLimit);
    
    // Split into batches of 5
    const BATCH_SIZE = 5;
    const batches = [];
    for (let i = 0; i < firmsToEnrich.length; i += BATCH_SIZE) {
      batches.push(firmsToEnrich.slice(i, i + BATCH_SIZE));
    }

    const totalBatches = batches.length;
    setEnrichmentProgress({ 
      current: 0, 
      total: firmsToEnrich.length, 
      currentFirm: '', 
      currentBatch: 0, 
      totalBatches 
    });
    toast.info(`Starting deep research on ${firmsToEnrich.length} investors in ${totalBatches} batches...`);

    let processedCount = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      setEnrichmentProgress({ 
        current: processedCount, 
        total: firmsToEnrich.length, 
        currentFirm: `Batch ${batchIndex + 1}/${totalBatches}`, 
        currentBatch: batchIndex + 1, 
        totalBatches 
      });

      // Process batch in parallel
      const batchPromises = batch.map(async (firm) => {
        try {
          // Step 1: Try Coresignal API first for factual data (with timeout)
          let coresignalData = {};
          try {
            const csPromise = base44.functions.invoke('coresignalEnrich', {
              firmId: firm.id,
              firmData: {
                company_name: firm.company_name,
                website: firm.website,
                linkedin_url: firm.linkedin_url
              }
            });

            // Timeout after 10 seconds
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Coresignal timeout')), 10000)
            );

            const csResponse = await Promise.race([csPromise, timeoutPromise]);

            if (csResponse?.data?.success && csResponse.data.enrichedData) {
              coresignalData = csResponse.data.enrichedData;
            }
          } catch (csError) {
            // Silently skip Coresignal if it fails, continue with AI
            console.log('Coresignal skipped:', csError.message);
          }

          // Step 2: Identify remaining empty fields after Coresignal
          const emptyFields = [];
          if (!firm.firm_type && !coresignalData.firm_type) emptyFields.push('firm_type');
          if (!firm.investment_focus?.length && !coresignalData.investment_focus?.length) emptyFields.push('investment_focus');
          if (!firm.investment_stages?.length && !coresignalData.investment_stages?.length) emptyFields.push('investment_stages');
          if (!firm.preferred_geography?.length && !coresignalData.preferred_geography?.length) emptyFields.push('preferred_geography');
          if (!firm.check_size_min && !coresignalData.check_size_min) emptyFields.push('check_size_min');
          if (!firm.check_size_max && !coresignalData.check_size_max) emptyFields.push('check_size_max');
          if (!firm.investment_thesis && !coresignalData.investment_thesis) emptyFields.push('investment_thesis');
          if (!firm.firm_description && !coresignalData.firm_description) emptyFields.push('firm_description');
          if (!firm.tags?.length && !coresignalData.tags?.length) emptyFields.push('tags');

          // Step 3: Use AI for strategic insights and missing fields
          const enrichmentData = await base44.integrations.Core.InvokeLLM({
          prompt: `Deep web research on this investor. Use web scraping, news, social media, and all available sources.

Investor: ${firm.company_name}
Website: ${firm.website || 'Unknown'}
LinkedIn: ${firm.linkedin_url || 'Unknown'}
Current Type: ${firm.firm_type || 'Unknown'}

EMPTY FIELDS TO FILL: ${emptyFields.join(', ')}

COMPREHENSIVE RESEARCH TASKS:
1. **FUND TYPE IDENTIFICATION** - CRITICAL: Determine exact fund type from: Venture Capital, Corporate Venture Capital, Family Office, Angel Investor, Angel Group/Network, Bank, Pension Fund, Asset Manager, Wealth Manager, Fund of Funds, Accelerator/Incubator, Private Equity, Hedge Fund, Government/Sovereign Fund, University Endowment, Insurance Company, Investment Bank, Micro VC, Growth Equity, Impact/ESG Fund, Syndicate, Other
2. Investment Focus & Sectors - exact sub-sectors they invest in (e.g., "B2B SaaS", "AI Infrastructure", not generic "Technology")
3. Geographic Focus - specific countries, regions, cities where they invest
4. Investment Stages - Pre-seed, Seed, Series A, B, C, Growth
5. Check Size Range - minimum and maximum investment amounts in USD
6. Portfolio Companies - list notable investments (last 2-3 years preferred)
7. Recent Investments - deals from past 12 months with amounts if available
8. Key People - partners, principals, investment team members with their focus areas
9. Investment Thesis - their stated investment strategy and criteria
10. AUM/Fund Size - total assets under management if available
11. Total Investments & Exits - historical data
12. Office Locations - physical addresses
13. Contact Information - general email domain, phone numbers
14. Recent News - funding announcements, new funds, team changes
15. Social Media - Twitter, Medium, blog presence for thought leadership
16. **Tags** - Generate 3-5 relevant tags like "Enterprise SaaS", "Climate Tech", "Pre-seed Focus", "Bay Area", etc.

PRIORITY: Fill in all empty fields first, then enhance existing data.
Use web scraping, news APIs, Crunchbase-style data, LinkedIn, Twitter, company websites, press releases.
Be SPECIFIC and DATA-DRIVEN. Provide actual numbers, names, and recent information.`,
          add_context_from_internet: true,
          response_json_schema: {
            type: 'object',
            properties: {
              firm_type: { type: 'string' },
              investment_focus: { type: 'array', items: { type: 'string' } },
              investing_sectors: { type: 'array', items: { type: 'string' } },
              investment_stages: { type: 'array', items: { type: 'string' } },
              preferred_geography: { type: 'array', items: { type: 'string' } },
              check_size_min: { type: 'number' },
              check_size_max: { type: 'number' },
              portfolio_companies: { type: 'array', items: { type: 'string' } },
              recent_investments: { type: 'array', items: { type: 'string' } },
              key_people: { type: 'array', items: { type: 'string' } },
              investment_thesis: { type: 'string' },
              aum: { type: 'number' },
              total_investments: { type: 'number' },
              total_exits: { type: 'number' },
              firm_description: { type: 'string' },
              city: { type: 'string' },
              country: { type: 'string' },
              street_address: { type: 'string' },
              recent_news: { type: 'array', items: { type: 'string' } },
              tags: { type: 'array', items: { type: 'string' } },
              social_media: {
                type: 'object',
                properties: {
                  twitter: { type: 'string' },
                  blog: { type: 'string' }
                }
              },
              data_confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
            }
          }
        });

        // Merge Coresignal data and AI data, prioritizing non-empty values
        const updateData = { ...coresignalData };
        Object.keys(enrichmentData).forEach(key => {
          if (enrichmentData[key] && (
            !firm[key] || 
            (Array.isArray(firm[key]) && firm[key].length === 0) ||
            key === 'tags' ||
            key === 'data_confidence'
          )) {
            updateData[key] = enrichmentData[key];
          }
        });

          await base44.entities.InvestorFirm.update(firm.id, {
            ...updateData,
            enrichment_status: 'enriched',
            last_enriched: new Date().toISOString(),
            data_completion_score: enrichmentData.data_confidence === 'high' ? 90 : 
                                    enrichmentData.data_confidence === 'medium' ? 60 : 30
          });
        } catch (error) {
          console.error('Enrichment error:', firm.company_name, error);
          await base44.entities.InvestorFirm.update(firm.id, {
            enrichment_status: 'failed',
            last_enriched: new Date().toISOString()
          });
        }
      });

      await Promise.all(batchPromises);
      processedCount += batch.length;
      setEnrichmentProgress({ 
        current: processedCount, 
        total: firmsToEnrich.length, 
        currentFirm: `Batch ${batchIndex + 1}/${totalBatches}`, 
        currentBatch: batchIndex + 1, 
        totalBatches 
      });
    }

    setEnriching(false);
    setEnrichmentProgress({ current: 0, total: 0, currentFirm: '', currentBatch: 0, totalBatches: 0 });
    queryClient.invalidateQueries(['firms']);
    toast.success(`Successfully enriched ${firmsToEnrich.length} investor profiles!`);
  };

  if (isLoading) {
    return (
      <div className="relative min-h-[55vh]">
        <PageBackground />
        <div className="flex h-[55vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading investors…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <PageBackground />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Pill>Investor Database</Pill>
            <h1 className="mt-3 text-4xl font-bold text-slate-900">
              Investor <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">Firms</span>
            </h1>
            <p className="mt-2 text-slate-600">
              {firms.length.toLocaleString()} total investors • {filteredFirms.length.toLocaleString()} shown
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <SecondaryButton onClick={() => setShowTaggingDialog(true)}>
              <Tags className="w-4 h-4 mr-2" />
              AI Auto-Tag
            </SecondaryButton>
            <SecondaryButton
              onClick={() => setShowEnrichmentDialog(true)}
              disabled={enriching}
            >
              {enriching ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Brain className="w-4 h-4 mr-2" />
              )}
              Deep Research
            </SecondaryButton>
            <SecondaryButton
              onClick={matchContactsWithFirms}
              disabled={importingContacts}
            >
              {importingContacts ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Users className="w-4 h-4 mr-2" />
              )}
              Match Contacts
            </SecondaryButton>
            <SecondaryButton
              onClick={removeDuplicateFirms}
              disabled={deduplicating}
            >
              {deduplicating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Remove Duplicates
            </SecondaryButton>
            <FieldVisibilityManager 
              visibleFields={visibleFields}
              onFieldsChange={setVisibleFields}
            />
            <RainbowCTA onClick={() => { resetForm(); setShowDialog(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Add Investor
            </RainbowCTA>
          </div>
        </div>

        {/* AI Enrichment Progress */}
        {enriching && (
          <GlassSurface className="border-2 border-indigo-200/60">
            <UnderGlow className="opacity-20 bg-gradient-to-r from-indigo-400 via-purple-400 to-violet-400" />
            <div className="relative p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl shadow-lg">
                    <Brain className="w-5 h-5 text-white animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">AI Deep Research in Progress</h3>
                    <p className="text-sm text-slate-600">
                      Processing batch {enrichmentProgress.currentBatch} of {enrichmentProgress.totalBatches}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800">
                    {enrichmentProgress.current} / {enrichmentProgress.total}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Batch {enrichmentProgress.currentBatch}/{enrichmentProgress.totalBatches}
                  </Badge>
                </div>
              </div>
              <Progress 
                value={(enrichmentProgress.current / enrichmentProgress.total) * 100} 
                className="h-2"
              />
              <p className="text-xs text-slate-500 mt-2">
                Processing in batches of 5 for optimal performance...
              </p>
            </div>
          </GlassSurface>
        )}

        {/* Deduplication Progress */}
        {deduplicating && (
          <GlassSurface className="border-2 border-red-200/60">
            <UnderGlow className="opacity-20 bg-gradient-to-r from-red-400 via-orange-400 to-pink-400" />
            <div className="relative p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-red-600 to-orange-600 rounded-2xl shadow-lg">
                    <Trash2 className="w-5 h-5 text-white animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Removing Duplicate Firms</h3>
                    <p className="text-sm text-slate-600">
                      Processing batch {dedupeProgress.currentBatch} of {dedupeProgress.totalBatches}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800">
                    {dedupeProgress.current} / {dedupeProgress.total}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Batch {dedupeProgress.currentBatch}/{dedupeProgress.totalBatches}
                  </Badge>
                </div>
              </div>
              <Progress 
                value={(dedupeProgress.current / dedupeProgress.total) * 100} 
                className="h-2"
              />
              <p className="text-xs text-slate-500 mt-2">
                Processing in batches of 10 for optimal performance...
              </p>
            </div>
          </GlassSurface>
        )}

        {/* Contact Matching Progress */}
        {importingContacts && (
          <GlassSurface className="border-2 border-emerald-200/60">
            <UnderGlow className="opacity-20 bg-gradient-to-r from-emerald-400 via-teal-400 to-green-400" />
            <div className="relative p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-2xl shadow-lg">
                    <Users className="w-5 h-5 text-white animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Matching Contacts with Firms</h3>
                    <p className="text-sm text-slate-600">
                      Processing batch {contactImportProgress.currentBatch} of {contactImportProgress.totalBatches}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800">
                    {contactImportProgress.current} / {contactImportProgress.total}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Batch {contactImportProgress.currentBatch}/{contactImportProgress.totalBatches}
                  </Badge>
                </div>
              </div>
              <Progress 
                value={(contactImportProgress.current / contactImportProgress.total) * 100} 
                className="h-2"
              />
              <p className="text-xs text-slate-500 mt-2">
                Processing in batches of 50 contacts for optimal performance...
              </p>
            </div>
          </GlassSurface>
        )}

        {/* AI Auto-Tagger Dialog */}
        <Dialog open={showTaggingDialog} onOpenChange={setShowTaggingDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>AI Auto-Tag Investors</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Automatically generate relevant tags for your investor firms based on their focus areas, stages, and characteristics.
              </p>
              <div className="space-y-2">
                <Label>Number of firms to tag</Label>
                <Input
                  type="number"
                  value={taggingLimit}
                  onChange={(e) => setTaggingLimit(Number(e.target.value))}
                  min={1}
                  max={10000}
                />
                <p className="text-xs text-slate-500">
                  Process up to {taggingLimit} firms (from filtered results)
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowTaggingDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => {
                    setShowTaggingDialog(false);
                    setShowTagger(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  <Tags className="w-4 h-4 mr-2" />
                  Start Tagging
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* AI Auto-Tagger */}
        {showTagger && (
          <InvestorAutoTagger 
            firms={filteredFirms.slice(0, taggingLimit)} 
            onTagsUpdated={() => {
              queryClient.invalidateQueries(['firms']);
              setShowTagger(false);
            }}
          />
        )}

        {/* Deep Research Dialog */}
        <Dialog open={showEnrichmentDialog} onOpenChange={setShowEnrichmentDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Deep AI Research</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Perform comprehensive web research to enrich investor profiles with detailed information including fund type, investment focus, check sizes, and more.
              </p>
              <div className="space-y-2">
                <Label>Number of firms to research</Label>
                <Input
                  type="number"
                  value={enrichmentLimit}
                  onChange={(e) => setEnrichmentLimit(Number(e.target.value))}
                  min={1}
                  max={10000}
                />
                <p className="text-xs text-slate-500">
                  Process up to {enrichmentLimit} firms (prioritizes those not enriched in last 30 days)
                </p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800">
                  ⚠️ This process uses AI and may take several minutes. Each firm requires ~10-20 seconds.
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowEnrichmentDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={enrichAllInvestors}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  <Brain className="w-4 h-4 mr-2" />
                  Start Research
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Filters and Sorting */}
        <GlassSurface>
          <UnderGlow className="opacity-25" />
          <div className="relative p-5 md:p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <GlassInput
                  placeholder="Search by name or focus..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <GlassSelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by type" />
                </GlassSelectTrigger>
                <SelectContent className="rounded-2xl border-2 border-white/60 bg-white/70 backdrop-blur-2xl shadow-xl">
                  <SelectItem value="all">All Types</SelectItem>
                  {firmTypes.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <GlassSelectTrigger className="w-48">
                  <SelectValue placeholder="Sort by" />
                </GlassSelectTrigger>
                <SelectContent className="rounded-2xl border-2 border-white/60 bg-white/70 backdrop-blur-2xl shadow-xl">
                  <SelectItem value="company_name">Company Name</SelectItem>
                  <SelectItem value="firm_type">Firm Type</SelectItem>
                  <SelectItem value="created_date">Date Added</SelectItem>
                  <SelectItem value="last_enriched">Last Updated</SelectItem>
                  <SelectItem value="data_completion_score">Completion Score</SelectItem>
                </SelectContent>
              </Select>
              <SecondaryButton
                size="icon"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                <Filter className={cn("w-4 h-4", sortOrder === 'desc' && "rotate-180")} />
              </SecondaryButton>
            </div>
          </div>
        </GlassSurface>

        {/* Table */}
        <GlassSurface>
          <UnderGlow className="opacity-25" />
          <div className="relative overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-white/60">
                  {visibleFields.map((field) => (
                    <TableHead key={field} className="text-slate-700 font-semibold">
                      {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </TableHead>
                  ))}
                  <TableHead className="text-right text-slate-700 font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedFirms.map((firm) => {
                  const renderField = (field) => {
                    const value = firm[field];
                    
                    if (field === 'company_name') {
                      return (
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-100/80 to-blue-100/80 border-2 border-white/60 flex items-center justify-center shadow-lg">
                            <Building2 className="w-5 h-5 text-purple-600" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{value}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {firm.website && (
                                <a 
                                  href={firm.website} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                                >
                                  <Globe className="w-3 h-3" />
                                  Website
                                </a>
                              )}
                              {firm.tags?.length > 0 && (
                                  <div className="flex gap-1">
                                    {firm.tags.slice(0, 3).map((tag, i) => (
                                      <Badge key={i} variant="secondary" className="text-xs">
                                        {tag}
                                      </Badge>
                                    ))}
                                    {firm.tags.length > 3 && (
                                      <Badge variant="secondary" className="text-xs">
                                        +{firm.tags.length - 3}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    
                    if (!value || (Array.isArray(value) && value.length === 0)) return <span className="text-slate-400">—</span>;
                    
                    if (field === 'firm_type') {
                      return <Badge variant="secondary">{value}</Badge>;
                    }
                    
                    if (Array.isArray(value)) {
                      return (
                        <div className="flex flex-wrap gap-1">
                          {value.slice(0, 2).map((v, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {typeof v === 'string' ? v : JSON.stringify(v)}
                            </Badge>
                          ))}
                          {value.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{value.length - 2}
                            </Badge>
                          )}
                        </div>
                      );
                    }
                    
                    if (typeof value === 'number') {
                      if (field.includes('aum') || field.includes('check_size') || field.includes('funding')) {
                        return `$${(value / 1000000).toFixed(1)}M`;
                      }
                      return value.toLocaleString();
                    }
                    
                    if (field.includes('date') || field.includes('_at')) {
                      return new Date(value).toLocaleDateString();
                    }
                    
                    if (typeof value === 'boolean') {
                      return value ? '✓' : '✗';
                    }
                    
                    if (typeof value === 'object') {
                      return <span className="text-xs text-slate-500">{JSON.stringify(value).substring(0, 30)}...</span>;
                    }
                    
                    if (field === 'enrichment_status') {
                      return (
                        <div className="flex items-center gap-2">
                          {value === 'enriched' ? (
                            <Badge className="bg-emerald-100 text-emerald-700">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Enriched
                            </Badge>
                          ) : value === 'failed' ? (
                            <Badge className="bg-red-100 text-red-700">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Failed
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                          {firm.last_enriched && (
                            <span className="text-xs text-slate-500">
                              {new Date(firm.last_enriched).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      );
                    }

                    return <span className="text-sm text-slate-600">{String(value)}</span>;
                    };

                    const firmContactList = contacts.filter(c => c.firm_id === firm.id);
                  const isExpanded = expandedFirms.has(firm.id);
                  
                  const rows = [
                    <TableRow key={`firm-${firm.id}`} className="group hover:bg-white/40 border-b border-white/40">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => toggleFirmExpansion(firm.id)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </Button>
                          {renderField('company_name')}
                        </div>
                      </TableCell>
                      {visibleFields.slice(1).map((field) => (
                        <TableCell key={field}>
                          {renderField(field)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleAddContact(firm)}
                            title="Add contact"
                          >
                            <UserPlus className="w-4 h-4 text-emerald-600" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(firm)}>
                                <Edit className="w-4 h-4 mr-2" />
                                Edit Firm
                              </DropdownMenuItem>
                              {firm.linkedin_url && (
                                <DropdownMenuItem asChild>
                                  <a href={firm.linkedin_url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    LinkedIn
                                  </a>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem 
                                onClick={() => deleteMutation.mutate(firm.id)}
                                className="text-red-600"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ];
                  
                  if (isExpanded) {
                    rows.push(
                      <TableRow key={`expanded-${firm.id}`}>
                        <TableCell colSpan={visibleFields.length + 1} className="bg-white/30 p-0 border-b border-white/40">
                          <div className="p-4 space-y-4">
                            {/* Tags Section */}
                            {firm.tags?.length > 0 && (
                              <div className="bg-white/60 rounded-lg border-2 border-white/60 p-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <Tags className="w-4 h-4 text-purple-600" />
                                  <h4 className="font-semibold text-sm text-slate-700">Tags & Categories</h4>
                                  <Badge variant="outline" className="text-xs">{firm.tags.length} tags</Badge>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {firm.tags.map((tag, i) => {
                                    // Categorize tags by keywords for color coding
                                    const tagLower = tag.toLowerCase();
                                    let badgeClass = "bg-slate-100 text-slate-800";
                                    
                                    // Type tags (VC, Family Office, etc)
                                    if (tagLower.includes('vc') || tagLower.includes('venture') || tagLower.includes('family office') || 
                                        tagLower.includes('angel') || tagLower.includes('private equity')) {
                                      badgeClass = "bg-indigo-100 text-indigo-800";
                                    }
                                    // Focus/Sector tags
                                    else if (tagLower.includes('saas') || tagLower.includes('fintech') || tagLower.includes('ai') || 
                                             tagLower.includes('climate') || tagLower.includes('health') || tagLower.includes('tech') ||
                                             tagLower.includes('b2b') || tagLower.includes('enterprise')) {
                                      badgeClass = "bg-emerald-100 text-emerald-800";
                                    }
                                    // Stage tags
                                    else if (tagLower.includes('seed') || tagLower.includes('series') || tagLower.includes('stage') ||
                                             tagLower.includes('pre-product') || tagLower.includes('revenue') || tagLower.includes('growth')) {
                                      badgeClass = "bg-blue-100 text-blue-800";
                                    }
                                    // Geographic tags
                                    else if (tagLower.includes('us') || tagLower.includes('global') || tagLower.includes('europe') ||
                                             tagLower.includes('asia') || tagLower.includes('focused') && (tagLower.includes('region') || tagLower.includes('area'))) {
                                      badgeClass = "bg-amber-100 text-amber-800";
                                    }
                                    // Specialty/Deal tags
                                    else if (tagLower.includes('founder') || tagLower.includes('operator') || tagLower.includes('hands-on') ||
                                             tagLower.includes('lead') || tagLower.includes('check') || tagLower.includes('syndicate')) {
                                      badgeClass = "bg-purple-100 text-purple-800";
                                    }
                                    
                                    return (
                                      <Badge key={i} className={`${badgeClass} text-xs`}>
                                        {tag}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Fundraising Status Section */}
                            {(firm.current_fund_name || firm.fund_status) && (
                              <div className="bg-white/60 rounded-lg border-2 border-white/60 p-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                                  <h4 className="font-semibold text-sm text-slate-700">Fundraising Status</h4>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                  {firm.current_fund_name && (
                                    <div>
                                      <p className="text-xs text-slate-500 mb-1">Current Fund</p>
                                      <p className="font-medium text-slate-900">{firm.current_fund_name}</p>
                                    </div>
                                  )}
                                  {firm.fund_status && (
                                    <div>
                                      <p className="text-xs text-slate-500 mb-1">Status</p>
                                      <Badge className={cn(
                                        firm.fund_status === 'Fundraising' && "bg-blue-100 text-blue-800",
                                        firm.fund_status === 'First Close' && "bg-green-100 text-green-800",
                                        firm.fund_status === 'Final Close' && "bg-indigo-100 text-indigo-800",
                                        firm.fund_status === 'Closed' && "bg-slate-100 text-slate-800",
                                        firm.fund_status === 'Deployed' && "bg-purple-100 text-purple-800"
                                      )}>
                                        {firm.fund_status}
                                      </Badge>
                                    </div>
                                  )}
                                  {firm.fund_close_date && (
                                    <div>
                                      <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        Target Close Date
                                      </p>
                                      <p className="font-medium text-slate-900">
                                        {new Date(firm.fund_close_date).toLocaleDateString()}
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {firm.current_fund_target && (
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <Target className="w-4 h-4 text-slate-500" />
                                        <span className="text-xs text-slate-600">Progress</span>
                                      </div>
                                      <div className="text-sm font-medium text-slate-900">
                                        ${((firm.current_fund_raised || 0) / 1000000).toFixed(1)}M / ${(firm.current_fund_target / 1000000).toFixed(1)}M
                                      </div>
                                    </div>
                                    <Progress 
                                      value={((firm.current_fund_raised || 0) / firm.current_fund_target) * 100} 
                                      className="h-2"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">
                                      {(((firm.current_fund_raised || 0) / firm.current_fund_target) * 100).toFixed(0)}% raised
                                    </p>
                                  </div>
                                )}

                                {firm.recent_fund_activity?.length > 0 && (
                                  <div className="mt-4 pt-4 border-t border-white/60">
                                    <p className="text-xs text-slate-500 mb-2">Recent Activity</p>
                                    <div className="space-y-2">
                                      {firm.recent_fund_activity.slice(0, 3).map((activity, i) => (
                                        <div key={i} className="flex items-start gap-2 text-xs">
                                          <span className="text-slate-400">
                                            {new Date(activity.date).toLocaleDateString()}
                                          </span>
                                          <span className="text-slate-700">{activity.activity}</span>
                                          {activity.amount && (
                                            <span className="font-medium text-slate-900 ml-auto">
                                              ${(activity.amount / 1000000).toFixed(1)}M
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Deal History & AI Analysis */}
                            <div>
                              <FirmDealHistory 
                                firm={firm}
                                deals={deals}
                                contacts={contacts}
                              />
                            </div>

                            {/* Due Diligence Analysis */}
                            <div>
                              <InvestorDueDiligence 
                                firm={firm}
                                startupIndustries={[]}
                              />
                            </div>

                            {/* Key Partners Extraction */}
                            <div>
                              <FirmKeyPartnersExtractor 
                                firm={firm}
                                existingContacts={firmContactList}
                              />
                            </div>

                            {/* Investment Activity & News Tracking */}
                            <div>
                              <FirmActivityTracker firm={firm} />
                            </div>

                            {/* Quick Deals Section */}
                            {dealCountByFirm[firm.id] > 0 && false && (
                              <div className="bg-white/60 rounded-lg border-2 border-white/60 p-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <Briefcase className="w-4 h-4 text-emerald-600" />
                                  <h4 className="font-semibold text-sm text-slate-700">Deal Flow</h4>
                                  <Badge variant="outline" className="text-xs">{dealCountByFirm[firm.id]} deals</Badge>
                                </div>
                                <div className="space-y-2">
                                  {deals.filter(d => d.firm_id === firm.id).slice(0, 3).map((deal) => (
                                    <div key={deal.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                                      <div className="flex-1">
                                        <p className="text-sm font-medium text-slate-900">{deal.deal_name}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                          <Badge className={cn("text-xs", 
                                            deal.deal_stage === 'Closed' && "bg-green-100 text-green-800",
                                            deal.deal_stage === 'Term Sheet' && "bg-purple-100 text-purple-800",
                                            deal.deal_stage === 'Due Diligence' && "bg-amber-100 text-amber-800"
                                          )}>
                                            {deal.deal_stage}
                                          </Badge>
                                          {deal.expected_amount && (
                                            <span className="text-xs text-slate-600">
                                              ${(deal.expected_amount / 1000000).toFixed(1)}M
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Contacts Section */}
                            <div>
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
                                  <Users className="w-4 h-4" />
                                  Contacts ({firmContactList.length})
                                </h4>
                                <SecondaryButton
                                  size="sm"
                                  onClick={() => handleAddContact(firm)}
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  Add Contact
                                </SecondaryButton>
                              </div>
                              
                              {firmContactList.length === 0 ? (
                                <p className="text-sm text-slate-500 text-center py-4">
                                  No contacts yet. Add a contact to get started.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {firmContactList.map((contact) => (
                                    <div key={contact.id} className="bg-white/60 rounded-lg border-2 border-white/60 p-3 hover:bg-white/80 transition-colors">
                                      <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1">
                                          <p className="font-medium text-slate-900">{contact.full_name}</p>
                                          {contact.title && (
                                            <p className="text-xs text-slate-500">{contact.title}</p>
                                          )}
                                        </div>
                                        <div className="flex gap-1">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => handleEditContact(contact, firm)}
                                          >
                                            <Edit className="w-3 h-3" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => deleteContactMutation.mutate(contact.id)}
                                          >
                                            <Trash2 className="w-3 h-3 text-red-600" />
                                          </Button>
                                        </div>
                                      </div>
                                      
                                      <div className="space-y-1">
                                        {contact.work_email && (
                                          <a
                                            href={`mailto:${contact.work_email}`}
                                            className="flex items-center gap-2 text-xs text-indigo-600 hover:underline"
                                          >
                                            <Mail className="w-3 h-3" />
                                            {contact.work_email}
                                          </a>
                                        )}
                                        {contact.primary_phone && (
                                          <div className="flex items-center gap-2 text-xs text-slate-600">
                                            <Phone className="w-3 h-3" />
                                            {contact.primary_phone}
                                          </div>
                                        )}
                                        {contact.linkedin_url && (
                                          <a
                                            href={contact.linkedin_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 text-xs text-slate-600 hover:text-indigo-600"
                                          >
                                            <LinkedinIcon className="w-3 h-3" />
                                            LinkedIn
                                          </a>
                                        )}
                                      </div>
                                      
                                      {contact.folk_id && (
                                        <Badge variant="outline" className="text-xs mt-2">
                                          Synced with Folk
                                        </Badge>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  
                  return rows;
                }).flat()}
              </TableBody>
            </Table>
          </div>
        </GlassSurface>

        {/* Add/Edit Dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingFirm ? 'Edit Investor' : 'Add Investor'}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Company Name *</Label>
                  <Input
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Firm Type</Label>
                  <Select
                    value={formData.firm_type}
                    onValueChange={(value) => setFormData({ ...formData, firm_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {firmTypes.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>LinkedIn URL</Label>
                  <Input
                    value={formData.linkedin_url}
                    onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                    placeholder="https://linkedin.com/company/..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Investment Stages</Label>
                <div className="flex flex-wrap gap-2">
                  {stages.map((stage) => (
                    <Badge
                      key={stage}
                      variant={formData.investment_stages.includes(stage) ? 'default' : 'outline'}
                      className={cn(
                        "cursor-pointer transition-colors",
                        formData.investment_stages.includes(stage) && "bg-indigo-600"
                      )}
                      onClick={() => toggleArrayField('investment_stages', stage)}
                    >
                      {stage}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Min Check Size ($)</Label>
                  <Input
                    type="number"
                    value={formData.check_size_min}
                    onChange={(e) => setFormData({ ...formData, check_size_min: e.target.value })}
                    placeholder="100000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Check Size ($)</Label>
                  <Input
                    type="number"
                    value={formData.check_size_max}
                    onChange={(e) => setFormData({ ...formData, check_size_max: e.target.value })}
                    placeholder="5000000"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>

              {/* Fundraising Status Section */}
              <div className="pt-4 border-t space-y-4">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                  Fundraising Status
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Current Fund Name</Label>
                    <Input
                      value={formData.current_fund_name}
                      onChange={(e) => setFormData({ ...formData, current_fund_name: e.target.value })}
                      placeholder="Fund III, 2025 Fund, etc."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fund Status</Label>
                    <Select
                      value={formData.fund_status}
                      onValueChange={(value) => setFormData({ ...formData, fund_status: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Fundraising">Fundraising</SelectItem>
                        <SelectItem value="First Close">First Close</SelectItem>
                        <SelectItem value="Final Close">Final Close</SelectItem>
                        <SelectItem value="Closed">Closed</SelectItem>
                        <SelectItem value="Deployed">Deployed</SelectItem>
                        <SelectItem value="Not Raising">Not Raising</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Target Fund Size ($)</Label>
                    <Input
                      type="number"
                      value={formData.current_fund_target}
                      onChange={(e) => setFormData({ ...formData, current_fund_target: e.target.value })}
                      placeholder="50000000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Amount Raised ($)</Label>
                    <Input
                      type="number"
                      value={formData.current_fund_raised}
                      onChange={(e) => setFormData({ ...formData, current_fund_raised: e.target.value })}
                      placeholder="25000000"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Expected Close Date</Label>
                  <Input
                    type="date"
                    value={formData.fund_close_date}
                    onChange={(e) => setFormData({ ...formData, fund_close_date: e.target.value })}
                  />
                </div>

                {formData.current_fund_target && formData.current_fund_raised && (
                  <div className="bg-slate-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-600">Progress</span>
                      <span className="text-sm font-medium text-slate-900">
                        {((Number(formData.current_fund_raised) / Number(formData.current_fund_target)) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <Progress 
                      value={(Number(formData.current_fund_raised) / Number(formData.current_fund_target)) * 100} 
                      className="h-2"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="bg-indigo-600 hover:bg-indigo-700"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {editingFirm ? 'Save Changes' : 'Add Investor'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Contact Add/Edit Dialog */}
        <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingContact ? 'Edit Contact' : 'Add Contact'} - {selectedFirm?.company_name}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmitContact} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input
                    value={contactFormData.full_name}
                    onChange={(e) => setContactFormData({ ...contactFormData, full_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={contactFormData.title}
                    onChange={(e) => setContactFormData({ ...contactFormData, title: e.target.value })}
                    placeholder="Partner, Managing Director, etc."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input
                    value={contactFormData.first_name}
                    onChange={(e) => setContactFormData({ ...contactFormData, first_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input
                    value={contactFormData.last_name}
                    onChange={(e) => setContactFormData({ ...contactFormData, last_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Work Email</Label>
                  <Input
                    type="email"
                    value={contactFormData.work_email}
                    onChange={(e) => setContactFormData({ ...contactFormData, work_email: e.target.value })}
                    placeholder="contact@firm.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Personal Email</Label>
                  <Input
                    type="email"
                    value={contactFormData.personal_email}
                    onChange={(e) => setContactFormData({ ...contactFormData, personal_email: e.target.value })}
                    placeholder="contact@personal.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    type="tel"
                    value={contactFormData.primary_phone}
                    onChange={(e) => setContactFormData({ ...contactFormData, primary_phone: e.target.value })}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label>LinkedIn URL</Label>
                  <Input
                    value={contactFormData.linkedin_url}
                    onChange={(e) => setContactFormData({ ...contactFormData, linkedin_url: e.target.value })}
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Twitter URL</Label>
                <Input
                  value={contactFormData.twitter_url}
                  onChange={(e) => setContactFormData({ ...contactFormData, twitter_url: e.target.value })}
                  placeholder="https://twitter.com/..."
                />
              </div>

              <div className="space-y-2">
                <Label>Bio / Notes</Label>
                <Textarea
                  value={contactFormData.bio}
                  onChange={(e) => setContactFormData({ ...contactFormData, bio: e.target.value })}
                  rows={3}
                  placeholder="Additional information about this contact..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setShowContactDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="bg-indigo-600 hover:bg-indigo-700"
                  disabled={createContactMutation.isPending || updateContactMutation.isPending}
                >
                  {(createContactMutation.isPending || updateContactMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {editingContact ? 'Save Changes' : 'Add Contact'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}