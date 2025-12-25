import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Users, Plus, Loader2, Search, Mail, Phone, Linkedin,
  Edit, Trash2, Building2, MoreHorizontal, Star, Sparkles,
  CheckCircle, AlertCircle, Filter, ArrowUpDown
} from 'lucide-react';
import FieldVisibilityManager from '@/components/crm/FieldVisibilityManager';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Brain, RefreshCw, Cloud, CloudOff, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------
   Liquid Glass Primitives
-------------------------------------------------------- */
function LiquidBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,rgba(15,23,42,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.35)_1px,transparent_1px)] [background-size:64px_64px]" />
      <div className="absolute -top-28 left-1/4 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-purple-400/30 to-pink-400/25 blur-3xl" />
      <div className="absolute top-1/4 right-1/4 h-[480px] w-[480px] rounded-full bg-gradient-to-br from-orange-400/20 to-yellow-400/18 blur-3xl" />
      <div className="absolute -bottom-28 left-1/3 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-green-400/18 to-blue-400/18 blur-3xl" />
    </div>
  );
}

function GlassCard({ children, className }) {
  return (
    <div className={cn("relative rounded-3xl border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30 backdrop-blur-2xl shadow-lg", className)}>
      {children}
    </div>
  );
}

function RainbowButton({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group relative px-5 py-2.5 rounded-full overflow-hidden shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)] bg-[length:200%_100%] animate-[gradient_10s_ease_infinite]" />
      <div className="absolute inset-0 backdrop-blur-sm bg-white/10" />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
      <div className="absolute inset-px rounded-full bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />
      <span className="relative z-10 flex items-center justify-center gap-2 text-sm font-semibold text-white drop-shadow-lg">
        {children}
      </span>
    </button>
  );
}

export default function Contacts() {
  const [searchQuery, setSearchQuery] = useState('');
  const [firmFilter, setFirmFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('full_name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [visibleFields, setVisibleFields] = useState([
    'full_name', 'firm', 'work_email', 'primary_phone', 'title', 'enrichment_status'
  ]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState({ 
    current: 0, 
    total: 0, 
    currentContact: '', 
    currentBatch: 0, 
    totalBatches: 0 
  });
  const [deduplicating, setDeduplicating] = useState(false);
  const [dedupeProgress, setDedupeProgress] = useState({ 
    current: 0, 
    total: 0, 
    currentBatch: 0, 
    totalBatches: 0 
  });
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ 
    current: 0, 
    total: 0, 
    currentBatch: 0, 
    totalBatches: 0 
  });
  const [formData, setFormData] = useState({
    full_name: '',
    title: '',
    work_email: '',
    personal_email: '',
    primary_phone: '',
    secondary_phone: '',
    linkedin_url: '',
    firm_id: '',
    bio: '',
    is_primary: false,
  });

  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.list('-created_date', 50000),
  });

  const { data: firms = [] } = useQuery({
    queryKey: ['firms'],
    queryFn: () => base44.entities.InvestorFirm.list('company_name', 50000),
  });

  const firmsMap = firms.reduce((acc, f) => ({ ...acc, [f.id]: f }), {});

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Contact.create(data),
    onSuccess: async (newContact) => {
      queryClient.invalidateQueries(['contacts']);
      
      // Auto-sync to Folk if firm has folk_id
      if (newContact.firm_id) {
        const firm = firms.find(f => f.id === newContact.firm_id);
        if (firm?.folk_id) {
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
                companies: [{ id: firm.folk_id }]
              }
            });
            
            await base44.entities.Contact.update(newContact.id, {
              folk_sync_status: 'synced',
              folk_last_synced_at: new Date().toISOString()
            });
            
            toast.success('Contact created and synced to Folk');
          } catch (error) {
            await base44.entities.Contact.update(newContact.id, {
              folk_sync_status: 'error',
              folk_sync_error: error.message
            });
            toast.warning('Contact created but failed to sync to Folk');
          }
        }
      }
      
      setShowDialog(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Contact.update(id, data),
    onSuccess: async (updatedContact) => {
      queryClient.invalidateQueries(['contacts']);
      
      // Auto-sync to Folk if contact has folk_id
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
          
          toast.success('Contact updated and synced to Folk');
        } catch (error) {
          await base44.entities.Contact.update(updatedContact.id, {
            folk_sync_status: 'error',
            folk_sync_error: error.message
          });
          toast.warning('Contact updated but failed to sync to Folk');
        }
      } else {
        await base44.entities.Contact.update(updatedContact.id, {
          folk_sync_status: 'pending'
        });
      }
      
      setShowDialog(false);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Contact.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['contacts']),
  });

  const resetForm = () => {
    setFormData({
      full_name: '',
      title: '',
      work_email: '',
      personal_email: '',
      primary_phone: '',
      secondary_phone: '',
      linkedin_url: '',
      firm_id: '',
      bio: '',
      is_primary: false,
    });
    setEditingContact(null);
  };

  const handleEdit = (contact) => {
    setEditingContact(contact);
    setFormData({
      full_name: contact.full_name || '',
      title: contact.title || '',
      work_email: contact.work_email || '',
      personal_email: contact.personal_email || '',
      primary_phone: contact.primary_phone || '',
      secondary_phone: contact.secondary_phone || '',
      linkedin_url: contact.linkedin_url || '',
      firm_id: contact.firm_id || '',
      bio: contact.bio || '',
      is_primary: contact.is_primary || false,
    });
    setShowDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingContact) {
      updateMutation.mutate({ id: editingContact.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEnrich = async (contact) => {
    setIsEnriching(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Find contact information for ${contact.full_name} at ${firmsMap[contact.firm_id]?.company_name}. 
        Current LinkedIn: ${contact.linkedin_url}
        Look for their work email, phone, and current title.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            work_email: { type: 'string' },
            title: { type: 'string' },
            phone: { type: 'string' },
            bio: { type: 'string' },
          }
        }
      });

      if (result) {
        await base44.entities.Contact.update(contact.id, {
          work_email: result.work_email || contact.work_email,
          title: result.title || contact.title,
          primary_phone: result.phone || contact.primary_phone,
          bio: result.bio || contact.bio,
          enrichment_status: 'enriched',
          last_enriched: new Date().toISOString(),
        });
        queryClient.invalidateQueries(['contacts']);
      }
    } catch (error) {
      console.error('Enrichment error:', error);
    } finally {
      setIsEnriching(false);
    }
  };

  const pushToFolk = async () => {
    setSyncing(true);
    setSyncProgress({ current: 0, total: 0, currentBatch: 0, totalBatches: 0 });
    toast.info('Syncing contacts to Folk CRM...');

    try {
      // Get contacts that need syncing (pending or error status)
      const contactsToSync = contacts.filter(c => 
        (c.folk_sync_status === 'pending' || c.folk_sync_status === 'error') && c.firm_id
      );

      if (contactsToSync.length === 0) {
        toast.info('All contacts are already synced');
        setSyncing(false);
        return;
      }

      // Get firms for reference
      const firmsMap = firms.reduce((acc, f) => ({ ...acc, [f.id]: f }), {});

      // Split into batches of 10
      const BATCH_SIZE = 10;
      const batches = [];
      for (let i = 0; i < contactsToSync.length; i += BATCH_SIZE) {
        batches.push(contactsToSync.slice(i, i + BATCH_SIZE));
      }

      const totalBatches = batches.length;
      setSyncProgress({ 
        current: 0, 
        total: contactsToSync.length, 
        currentBatch: 0, 
        totalBatches 
      });

      toast.success(`Syncing ${contactsToSync.length} contacts in ${totalBatches} batches...`);

      let synced = 0;
      let failed = 0;
      let processedCount = 0;

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        setSyncProgress({ 
          current: processedCount, 
          total: contactsToSync.length,
          currentBatch: batchIndex + 1,
          totalBatches
        });

        const batchPromises = batch.map(async (contact) => {
          try {
            const firm = firmsMap[contact.firm_id];
            
            if (!firm?.folk_id && !contact.folk_id) {
              return { success: false, error: 'No Folk ID available' };
            }

            if (contact.folk_id) {
              // Update existing contact in Folk
              await base44.functions.invoke('folkApi', {
                action: 'updatePerson',
                data: {
                  id: contact.folk_id,
                  updates: {
                    fullName: contact.full_name,
                    firstName: contact.first_name,
                    lastName: contact.last_name,
                    jobTitle: contact.title,
                    emails: [contact.work_email, contact.personal_email].filter(Boolean),
                    phones: [contact.primary_phone].filter(Boolean),
                    urls: [contact.linkedin_url, contact.twitter_url].filter(Boolean),
                    description: contact.bio,
                  }
                }
              });
            } else if (firm?.folk_id) {
              // Create new contact in Folk
              const { data: result } = await base44.functions.invoke('folkApi', {
                action: 'createPerson',
                data: {
                  fullName: contact.full_name,
                  firstName: contact.first_name,
                  lastName: contact.last_name,
                  jobTitle: contact.title,
                  emails: [contact.work_email, contact.personal_email].filter(Boolean),
                  phones: [contact.primary_phone].filter(Boolean),
                  urls: [contact.linkedin_url, contact.twitter_url].filter(Boolean),
                  description: contact.bio,
                  companies: [{ id: firm.folk_id }]
                }
              });

              // Update local contact with folk_id
              if (result?.person?.id) {
                await base44.entities.Contact.update(contact.id, {
                  folk_id: result.person.id
                });
              }
            }

            await base44.entities.Contact.update(contact.id, {
              folk_sync_status: 'synced',
              folk_last_synced_at: new Date().toISOString(),
              folk_sync_error: null
            });

            return { success: true };
          } catch (error) {
            await base44.entities.Contact.update(contact.id, {
              folk_sync_status: 'error',
              folk_sync_error: error.message
            });
            return { success: false, error: error.message };
          }
        });

        const results = await Promise.all(batchPromises);
        
        results.forEach(result => {
          if (result.success) {
            synced++;
          } else {
            failed++;
          }
        });

        processedCount += batch.length;
        setSyncProgress({ 
          current: processedCount, 
          total: contactsToSync.length,
          currentBatch: batchIndex + 1,
          totalBatches
        });
      }

      queryClient.invalidateQueries(['contacts']);
      toast.success(`Sync complete! ${synced} synced, ${failed} failed.`);
    } catch (error) {
      console.error('Sync error:', error);
      toast.error(`Failed to sync: ${error.message}`);
    } finally {
      setSyncing(false);
      setSyncProgress({ current: 0, total: 0, currentBatch: 0, totalBatches: 0 });
    }
  };

  const removeDuplicateContacts = async () => {
    setDeduplicating(true);
    setDedupeProgress({ current: 0, total: 0, currentBatch: 0, totalBatches: 0 });
    toast.info('Scanning for duplicate contacts...');

    try {
      // Group contacts by full name
      const contactsByName = {};
      contacts.forEach(contact => {
        if (contact.full_name) {
          const key = contact.full_name.toLowerCase().trim();
          if (!contactsByName[key]) {
            contactsByName[key] = [];
          }
          contactsByName[key].push(contact);
        }
      });

      // Find duplicates
      const duplicateGroups = Object.entries(contactsByName).filter(([_, group]) => group.length > 1);

      if (duplicateGroups.length === 0) {
        toast.info('No duplicate contacts found');
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
            // Count non-empty fields for each contact
            const getFieldCount = (contact) => {
              return [
                contact.work_email,
                contact.personal_email,
                contact.primary_phone,
                contact.secondary_phone,
                contact.linkedin_url,
                contact.title,
                contact.bio,
                contact.firm_id,
                contact.location,
                contact.twitter_url
              ].filter(Boolean).length;
            };

            // Sort by field count (keep the one with most data)
            const sorted = [...group].sort((a, b) => {
              const aDataPoints = getFieldCount(a);
              const bDataPoints = getFieldCount(b);
              
              // Keep the one with more data points
              if (aDataPoints !== bDataPoints) {
                return bDataPoints - aDataPoints;
              }
              
              // Otherwise keep the oldest
              return new Date(a.created_date) - new Date(b.created_date);
            });
            
            // Keep the first (most complete) and delete the rest
            const duplicates = sorted.slice(1);

            // Delete duplicates
            for (const dup of duplicates) {
              await base44.entities.Contact.delete(dup.id);
              removed++;
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

      queryClient.invalidateQueries(['contacts']);
      toast.success(`Removed ${removed} duplicate contacts`);
    } catch (error) {
      console.error('Deduplication error:', error);
      toast.error(`Failed to remove duplicates: ${error.message}`);
    } finally {
      setDeduplicating(false);
      setDedupeProgress({ current: 0, total: 0, currentBatch: 0, totalBatches: 0 });
    }
  };

  const enrichAllContacts = async () => {
    setBulkEnriching(true);
    const contactsToEnrich = filteredContacts.filter(c => 
      !c.last_enriched || 
      new Date(c.last_enriched) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );
    
    // Split into batches of 5
    const BATCH_SIZE = 5;
    const batches = [];
    for (let i = 0; i < contactsToEnrich.length; i += BATCH_SIZE) {
      batches.push(contactsToEnrich.slice(i, i + BATCH_SIZE));
    }

    const totalBatches = batches.length;
    setEnrichmentProgress({ 
      current: 0, 
      total: contactsToEnrich.length, 
      currentContact: '', 
      currentBatch: 0, 
      totalBatches 
    });
    toast.info(`Starting deep research on ${contactsToEnrich.length} contacts in ${totalBatches} batches...`);

    let processedCount = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      setEnrichmentProgress({ 
        current: processedCount, 
        total: contactsToEnrich.length, 
        currentContact: `Batch ${batchIndex + 1}/${totalBatches}`, 
        currentBatch: batchIndex + 1, 
        totalBatches 
      });

      // Process batch in parallel
      const batchPromises = batch.map(async (contact) => {
        const firm = firmsMap[contact.firm_id];
        try {
          const enrichmentData = await base44.integrations.Core.InvokeLLM({
            prompt: `Deep web research and scraping for this contact. Find ALL available data.

Contact: ${contact.full_name}
Firm: ${firm?.company_name || 'Unknown'}
Current Title: ${contact.title || 'Unknown'}
LinkedIn: ${contact.linkedin_url || 'Unknown'}

COMPREHENSIVE RESEARCH:
1. Professional Email - work email address (use common patterns, verify with web search)
2. Phone Numbers - direct line, mobile, office
3. Current Title & Role - exact job title and responsibilities
4. Career History - previous positions, companies
5. Education - degrees, institutions
6. Investment Focus - sectors/stages they focus on
7. Portfolio - companies they've invested in or advised
8. Social Media - Twitter, blog, Medium, personal website
9. Speaking Engagements - conferences, podcasts, webinars
10. Publications - articles, thought leadership
11. Expertise Areas - specific skills, industries
12. Geographic Preferences - where they invest
13. Contact Preferences - best way to reach (email, LinkedIn, etc.)

Use LinkedIn scraping, company websites, news, Crunchbase, Twitter, email pattern detection.
Provide VERIFIED data with high confidence.`,
            add_context_from_internet: true,
            response_json_schema: {
              type: 'object',
              properties: {
                work_email: { type: 'string' },
                personal_email: { type: 'string' },
                primary_phone: { type: 'string' },
                secondary_phone: { type: 'string' },
                title: { type: 'string' },
                bio: { type: 'string' },
                investment_focus: { type: 'array', items: { type: 'string' } },
                preferred_geography: { type: 'array', items: { type: 'string' } },
                linkedin_url: { type: 'string' },
                twitter_url: { type: 'string' },
                location: { type: 'string' },
                education: { type: 'array', items: { type: 'string' } },
                career_history: { type: 'array', items: { type: 'string' } },
                portfolio_companies: { type: 'array', items: { type: 'string' } },
                expertise: { type: 'array', items: { type: 'string' } },
                data_confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
              }
            }
          });

          await base44.entities.Contact.update(contact.id, {
            work_email: enrichmentData.work_email || contact.work_email,
            personal_email: enrichmentData.personal_email || contact.personal_email,
            primary_phone: enrichmentData.primary_phone || contact.primary_phone,
            secondary_phone: enrichmentData.secondary_phone || contact.secondary_phone,
            title: enrichmentData.title || contact.title,
            bio: enrichmentData.bio || contact.bio,
            investment_focus: enrichmentData.investment_focus || contact.investment_focus,
            preferred_geography: enrichmentData.preferred_geography || contact.preferred_geography,
            linkedin_url: enrichmentData.linkedin_url || contact.linkedin_url,
            twitter_url: enrichmentData.twitter_url || contact.twitter_url,
            location: enrichmentData.location || contact.location,
            enrichment_status: 'enriched',
            last_enriched: new Date().toISOString()
          });
        } catch (error) {
          console.error('Enrichment error:', contact.full_name, error);
          await base44.entities.Contact.update(contact.id, {
            enrichment_status: 'failed',
            last_enriched: new Date().toISOString()
          });
        }
      });

      await Promise.all(batchPromises);
      processedCount += batch.length;
      setEnrichmentProgress({ 
        current: processedCount, 
        total: contactsToEnrich.length, 
        currentContact: `Batch ${batchIndex + 1}/${totalBatches}`, 
        currentBatch: batchIndex + 1, 
        totalBatches 
      });
    }

    setBulkEnriching(false);
    setEnrichmentProgress({ current: 0, total: 0, currentContact: '', currentBatch: 0, totalBatches: 0 });
    queryClient.invalidateQueries(['contacts']);
    toast.success(`Successfully enriched ${contactsToEnrich.length} contact profiles!`);
  };

  const filteredContacts = contacts.filter(contact => {
    if (firmFilter !== 'all' && contact.firm_id !== firmFilter) return false;
    if (statusFilter !== 'all' && contact.enrichment_status !== statusFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!contact.full_name?.toLowerCase().includes(query) &&
          !contact.work_email?.toLowerCase().includes(query) &&
          !contact.title?.toLowerCase().includes(query)) {
        return false;
      }
    }
    return true;
  });

  const sortedContacts = [...filteredContacts].sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];
    
    if (sortBy === 'firm') {
      aVal = firmsMap[a.firm_id]?.company_name || '';
      bVal = firmsMap[b.firm_id]?.company_name || '';
    }
    
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

  if (isLoading) {
    return (
      <div className="relative min-h-[60vh]">
        <LiquidBackground />
        <div className="flex h-[60vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading contacts…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-8">
      <LiquidBackground />

      {/* ================= Header ================= */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900">
            Contacts{" "}
            <span className="bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)]
              bg-clip-text text-transparent">
              CRM
            </span>
          </h1>
          <p className="mt-2 text-slate-600">
            {contacts.length.toLocaleString()} contacts enriched, synced, and AI-managed
          </p>
        </div>

        {/* Action Cluster */}
        <GlassCard className="p-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={enrichAllContacts} disabled={bulkEnriching}>
            <Brain className="w-4 h-4 mr-2" />
            Deep Research
          </Button>

          <Button variant="outline" onClick={pushToFolk} disabled={syncing}>
            <Cloud className="w-4 h-4 mr-2" />
            Push to Folk
          </Button>

          <Button variant="outline" onClick={removeDuplicateContacts} disabled={deduplicating}>
            <Trash2 className="w-4 h-4 mr-2" />
            Deduplicate
          </Button>

          <FieldVisibilityManager
            visibleFields={visibleFields}
            onFieldsChange={setVisibleFields}
            entityType="contact"
          />

          <RainbowButton onClick={() => { resetForm(); setShowDialog(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Add Contact
          </RainbowButton>
        </GlassCard>
      </div>

      {/* Folk Sync Progress */}
      {syncing && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Cloud className="w-5 h-5 text-white animate-pulse" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Syncing to Folk CRM</h3>
                <p className="text-sm text-slate-600">
                  Processing batch {syncProgress.currentBatch} of {syncProgress.totalBatches}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge className="bg-blue-600 text-white">
                {syncProgress.current} / {syncProgress.total}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Batch {syncProgress.currentBatch}/{syncProgress.totalBatches}
              </Badge>
            </div>
          </div>
          <Progress 
            value={(syncProgress.current / syncProgress.total) * 100} 
            className="h-2"
          />
          <p className="text-xs text-slate-500 mt-2">
            Processing in batches of 10 for optimal performance...
          </p>
        </div>
      )}

      {/* Deduplication Progress */}
      {deduplicating && (
        <div className="bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-600 rounded-lg">
                <Trash2 className="w-5 h-5 text-white animate-pulse" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Removing Duplicate Contacts</h3>
                <p className="text-sm text-slate-600">
                  Processing batch {dedupeProgress.currentBatch} of {dedupeProgress.totalBatches}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge className="bg-red-600 text-white">
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
      )}

      {/* AI Enrichment Progress */}
      {bulkEnriching && (
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 rounded-lg">
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
              <Badge className="bg-indigo-600 text-white">
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
      )}

      {/* ================= Filters ================= */}
      <GlassCard className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white/55 border-white/60 rounded-2xl"
            />
          </div>

          <Select value={firmFilter} onValueChange={setFirmFilter}>
            <SelectTrigger className="w-48 bg-white/55 border-white/60 rounded-2xl">
              <SelectValue placeholder="All firms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Firms</SelectItem>
              {firms.map(f => (
                <SelectItem key={f.id} value={f.id}>{f.company_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48 bg-white/55 border-white/60 rounded-2xl">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="enriched">Enriched</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </GlassCard>

      {/* ================= Table ================= */}
      <GlassCard className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-white/40">
              {visibleFields.includes("full_name") && <TableHead>Contact</TableHead>}
              {visibleFields.includes("firm") && <TableHead>Firm</TableHead>}
              {visibleFields.includes("title") && <TableHead>Title</TableHead>}
              {visibleFields.includes("work_email") && <TableHead>Email</TableHead>}
              {visibleFields.includes("primary_phone") && <TableHead>Phone</TableHead>}
              {visibleFields.includes("linkedin_url") && <TableHead>LinkedIn</TableHead>}
              {visibleFields.includes("enrichment_status") && <TableHead>Status</TableHead>}
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {sortedContacts.map(contact => (
              <TableRow key={contact.id} className="hover:bg-white/40 transition">
                {visibleFields.includes("full_name") && (
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl
                        bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)]
                        flex items-center justify-center text-white font-semibold">
                        {contact.full_name?.charAt(0) || "?"}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{contact.full_name}</p>
                        <p className="text-xs text-slate-500">{contact.title || "—"}</p>
                      </div>
                    </div>
                  </TableCell>
                )}

                {visibleFields.includes("firm") && (
                  <TableCell>{firmsMap[contact.firm_id]?.company_name || "—"}</TableCell>
                )}

                {visibleFields.includes("title") && (
                  <TableCell>{contact.title || "—"}</TableCell>
                )}

                {visibleFields.includes("work_email") && (
                  <TableCell>{contact.work_email || "—"}</TableCell>
                )}

                {visibleFields.includes("primary_phone") && (
                  <TableCell>{contact.primary_phone || "—"}</TableCell>
                )}

                {visibleFields.includes("linkedin_url") && (
                  <TableCell>
                    {contact.linkedin_url ? (
                      <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                        View
                      </a>
                    ) : "—"}
                  </TableCell>
                )}

                {visibleFields.includes("enrichment_status") && (
                  <TableCell>
                    <Badge className="bg-white/60 border border-white/60">
                      {contact.enrichment_status || "pending"}
                    </Badge>
                  </TableCell>
                )}

                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(contact)}>
                        <Edit className="w-4 h-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEnrich(contact)}>
                        <Sparkles className="w-4 h-4 mr-2" /> Enrich
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => deleteMutation.mutate(contact.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </GlassCard>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingContact ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Partner, Managing Director"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Firm</Label>
              <Select
                value={formData.firm_id}
                onValueChange={(value) => setFormData({ ...formData, firm_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select firm" />
                </SelectTrigger>
                <SelectContent>
                  {firms.map((firm) => (
                    <SelectItem key={firm.id} value={firm.id}>{firm.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Work Email</Label>
                <Input
                  type="email"
                  value={formData.work_email}
                  onChange={(e) => setFormData({ ...formData, work_email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Primary Phone</Label>
                <Input
                  value={formData.primary_phone}
                  onChange={(e) => setFormData({ ...formData, primary_phone: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>LinkedIn URL</Label>
              <Input
                value={formData.linkedin_url}
                onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                placeholder="https://linkedin.com/in/..."
              />
            </div>

            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="is_primary"
                checked={formData.is_primary}
                onCheckedChange={(checked) => setFormData({ ...formData, is_primary: checked })}
              />
              <Label htmlFor="is_primary">Primary contact for this firm</Label>
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
                {editingContact ? 'Save Changes' : 'Add Contact'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}