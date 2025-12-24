import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Download, Loader2, CheckCircle, AlertCircle, RefreshCw,
  Building2, Users, ArrowRight, Sparkles, RefreshCcw, ArrowUpDown
} from 'lucide-react';
import { toast } from "sonner";
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
import { cn } from "@/lib/utils";
import { syncFromFolk, syncToFolk, fullSync } from './FolkSyncEngine';

export default function FolkImporter({ onImportComplete }) {
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStage, setSyncStage] = useState(''); // pull, push
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState({ firms: 0, contacts: 0, failed: 0 });
  const [syncResults, setSyncResults] = useState(null);
  const [step, setStep] = useState('idle'); // idle, importing, complete, syncing
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [loadingGroups, setLoadingGroups] = useState(false);

  const queryClient = useQueryClient();

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Load Folk groups on mount
  React.useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const { data: result } = await base44.functions.invoke('folkApi', { action: 'listGroups' });
      if (result.success && result.groups) {
        setGroups(result.groups);
        if (result.groups.length > 0) {
          setSelectedGroup(result.groups[0].name);
        }
      }
    } catch (error) {
      console.error('Failed to load groups:', error);
      toast.error('Failed to load Folk groups');
    } finally {
      setLoadingGroups(false);
    }
  };



  const handleImportFromFolk = async () => {
    setImporting(true);
    setStep('importing');
    setProgress(0);
    setResults({ firms: 0, contacts: 0, failed: 0 });
    toast.info('Connecting to Folk CRM...');

    try {
      if (!selectedGroup) {
        toast.error('Please select a Folk group to import');
        setImporting(false);
        return;
      }

      // Fetch data from Folk via backend function
      toast.info(`Fetching data from Folk group: ${selectedGroup}...`);
      const { data: result } = await base44.functions.invoke('folkApi', { 
        action: 'fetchGroupData',
        groupName: selectedGroup
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch data from Folk');
      }

      const { companies, people } = result;
      toast.success(`Found ${companies.length} companies and ${people.length} people in Folk`);

      let firmsCreated = 0;
      let contactsCreated = 0;
      let failed = 0;
      const batchId = `batch_${Date.now()}`;
      const failures = [];

      // Get existing firms for matching
      const existingFirms = await base44.entities.InvestorFirm.list('company_name', 1000);
      const firmsByName = existingFirms.reduce((acc, f) => {
        acc[f.company_name?.toLowerCase().trim()] = f.id;
        return acc;
      }, {});

      const totalItems = companies.length + people.length;
      let processedItems = 0;

      // Import companies as investor firms
      for (const company of companies) {
        try {
          const companyName = company.name;
          if (companyName) {
            const firmKey = companyName.toLowerCase().trim();
            if (!firmsByName[firmKey]) {
              const firmData = {
                folk_id: company.id,
                company_name: companyName,
                firm_description: company.description,
                industry: company.industry,
                foundation_year: company.foundationYear,
                employee_range: company.employeeRange,
                funding_raised: company.fundingRaised ? parseFloat(company.fundingRaised) : null,
                last_funding_date: company.lastFundingDate,
                website: company.urls?.[0] || null,
                urls: company.urls || [],
                emails: company.emails || [],
                phones: company.phones || [],
                addresses: company.addresses || [],
                linkedin_url: company.urls?.find(u => u.includes('linkedin.com')),
                folk_groups: company.groups || [],
                folk_custom_fields: company.customFieldValues || {},
                folk_created_at: company.createdAt,
                folk_created_by: company.createdBy,
              };

              // Parse first address into structured fields
              if (company.addresses?.[0]) {
                const addressParts = company.addresses[0].split(',').map(p => p.trim());
                if (addressParts.length >= 3) {
                  firmData.street_address = addressParts[0];
                  firmData.city = addressParts[1];
                  firmData.country = addressParts[2];
                } else if (addressParts.length === 2) {
                  firmData.city = addressParts[0];
                  firmData.country = addressParts[1];
                }
              }

              const newFirm = await base44.entities.InvestorFirm.create(firmData);
              firmsByName[firmKey] = newFirm.id;
              firmsCreated++;
            }
          }
        } catch (error) {
          console.error('Company import error:', error);
          failed++;
          failures.push({
            folk_id: company.id,
            record_type: 'company',
            folk_data: company,
            error_message: error.message || 'Unknown error',
            import_batch_id: batchId
          });
        }

        processedItems++;
        setProgress(Math.round((processedItems / totalItems) * 100));
        setResults({ firms: firmsCreated, contacts: contactsCreated, failed });
      }

      // Import people as contacts
      for (const person of people) {
        try {
          const fullName = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim();

          if (fullName) {
            // Get company name from first company association
            const companyId = person.companies?.[0]?.id;
            const company = companyId ? companies.find(c => c.id === companyId) : null;
            const companyName = company?.name || person.companies?.[0]?.name;

            const contactData = {
              folk_id: person.id,
              full_name: fullName,
              first_name: person.firstName,
              last_name: person.lastName,
              title: person.jobTitle,
              bio: person.description,
              birthday: person.birthday,
              work_email: person.emails?.[0],
              emails: person.emails || [],
              primary_phone: person.phones?.[0],
              phones: person.phones || [],
              addresses: person.addresses || [],
              urls: person.urls || [],
              linkedin_url: person.urls?.find(u => u.includes('linkedin.com')),
              twitter_url: person.urls?.find(u => u.includes('twitter.com') || u.includes('x.com')),
              location: person.addresses?.[0],
              firm_name: companyName,
              firm_id: companyName ? firmsByName[companyName.toLowerCase().trim()] : undefined,
              folk_companies: person.companies || [],
              folk_groups: person.groups || [],
              folk_custom_fields: person.customFieldValues || {},
              folk_interaction_metadata: person.interactionMetadata || {},
              folk_created_at: person.createdAt,
              folk_created_by: person.createdBy,
            };

            await base44.entities.Contact.create(contactData);
            contactsCreated++;
          }
        } catch (error) {
          console.error('Contact import error:', error);
          failed++;
          failures.push({
            folk_id: person.id,
            record_type: 'person',
            folk_data: person,
            error_message: error.message || 'Unknown error',
            import_batch_id: batchId
          });
        }

        processedItems++;
        setProgress(Math.round((processedItems / totalItems) * 100));
        setResults({ firms: firmsCreated, contacts: contactsCreated, failed });
      }

      // Save failures to database
      if (failures.length > 0) {
        try {
          await base44.entities.FailedImport.bulkCreate(failures);
          toast.info(`${failures.length} failed records saved for retry`);
        } catch (error) {
          console.error('Failed to save failures:', error);
        }
      }

      queryClient.invalidateQueries(['firms']);
      queryClient.invalidateQueries(['contacts']);
      queryClient.invalidateQueries(['failed-imports']);
      
      setStep('complete');
      toast.success(`Import complete! ${firmsCreated} firms and ${contactsCreated} contacts imported.`);
      
      if (onImportComplete) {
        onImportComplete({ firms: firmsCreated, contacts: contactsCreated, failed });
      }
      } catch (error) {
      console.error('Folk import error:', error);
      toast.error(`Failed to import from Folk: ${error.message}`);
      setStep('idle');
      } finally {
      setImporting(false);
      }
      };

      const handleBiDirectionalSync = async () => {
        if (!selectedGroup) {
          toast.error('Please select a Folk group to sync');
          return;
        }

        setSyncing(true);
        setStep('syncing');
        setSyncResults(null);
        toast.info(`Starting bi-directional sync with ${selectedGroup}...`);

        try {
          const results = await fullSync(selectedGroup, ({ stage, progress }) => {
            setSyncStage(stage);
            setProgress(progress);
          });

      setSyncResults(results);
      queryClient.invalidateQueries(['firms']);
      queryClient.invalidateQueries(['contacts']);

      const totalChanges = 
        results.fromFolk.created + results.fromFolk.updated +
        results.toFolk.created + results.toFolk.updated;

      toast.success(`Sync complete! ${totalChanges} records synchronized.`);
      setStep('complete');

      if (onImportComplete) {
        onImportComplete({
          firms: results.fromFolk.created,
          contacts: results.fromFolk.updated,
          synced: totalChanges
        });
      }
      } catch (error) {
      console.error('Sync error:', error);
      toast.error(`Sync failed: ${error.message}`);
      setStep('idle');
      } finally {
      setSyncing(false);
      }
      };

  return (
    <div className="space-y-6">
      {/* Idle State */}
      {step === 'idle' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" />
              Import from Folk CRM
            </CardTitle>
            <CardDescription>
              Sync your investor contacts and firms from Folk CRM automatically
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-indigo-900 mb-1">Automatic Sync</h3>
                  <p className="text-sm text-indigo-700 mb-4">
                    Connect to your Folk CRM account and automatically import all investor contacts and firms. 
                    Data will be matched and deduplicated automatically.
                  </p>
                  
                  {/* Group selector */}
                  <div className="mb-4 p-3 bg-white rounded-lg border border-indigo-200">
                    <label className="text-xs font-medium text-indigo-900 mb-2 block">
                      Select Folk Group
                    </label>
                    {loadingGroups ? (
                      <div className="flex items-center gap-2 text-sm text-indigo-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading groups...
                      </div>
                    ) : groups.length > 0 ? (
                      <select
                        value={selectedGroup}
                        onChange={(e) => setSelectedGroup(e.target.value)}
                        className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                      >
                        {groups.map((group) => (
                          <option key={group.id} value={group.name}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm text-red-600">No groups found in Folk CRM</p>
                    )}
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm text-indigo-800">
                      <CheckCircle className="w-4 h-4" />
                      Imports contacts with company information
                    </div>
                    <div className="flex items-center gap-2 text-sm text-indigo-800">
                      <CheckCircle className="w-4 h-4" />
                      Automatically creates or matches firms
                    </div>
                    <div className="flex items-center gap-2 text-sm text-indigo-800">
                      <CheckCircle className="w-4 h-4" />
                      Deduplicates existing data
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button 
                      onClick={handleImportFromFolk}
                      disabled={importing || syncing || !selectedGroup || loadingGroups}
                      size="lg"
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Initial Import
                    </Button>
                    <Button 
                      onClick={handleBiDirectionalSync}
                      disabled={importing || syncing || !selectedGroup || loadingGroups}
                      size="lg"
                      variant="outline"
                      className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                    >
                      <ArrowUpDown className="w-4 h-4 mr-2" />
                      Bi-Directional Sync
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Importing State */}
      {step === 'importing' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              Importing from Folk CRM...
            </CardTitle>
            <CardDescription>
              Syncing your investor data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Progress</span>
                <span className="font-medium text-slate-900">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
            
            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <div className="flex items-center justify-center w-12 h-12 bg-indigo-100 rounded-full mx-auto mb-2">
                  <Building2 className="w-6 h-6 text-indigo-600" />
                </div>
                <p className="text-2xl font-bold text-indigo-600">{results.firms}</p>
                <p className="text-sm text-slate-500">Firms</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-full mx-auto mb-2">
                  <Users className="w-6 h-6 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold text-emerald-600">{results.contacts}</p>
                <p className="text-sm text-slate-500">Contacts</p>
              </div>
              {results.failed > 0 && (
                <div className="text-center">
                  <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mx-auto mb-2">
                    <AlertCircle className="w-6 h-6 text-red-600" />
                  </div>
                  <p className="text-2xl font-bold text-red-600">{results.failed}</p>
                  <p className="text-sm text-slate-500">Failed</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Syncing State */}
      {step === 'syncing' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              Bi-Directional Sync in Progress...
            </CardTitle>
            <CardDescription>
              {syncStage === 'pull' ? 'Pulling updates from Folk CRM' : 'Pushing updates to Folk CRM'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Progress</span>
                <span className="font-medium text-slate-900">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="flex items-center justify-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-lg">
                <ArrowRight className={cn(
                  "w-5 h-5 text-indigo-600",
                  syncStage === 'pull' && "animate-pulse"
                )} />
                <span className="text-sm font-medium text-indigo-900">Pull from Folk</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-lg">
                <ArrowRight className={cn(
                  "w-5 h-5 text-emerald-600 rotate-180",
                  syncStage === 'push' && "animate-pulse"
                )} />
                <span className="text-sm font-medium text-emerald-900">Push to Folk</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Complete State */}
      {step === 'complete' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              {syncResults ? 'Sync Complete' : 'Import Complete'}
            </CardTitle>
            <CardDescription>
              {syncResults ? 'Successfully synchronized with Folk CRM' : 'Successfully imported data from Folk CRM'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {syncResults ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-indigo-600" />
                      From Folk CRM
                    </h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Created:</span>
                        <span className="font-semibold text-emerald-600">{syncResults.fromFolk.created}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Updated:</span>
                        <span className="font-semibold text-indigo-600">{syncResults.fromFolk.updated}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Skipped:</span>
                        <span className="font-semibold text-slate-500">{syncResults.fromFolk.skipped}</span>
                      </div>
                      {syncResults.fromFolk.errors?.length > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Errors:</span>
                          <span className="font-semibold text-red-600">{syncResults.fromFolk.errors.length}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-emerald-600 rotate-180" />
                      To Folk CRM
                    </h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Created:</span>
                        <span className="font-semibold text-emerald-600">{syncResults.toFolk.created}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Updated:</span>
                        <span className="font-semibold text-indigo-600">{syncResults.toFolk.updated}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Skipped:</span>
                        <span className="font-semibold text-slate-500">{syncResults.toFolk.skipped}</span>
                      </div>
                      {syncResults.toFolk.errors?.length > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Errors:</span>
                          <span className="font-semibold text-red-600">{syncResults.toFolk.errors.length}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-50 rounded-lg p-3 text-center">
                  <p className="text-sm text-indigo-800">
                    Sync completed in {(syncResults.totalTime / 1000).toFixed(1)} seconds
                  </p>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center gap-8">
                <div className="text-center">
                  <div className="flex items-center justify-center w-12 h-12 bg-indigo-100 rounded-full mx-auto mb-2">
                    <Building2 className="w-6 h-6 text-indigo-600" />
                  </div>
                  <p className="text-2xl font-bold text-indigo-600">{results.firms}</p>
                  <p className="text-sm text-slate-500">Firms</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center w-12 h-12 bg-emerald-100 rounded-full mx-auto mb-2">
                    <Users className="w-6 h-6 text-emerald-600" />
                  </div>
                  <p className="text-2xl font-bold text-emerald-600">{results.contacts}</p>
                  <p className="text-sm text-slate-500">Contacts</p>
                </div>
                {results.failed > 0 && (
                  <div className="text-center">
                    <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mx-auto mb-2">
                      <AlertCircle className="w-6 h-6 text-red-600" />
                    </div>
                    <p className="text-2xl font-bold text-red-600">{results.failed}</p>
                    <p className="text-sm text-slate-500">Failed</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-center gap-3 pt-6 border-t">
              <Button onClick={() => setStep('idle')} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                {syncResults ? 'Sync Again' : 'Import More Data'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}