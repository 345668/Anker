import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Search, Loader2, Download, CheckCircle, AlertCircle,
  Building2, Users, RefreshCw
} from 'lucide-react';
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
import { toast } from "sonner";

export default function FolkMissingRecordsFiller() {
  const [scanning, setScanning] = useState(false);
  const [filling, setFilling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [missingRecords, setMissingRecords] = useState({ companies: [], people: [] });
  const [fillResults, setFillResults] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');

  const queryClient = useQueryClient();

  const { data: firms = [] } = useQuery({
    queryKey: ['firms'],
    queryFn: () => base44.entities.InvestorFirm.list('company_name', 10000),
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.list('-created_date', 10000),
  });

  React.useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
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
    }
  };

  const scanForMissing = async () => {
    if (!selectedGroup) {
      toast.error('Please select a Folk group');
      return;
    }

    setScanning(true);
    setProgress(0);
    toast.info('Scanning Folk CRM for missing records...');

    try {
      // Fetch all data from Folk
      const { data: result } = await base44.functions.invoke('folkApi', {
        action: 'fetchGroupData',
        groupName: selectedGroup
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch data from Folk');
      }

      const { companies, people } = result;
      setProgress(50);

      // Build lookup maps for existing records
      const existingFirmFolkIds = new Set(firms.filter(f => f.folk_id).map(f => f.folk_id));
      const existingContactFolkIds = new Set(contacts.filter(c => c.folk_id).map(c => c.folk_id));

      // Find missing companies
      const missingCompanies = companies.filter(company => 
        company.id && !existingFirmFolkIds.has(company.id)
      );

      // Find missing people
      const missingPeople = people.filter(person => 
        person.id && !existingContactFolkIds.has(person.id)
      );

      setProgress(100);
      setMissingRecords({ companies: missingCompanies, people: missingPeople });
      
      toast.success(
        `Found ${missingCompanies.length} missing firms and ${missingPeople.length} missing contacts`
      );
    } catch (error) {
      console.error('Scan error:', error);
      toast.error(`Scan failed: ${error.message}`);
    } finally {
      setScanning(false);
    }
  };

  const fillMissingRecords = async () => {
    setFilling(true);
    setProgress(0);
    setFillResults(null);
    toast.info('Importing missing records from Folk...');

    let firmsCreated = 0;
    let contactsCreated = 0;
    let failed = 0;
    const failures = [];

    const totalItems = missingRecords.companies.length + missingRecords.people.length;
    let processedItems = 0;

    try {
      // Create lookup for firm matching
      const firmsByName = firms.reduce((acc, f) => {
        acc[f.company_name?.toLowerCase().trim()] = f.id;
        return acc;
      }, {});

      // Import missing companies
      for (const company of missingRecords.companies) {
        try {
          const firmData = {
            folk_id: company.id,
            company_name: company.name,
            firm_description: company.description,
            industry: company.industry,
            foundation_year: company.foundationYear,
            employee_range: company.employeeRange,
            website: company.urls?.[0] || null,
            urls: company.urls || [],
            emails: company.emails || [],
            phones: company.phones || [],
            addresses: company.addresses || [],
            linkedin_url: company.urls?.find(u => u.includes('linkedin.com')),
            folk_groups: company.groups || [],
            folk_custom_fields: company.customFieldValues || {},
            folk_created_at: company.createdAt,
          };

          const newFirm = await base44.entities.InvestorFirm.create(firmData);
          firmsByName[company.name.toLowerCase().trim()] = newFirm.id;
          firmsCreated++;
        } catch (error) {
          console.error('Firm import error:', company.name, error);
          failed++;
          failures.push({
            folk_id: company.id,
            record_type: 'company',
            folk_data: company,
            error_message: error.message,
            import_batch_id: `fill_${Date.now()}`
          });
        }

        processedItems++;
        setProgress(Math.round((processedItems / totalItems) * 100));
      }

      // Import missing people
      for (const person of missingRecords.people) {
        try {
          const fullName = person.fullName || `${person.firstName || ''} ${person.lastName || ''}`.trim();
          const companyName = person.companies?.[0]?.name;
          const firmId = companyName ? firmsByName[companyName.toLowerCase().trim()] : undefined;

          const contactData = {
            folk_id: person.id,
            full_name: fullName,
            first_name: person.firstName,
            last_name: person.lastName,
            title: person.jobTitle,
            bio: person.description,
            work_email: person.emails?.[0],
            emails: person.emails || [],
            primary_phone: person.phones?.[0],
            phones: person.phones || [],
            linkedin_url: person.urls?.find(u => u.includes('linkedin.com')),
            firm_id: firmId,
            firm_name: companyName,
            folk_companies: person.companies || [],
            folk_groups: person.groups || [],
            folk_created_at: person.createdAt,
          };

          await base44.entities.Contact.create(contactData);
          contactsCreated++;
        } catch (error) {
          console.error('Contact import error:', person.fullName, error);
          failed++;
          failures.push({
            folk_id: person.id,
            record_type: 'person',
            folk_data: person,
            error_message: error.message,
            import_batch_id: `fill_${Date.now()}`
          });
        }

        processedItems++;
        setProgress(Math.round((processedItems / totalItems) * 100));
      }

      // Save failures to database
      if (failures.length > 0) {
        await base44.entities.FailedImport.bulkCreate(failures);
      }

      queryClient.invalidateQueries(['firms']);
      queryClient.invalidateQueries(['contacts']);
      queryClient.invalidateQueries(['failed-imports']);

      setFillResults({ firms: firmsCreated, contacts: contactsCreated, failed });
      toast.success(
        `Filled ${firmsCreated} firms and ${contactsCreated} contacts. ${failed} failed.`
      );
    } catch (error) {
      console.error('Fill error:', error);
      toast.error(`Fill failed: ${error.message}`);
    } finally {
      setFilling(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-indigo-600" />
            Fill Missing Records from Folk
          </CardTitle>
          <CardDescription>
            Scan Folk CRM for records not yet in your database and import them
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Select Folk Group
            </label>
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              disabled={scanning || filling}
            >
              {groups.map((group) => (
                <option key={group.id} value={group.name}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          {!missingRecords.companies.length && !missingRecords.people.length && (
            <div className="text-center py-6">
              <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 mb-4">
                Scan Folk CRM to find records missing from your database
              </p>
              <Button
                onClick={scanForMissing}
                disabled={scanning || !selectedGroup}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {scanning ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 mr-2" />
                )}
                Scan for Missing Records
              </Button>
            </div>
          )}

          {scanning && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Scanning...</span>
                <span className="font-medium text-slate-900">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {(missingRecords.companies.length > 0 || missingRecords.people.length > 0) && !fillResults && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-indigo-50 rounded-lg border-2 border-indigo-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-5 h-5 text-indigo-600" />
                    <span className="text-sm font-medium text-slate-700">Missing Firms</span>
                  </div>
                  <p className="text-3xl font-bold text-indigo-600">
                    {missingRecords.companies.length}
                  </p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-lg border-2 border-emerald-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm font-medium text-slate-700">Missing Contacts</span>
                  </div>
                  <p className="text-3xl font-bold text-emerald-600">
                    {missingRecords.people.length}
                  </p>
                </div>
              </div>

              {filling && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Importing...</span>
                    <span className="font-medium text-slate-900">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              <div className="flex justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => setMissingRecords({ companies: [], people: [] })}
                  disabled={filling}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Scan Again
                </Button>
                <Button
                  onClick={fillMissingRecords}
                  disabled={filling}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {filling ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Import Missing Records
                </Button>
              </div>
            </div>
          )}

          {fillResults && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-8 py-4">
                <div className="text-center">
                  <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-emerald-600">{fillResults.firms}</p>
                  <p className="text-sm text-slate-500">Firms Added</p>
                </div>
                <div className="text-center">
                  <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-emerald-600">{fillResults.contacts}</p>
                  <p className="text-sm text-slate-500">Contacts Added</p>
                </div>
                {fillResults.failed > 0 && (
                  <div className="text-center">
                    <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-red-600">{fillResults.failed}</p>
                    <p className="text-sm text-slate-500">Failed</p>
                  </div>
                )}
              </div>

              <div className="flex justify-center">
                <Button
                  onClick={() => {
                    setMissingRecords({ companies: [], people: [] });
                    setFillResults(null);
                  }}
                  variant="outline"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Scan Again
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}