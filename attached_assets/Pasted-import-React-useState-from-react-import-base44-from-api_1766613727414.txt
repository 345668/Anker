import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  AlertTriangle, RefreshCw, Loader2, CheckCircle, X, Eye, 
  Building2, User, Trash2
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function FailedImportsManager() {
  const [retrying, setRetrying] = useState(false);
  const [selectedFailure, setSelectedFailure] = useState(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  const queryClient = useQueryClient();

  const { data: failures = [], isLoading } = useQuery({
    queryKey: ['failed-imports'],
    queryFn: () => base44.entities.FailedImport.filter({ status: 'failed' }, '-created_date', 100),
  });

  const { data: firms = [] } = useQuery({
    queryKey: ['firms'],
    queryFn: () => base44.entities.InvestorFirm.list('company_name', 10000),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.FailedImport.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['failed-imports']);
      toast.success('Failed record removed');
    },
  });

  const retryImport = async (failure) => {
    setRetrying(true);
    try {
      const folkData = failure.folk_data;

      if (failure.record_type === 'company') {
        // Retry firm import
        const firmData = {
          folk_id: folkData.id,
          company_name: folkData.name,
          firm_description: folkData.description,
          industry: folkData.industry,
          foundation_year: folkData.foundationYear,
          employee_range: folkData.employeeRange,
          website: folkData.urls?.[0] || null,
          urls: folkData.urls || [],
          emails: folkData.emails || [],
          phones: folkData.phones || [],
          addresses: folkData.addresses || [],
          linkedin_url: folkData.urls?.find(u => u.includes('linkedin.com')),
          folk_groups: folkData.groups || [],
          folk_custom_fields: folkData.customFieldValues || {},
        };

        await base44.entities.InvestorFirm.create(firmData);
        await base44.entities.FailedImport.update(failure.id, {
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          retry_count: (failure.retry_count || 0) + 1
        });

        queryClient.invalidateQueries(['firms']);
        toast.success(`Successfully imported ${folkData.name}`);
      } else if (failure.record_type === 'person') {
        // Retry contact import
        const fullName = folkData.fullName || `${folkData.firstName || ''} ${folkData.lastName || ''}`.trim();
        
        // Find firm
        const companyName = folkData.companies?.[0]?.name;
        const firm = firms.find(f => f.company_name?.toLowerCase() === companyName?.toLowerCase());

        const contactData = {
          folk_id: folkData.id,
          full_name: fullName,
          first_name: folkData.firstName,
          last_name: folkData.lastName,
          title: folkData.jobTitle,
          bio: folkData.description,
          work_email: folkData.emails?.[0],
          emails: folkData.emails || [],
          primary_phone: folkData.phones?.[0],
          phones: folkData.phones || [],
          linkedin_url: folkData.urls?.find(u => u.includes('linkedin.com')),
          firm_id: firm?.id,
          firm_name: companyName,
          folk_companies: folkData.companies || [],
          folk_groups: folkData.groups || [],
        };

        await base44.entities.Contact.create(contactData);
        await base44.entities.FailedImport.update(failure.id, {
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          retry_count: (failure.retry_count || 0) + 1
        });

        queryClient.invalidateQueries(['contacts']);
        toast.success(`Successfully imported ${fullName}`);
      }

      queryClient.invalidateQueries(['failed-imports']);
    } catch (error) {
      console.error('Retry failed:', error);
      await base44.entities.FailedImport.update(failure.id, {
        retry_count: (failure.retry_count || 0) + 1,
        last_retry_at: new Date().toISOString(),
        error_message: `${failure.error_message}\n\nRetry ${(failure.retry_count || 0) + 1}: ${error.message}`
      });
      toast.error(`Retry failed: ${error.message}`);
    } finally {
      setRetrying(false);
    }
  };

  const retryAll = async () => {
    setRetrying(true);
    toast.info(`Retrying ${failures.length} failed imports...`);

    let successful = 0;
    let failed = 0;

    for (const failure of failures) {
      try {
        await retryImport(failure);
        successful++;
      } catch (error) {
        failed++;
      }
    }

    toast.success(`Retry complete: ${successful} successful, ${failed} still failed`);
    setRetrying(false);
  };

  const viewDetails = (failure) => {
    setSelectedFailure(failure);
    setShowDetailsDialog(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (failures.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
            No Failed Imports
          </CardTitle>
          <CardDescription>
            All records imported successfully
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Failed Imports ({failures.length})
              </CardTitle>
              <CardDescription>
                Records that failed during Folk CRM import
              </CardDescription>
            </div>
            <Button
              onClick={retryAll}
              disabled={retrying || failures.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {retrying ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Retry All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Retries</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failures.map((failure) => {
                  const folkData = failure.folk_data;
                  const name = failure.record_type === 'company' 
                    ? folkData.name 
                    : folkData.fullName || `${folkData.firstName || ''} ${folkData.lastName || ''}`.trim();

                  return (
                    <TableRow key={failure.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {failure.record_type === 'company' ? (
                            <Building2 className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <User className="w-4 h-4 text-emerald-600" />
                          )}
                          <Badge variant="secondary" className="capitalize">
                            {failure.record_type}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-slate-900">{name}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-red-600 line-clamp-1">
                          {failure.error_message}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {failure.retry_count || 0} retries
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-500">
                          {new Date(failure.created_date).toLocaleDateString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => viewDetails(failure)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => retryImport(failure)}
                            disabled={retrying}
                          >
                            <RefreshCw className={cn("w-4 h-4", retrying && "animate-spin")} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(failure.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Failed Import Details</DialogTitle>
          </DialogHeader>

          {selectedFailure && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Error Message</h4>
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{selectedFailure.error_message}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Folk Data</h4>
                <pre className="p-3 bg-slate-50 border rounded-lg text-xs overflow-x-auto">
                  {JSON.stringify(selectedFailure.folk_data, null, 2)}
                </pre>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-1">Import Batch</h4>
                  <p className="text-sm text-slate-600">{selectedFailure.import_batch_id}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-1">Retry Count</h4>
                  <p className="text-sm text-slate-600">{selectedFailure.retry_count || 0}</p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowDetailsDialog(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={() => {
                    retryImport(selectedFailure);
                    setShowDetailsDialog(false);
                  }}
                  disabled={retrying}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry Import
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}