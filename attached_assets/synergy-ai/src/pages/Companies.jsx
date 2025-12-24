import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Building, Download, Loader2, Search, DollarSign, 
  TrendingUp, Users, Calendar, Globe, FileText, ExternalLink,
  Filter, RefreshCw, Target, AlertCircle
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function Companies() {
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [fundraisingFilter, setFundraisingFilter] = useState('all');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
        
        // Only admin and lead can access this page
        if (!['admin', 'lead'].includes(userData.user_type || userData.user_role)) {
          window.location.href = '/';
        }
      } catch (e) {
        window.location.href = '/';
      }
    };
    loadUser();
  }, []);

  if (!user || !['admin', 'lead'].includes(user.user_type || user.user_role)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-slate-600">Access Denied - Admin/Lead Only</p>
        </div>
      </div>
    );
  }

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.list('-created_date', 10000),
  });

  const importCompaniesMutation = useMutation({
    mutationFn: async (limit) => {
      setImporting(true);
      setImportProgress({ current: 0, total: limit });
      
      const response = await base44.functions.invoke('coresignalCompanies', {
        action: 'importFundraisingCompanies',
        limit: limit
      });

      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['companies']);
      toast.success(`Imported ${data.imported} companies successfully!`);
      setImporting(false);
    },
    onError: (error) => {
      toast.error(`Import failed: ${error.message}`);
      setImporting(false);
    }
  });

  const handleImport = () => {
    importCompaniesMutation.mutate(1000);
  };

  const viewDetails = (company) => {
    setSelectedCompany(company);
    setShowDetailsDialog(true);
  };

  const filteredCompanies = companies.filter(company => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!company.company_name?.toLowerCase().includes(query) &&
          !company.industry?.some(i => i.toLowerCase().includes(query))) {
        return false;
      }
    }
    if (stageFilter !== 'all' && company.funding_stage !== stageFilter) return false;
    if (fundraisingFilter === 'active' && !company.is_fundraising) return false;
    if (fundraisingFilter === 'inactive' && company.is_fundraising) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Fundraising Companies</h1>
          <p className="text-slate-500 mt-1">
            {companies.length} companies • {filteredCompanies.length} shown
          </p>
        </div>
        <Button 
          onClick={handleImport}
          disabled={importing}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          {importing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          Import from Coresignal
        </Button>
      </div>

      {/* Import Progress */}
      {importing && (
        <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
          <CardContent className="py-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              <div>
                <p className="font-medium text-slate-900">Importing companies from Coresignal...</p>
                <p className="text-sm text-slate-600">This may take a few minutes</p>
              </div>
            </div>
            <Progress value={50} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            <SelectItem value="Series A">Series A</SelectItem>
            <SelectItem value="Series B">Series B</SelectItem>
            <SelectItem value="Series C">Series C</SelectItem>
            <SelectItem value="Series D">Series D</SelectItem>
            <SelectItem value="Series E">Series E</SelectItem>
            <SelectItem value="Series F">Series F</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fundraisingFilter} onValueChange={setFundraisingFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Fundraising status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            <SelectItem value="active">Actively Fundraising</SelectItem>
            <SelectItem value="inactive">Not Fundraising</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{filteredCompanies.length}</p>
              <p className="text-xs text-slate-500">Total Companies</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600">
                {filteredCompanies.filter(c => c.is_fundraising).length}
              </p>
              <p className="text-xs text-slate-500">Fundraising Now</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-indigo-600">
                ${(filteredCompanies.reduce((sum, c) => sum + (c.total_funding_raised || 0), 0) / 1000000000).toFixed(1)}B
              </p>
              <p className="text-xs text-slate-500">Total Funding</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">
                ${(filteredCompanies.reduce((sum, c) => sum + (c.valuation || 0), 0) / 1000000000).toFixed(1)}B
              </p>
              <p className="text-xs text-slate-500">Total Valuation</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Companies Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Company</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Valuation</TableHead>
                <TableHead>Total Raised</TableHead>
                <TableHead>Runway</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompanies.map((company) => (
                <TableRow key={company.id} className="cursor-pointer hover:bg-slate-50">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                        <Building className="w-5 h-5 text-slate-500" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{company.company_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {company.industry?.slice(0, 2).map((ind, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {ind}
                            </Badge>
                          ))}
                          {company.location && (
                            <span className="text-xs text-slate-500">{company.location}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-indigo-100 text-indigo-700">
                      {company.funding_stage || 'N/A'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium text-slate-900">
                      {company.valuation ? `$${(company.valuation / 1000000).toFixed(1)}M` : 'N/A'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-slate-700">
                      {company.total_funding_raised ? `$${(company.total_funding_raised / 1000000).toFixed(1)}M` : 'N/A'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {company.cashflow?.runway_months ? (
                      <Badge className={cn(
                        company.cashflow.runway_months < 6 ? "bg-red-100 text-red-700" :
                        company.cashflow.runway_months < 12 ? "bg-amber-100 text-amber-700" :
                        "bg-emerald-100 text-emerald-700"
                      )}>
                        {company.cashflow.runway_months}mo
                      </Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {company.is_fundraising ? (
                      <Badge className="bg-emerald-100 text-emerald-700">
                        <Target className="w-3 h-3 mr-1" />
                        Fundraising
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => viewDetails(company)}
                    >
                      View Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Company Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                <Building className="w-6 h-6 text-slate-600" />
              </div>
              {selectedCompany?.company_name}
            </DialogTitle>
          </DialogHeader>

          {selectedCompany && (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-indigo-50 rounded-lg p-4">
                  <p className="text-xs text-slate-600 mb-1">Valuation</p>
                  <p className="text-xl font-bold text-indigo-900">
                    {selectedCompany.valuation ? `$${(selectedCompany.valuation / 1000000).toFixed(1)}M` : 'N/A'}
                  </p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-4">
                  <p className="text-xs text-slate-600 mb-1">Total Raised</p>
                  <p className="text-xl font-bold text-emerald-900">
                    {selectedCompany.total_funding_raised ? `$${(selectedCompany.total_funding_raised / 1000000).toFixed(1)}M` : 'N/A'}
                  </p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-xs text-slate-600 mb-1">Revenue</p>
                  <p className="text-xl font-bold text-purple-900">
                    {selectedCompany.revenue ? `$${(selectedCompany.revenue / 1000000).toFixed(1)}M` : 'N/A'}
                  </p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4">
                  <p className="text-xs text-slate-600 mb-1">Employees</p>
                  <p className="text-xl font-bold text-amber-900">
                    {selectedCompany.employee_count || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Description */}
              {selectedCompany.description && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">About</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-700">{selectedCompany.description}</p>
                  </CardContent>
                </Card>
              )}

              {/* Cashflow */}
              {selectedCompany.cashflow && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-emerald-600" />
                      Cash Flow Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-slate-600 mb-1">Operating CF</p>
                        <p className="text-lg font-bold text-slate-900">
                          ${(selectedCompany.cashflow.operating_cashflow / 1000000).toFixed(1)}M
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 mb-1">Free CF</p>
                        <p className="text-lg font-bold text-slate-900">
                          ${(selectedCompany.cashflow.free_cashflow / 1000000).toFixed(1)}M
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 mb-1">Burn Rate</p>
                        <p className="text-lg font-bold text-red-600">
                          ${(selectedCompany.cashflow.burn_rate / 1000000).toFixed(1)}M/mo
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 mb-1">Runway</p>
                        <p className={cn("text-lg font-bold",
                          selectedCompany.cashflow.runway_months < 6 ? "text-red-600" :
                          selectedCompany.cashflow.runway_months < 12 ? "text-amber-600" :
                          "text-emerald-600"
                        )}>
                          {selectedCompany.cashflow.runway_months} months
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Debt */}
              {selectedCompany.debt && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-5 h-5 text-amber-600" />
                      Debt Profile
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-slate-600 mb-1">Total Debt</p>
                        <p className="text-lg font-bold text-slate-900">
                          ${(selectedCompany.debt.total_debt / 1000000).toFixed(1)}M
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 mb-1">Debt to Equity</p>
                        <p className="text-lg font-bold text-slate-900">
                          {selectedCompany.debt.debt_to_equity?.toFixed(2) || 'N/A'}
                        </p>
                      </div>
                    </div>
                    {selectedCompany.debt.debt_instruments?.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-slate-600 mb-2">Debt Instruments</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedCompany.debt.debt_instruments.map((inst, i) => (
                            <Badge key={i} variant="outline">{inst}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Funding Rounds */}
              {selectedCompany.funding_rounds?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Funding History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {selectedCompany.funding_rounds.map((round, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge className="bg-indigo-600">{round.round}</Badge>
                              {round.date && (
                                <span className="text-xs text-slate-500">
                                  {new Date(round.date).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            {round.investors?.length > 0 && (
                              <p className="text-xs text-slate-600">
                                Led by: {round.investors.slice(0, 2).join(', ')}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-slate-900">
                              ${(round.amount / 1000000).toFixed(1)}M
                            </p>
                            {round.valuation && (
                              <p className="text-xs text-slate-500">
                                @ ${(round.valuation / 1000000).toFixed(0)}M
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* SEC Filings */}
              {selectedCompany.sec_filings?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-5 h-5 text-slate-600" />
                      SEC Filings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {selectedCompany.sec_filings.map((filing, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                          <div>
                            <Badge variant="outline" className="text-xs">{filing.filing_type}</Badge>
                            <p className="text-xs text-slate-600 mt-1">{filing.description}</p>
                          </div>
                          <span className="text-xs text-slate-500">
                            {new Date(filing.filing_date).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Links */}
              <div className="flex items-center gap-3">
                {selectedCompany.website && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={selectedCompany.website} target="_blank" rel="noopener noreferrer">
                      <Globe className="w-4 h-4 mr-1" />
                      Website
                    </a>
                  </Button>
                )}
                {selectedCompany.linkedin_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={selectedCompany.linkedin_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-1" />
                      LinkedIn
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}