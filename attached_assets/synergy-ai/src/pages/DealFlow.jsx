import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Briefcase, Plus, Loader2, Search, Filter, DollarSign,
  Edit, Trash2, Building2, TrendingUp, Calendar, FileText,
  Upload, X, MoreHorizontal, Eye, CheckCircle, Sparkles, LayoutGrid, List
} from 'lucide-react';
import AIDealSourcing from '@/components/dealflow/AIDealSourcing';
import DealPipeline from '@/components/dealflow/DealPipeline';
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

const dealStages = ['Initial Contact', 'First Meeting', 'Due Diligence', 'Term Sheet', 'Legal Review', 'Closing', 'Closed', 'Passed'];
const dealStatuses = ['Active', 'On Hold', 'Won', 'Lost', 'Closed'];
const dealTypes = ['Equity', 'SAFE', 'Convertible Note', 'Debt', 'Revenue Share', 'Other'];

const stageColors = {
  'Initial Contact': 'bg-slate-100 text-slate-800',
  'First Meeting': 'bg-blue-100 text-blue-800',
  'Due Diligence': 'bg-amber-100 text-amber-800',
  'Term Sheet': 'bg-purple-100 text-purple-800',
  'Legal Review': 'bg-indigo-100 text-indigo-800',
  'Closing': 'bg-emerald-100 text-emerald-800',
  'Closed': 'bg-green-100 text-green-800',
  'Passed': 'bg-red-100 text-red-800',
};

const statusColors = {
  'Active': 'bg-blue-100 text-blue-800',
  'On Hold': 'bg-amber-100 text-amber-800',
  'Won': 'bg-emerald-100 text-emerald-800',
  'Lost': 'bg-red-100 text-red-800',
  'Closed': 'bg-slate-100 text-slate-800',
};

export default function DealFlow() {
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showDialog, setShowDialog] = useState(false);
  const [editingDeal, setEditingDeal] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [showAISourcing, setShowAISourcing] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'pipeline'
  const [formData, setFormData] = useState({
    deal_name: '',
    firm_id: '',
    deal_stage: 'Initial Contact',
    expected_amount: '',
    actual_amount: '',
    valuation: '',
    deal_type: 'Equity',
    status: 'Active',
    probability: '',
    notes: '',
    next_action: '',
    next_action_date: '',
    expected_close_date: '',
    deal_source: '',
  });

  const queryClient = useQueryClient();

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ['deals'],
    queryFn: () => base44.entities.InvestmentDeal.list('-created_date', 500),
  });

  const { data: firms = [] } = useQuery({
    queryKey: ['firms'],
    queryFn: () => base44.entities.InvestorFirm.list('company_name', 500),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.InvestmentDeal.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['deals']);
      setShowDialog(false);
      resetForm();
      toast.success('Deal created successfully');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.InvestmentDeal.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['deals']);
      setShowDialog(false);
      resetForm();
      toast.success('Deal updated successfully');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.InvestmentDeal.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['deals']);
      toast.success('Deal deleted successfully');
    },
  });

  const resetForm = () => {
    setFormData({
      deal_name: '',
      firm_id: '',
      deal_stage: 'Initial Contact',
      expected_amount: '',
      actual_amount: '',
      valuation: '',
      deal_type: 'Equity',
      status: 'Active',
      probability: '',
      notes: '',
      next_action: '',
      next_action_date: '',
      expected_close_date: '',
      deal_source: '',
    });
    setEditingDeal(null);
  };

  const handleEdit = (deal) => {
    setEditingDeal(deal);
    setFormData({
      deal_name: deal.deal_name || '',
      firm_id: deal.firm_id || '',
      deal_stage: deal.deal_stage || 'Initial Contact',
      expected_amount: deal.expected_amount || '',
      actual_amount: deal.actual_amount || '',
      valuation: deal.valuation || '',
      deal_type: deal.deal_type || 'Equity',
      status: deal.status || 'Active',
      probability: deal.probability || '',
      notes: deal.notes || '',
      next_action: deal.next_action || '',
      next_action_date: deal.next_action_date || '',
      expected_close_date: deal.expected_close_date || '',
      deal_source: deal.deal_source || '',
    });
    setShowDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const selectedFirm = firms.find(f => f.id === formData.firm_id);
    
    const data = {
      ...formData,
      firm_name: selectedFirm?.company_name,
      expected_amount: formData.expected_amount ? Number(formData.expected_amount) : undefined,
      actual_amount: formData.actual_amount ? Number(formData.actual_amount) : undefined,
      valuation: formData.valuation ? Number(formData.valuation) : undefined,
      probability: formData.probability ? Number(formData.probability) : undefined,
    };

    if (editingDeal) {
      updateMutation.mutate({ id: editingDeal.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleFileUpload = async (dealId, file) => {
    setUploadingDoc(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      const deal = deals.find(d => d.id === dealId);
      const updatedDocuments = [
        ...(deal.documents || []),
        {
          name: file.name,
          url: file_url,
          type: file.type,
          uploaded_at: new Date().toISOString(),
        }
      ];

      await base44.entities.InvestmentDeal.update(dealId, {
        documents: updatedDocuments,
        document_urls: [...(deal.document_urls || []), file_url]
      });

      queryClient.invalidateQueries(['deals']);
      toast.success('Document uploaded successfully');
    } catch (error) {
      toast.error('Failed to upload document');
    } finally {
      setUploadingDoc(false);
    }
  };

  const filteredDeals = deals.filter(deal => {
    if (stageFilter !== 'all' && deal.deal_stage !== stageFilter) return false;
    if (statusFilter !== 'all' && deal.status !== statusFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!deal.deal_name?.toLowerCase().includes(query) &&
          !deal.firm_name?.toLowerCase().includes(query)) {
        return false;
      }
    }
    return true;
  });

  const totalValue = filteredDeals.reduce((sum, deal) => sum + (deal.expected_amount || 0), 0);
  const avgProbability = filteredDeals.length > 0 
    ? filteredDeals.reduce((sum, deal) => sum + (deal.probability || 0), 0) / filteredDeals.length 
    : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Deal Flow</h1>
          <p className="text-slate-500 mt-1">Track and manage investment deals</p>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-slate-100 rounded-lg p-1">
            <Button 
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              className={viewMode === 'table' ? '' : 'hover:bg-slate-200'}
            >
              <List className="w-4 h-4 mr-2" />
              Table
            </Button>
            <Button 
              variant={viewMode === 'pipeline' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('pipeline')}
              className={viewMode === 'pipeline' ? '' : 'hover:bg-slate-200'}
            >
              <LayoutGrid className="w-4 h-4 mr-2" />
              Pipeline
            </Button>
          </div>
          <Button 
            variant="outline"
            onClick={() => setShowAISourcing(!showAISourcing)}
            className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            AI Deal Sourcing
          </Button>
          <Button 
            onClick={() => { resetForm(); setShowDialog(true); }}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Deal
          </Button>
        </div>
      </div>

      {/* AI Deal Sourcing */}
      {showAISourcing && (
        <AIDealSourcing 
          firms={firms}
          onLeadsGenerated={() => queryClient.invalidateQueries(['deal-leads'])}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-500">Total Deals</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{filteredDeals.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-500">Total Value</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            ${(totalValue / 1000000).toFixed(1)}M
          </p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-500">Avg Probability</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{avgProbability.toFixed(0)}%</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-500">Active</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {filteredDeals.filter(d => d.status === 'Active').length}
          </p>
        </div>
      </div>

      {/* Filters - Only show for table view */}
      {viewMode === 'table' && (
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search deals..."
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
              {dealStages.map((stage) => (
                <SelectItem key={stage} value={stage}>{stage}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {dealStatuses.map((status) => (
                <SelectItem key={status} value={status}>{status}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Pipeline View */}
      {viewMode === 'pipeline' && (
        <DealPipeline 
          deals={filteredDeals}
          onViewDeal={(deal) => console.log('View', deal)}
          onEditDeal={handleEdit}
          onDeleteDeal={(id) => deleteMutation.mutate(id)}
        />
      )}

      {/* Table View */}
      {viewMode === 'table' && (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Deal Name</TableHead>
              <TableHead>Firm</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expected Amount</TableHead>
              <TableHead>Probability</TableHead>
              <TableHead>Next Action</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDeals.map((deal) => (
              <TableRow key={deal.id} className="group">
                <TableCell>
                  <div>
                    <p className="font-medium text-slate-900">{deal.deal_name}</p>
                    {deal.deal_type && (
                      <p className="text-xs text-slate-500">{deal.deal_type}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-400" />
                    {deal.firm_name || 'Unknown'}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={stageColors[deal.deal_stage] || 'bg-slate-100 text-slate-800'}>
                    {deal.deal_stage}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={statusColors[deal.status] || 'bg-slate-100 text-slate-800'}>
                    {deal.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {deal.expected_amount ? (
                    <span className="font-medium">
                      ${(deal.expected_amount / 1000000).toFixed(1)}M
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {deal.probability ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-200 rounded-full h-2 max-w-[60px]">
                        <div 
                          className="bg-indigo-600 h-2 rounded-full"
                          style={{ width: `${deal.probability}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium">{deal.probability}%</span>
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {deal.next_action ? (
                    <div className="text-xs">
                      <p className="text-slate-700 truncate max-w-[150px]">{deal.next_action}</p>
                      {deal.next_action_date && (
                        <p className="text-slate-500">
                          {new Date(deal.next_action_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(deal)}>
                        <Edit className="w-4 h-4 mr-2" />
                        Edit Deal
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <label className="cursor-pointer">
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Document
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => e.target.files?.[0] && handleFileUpload(deal.id, e.target.files[0])}
                            disabled={uploadingDoc}
                          />
                        </label>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => deleteMutation.mutate(deal.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDeal ? 'Edit Deal' : 'Add Deal'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Deal Name *</Label>
                <Input
                  value={formData.deal_name}
                  onChange={(e) => setFormData({ ...formData, deal_name: e.target.value })}
                  required
                  placeholder="Series A Investment"
                />
              </div>
              <div className="space-y-2">
                <Label>Investor Firm *</Label>
                <Select
                  value={formData.firm_id}
                  onValueChange={(value) => setFormData({ ...formData, firm_id: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select firm" />
                  </SelectTrigger>
                  <SelectContent>
                    {firms.map((firm) => (
                      <SelectItem key={firm.id} value={firm.id}>
                        {firm.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Deal Stage</Label>
                <Select
                  value={formData.deal_stage}
                  onValueChange={(value) => setFormData({ ...formData, deal_stage: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dealStages.map((stage) => (
                      <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dealStatuses.map((status) => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Deal Type</Label>
                <Select
                  value={formData.deal_type}
                  onValueChange={(value) => setFormData({ ...formData, deal_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dealTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Expected Amount ($)</Label>
                <Input
                  type="number"
                  value={formData.expected_amount}
                  onChange={(e) => setFormData({ ...formData, expected_amount: e.target.value })}
                  placeholder="1000000"
                />
              </div>
              <div className="space-y-2">
                <Label>Valuation ($)</Label>
                <Input
                  type="number"
                  value={formData.valuation}
                  onChange={(e) => setFormData({ ...formData, valuation: e.target.value })}
                  placeholder="10000000"
                />
              </div>
              <div className="space-y-2">
                <Label>Probability (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.probability}
                  onChange={(e) => setFormData({ ...formData, probability: e.target.value })}
                  placeholder="50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Expected Close Date</Label>
                <Input
                  type="date"
                  value={formData.expected_close_date}
                  onChange={(e) => setFormData({ ...formData, expected_close_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Deal Source</Label>
                <Input
                  value={formData.deal_source}
                  onChange={(e) => setFormData({ ...formData, deal_source: e.target.value })}
                  placeholder="Referral, Conference, etc."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Next Action</Label>
                <Input
                  value={formData.next_action}
                  onChange={(e) => setFormData({ ...formData, next_action: e.target.value })}
                  placeholder="Schedule follow-up call"
                />
              </div>
              <div className="space-y-2">
                <Label>Next Action Date</Label>
                <Input
                  type="date"
                  value={formData.next_action_date}
                  onChange={(e) => setFormData({ ...formData, next_action_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={4}
                placeholder="Internal notes about this deal..."
              />
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
                {editingDeal ? 'Save Changes' : 'Create Deal'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}