import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Upload, FileText, Eye, Download, Trash2, Loader2, 
  Lock, Unlock, Sparkles, TrendingUp, AlertCircle
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const documentCategories = {
  'Company & Corporate': [
    'Articles of Incorporation',
    'Cap Table',
    'Shareholder Register',
    'Financing History',
    'Board Minutes',
    'Shareholders Agreement',
    'Group Structure Chart'
  ],
  'Product & Technology': [
    'Product Demo',
    'Architecture Diagrams',
    'Tech Stack Overview',
    'API Documentation',
    'Security Reports',
    'IP Portfolio',
    'IP Assignments'
  ],
  'Market & GTM': [
    'Market Analysis',
    'Competitive Landscape',
    'Pricing Model',
    'Sales Process',
    'GTM Strategy'
  ],
  'Traction & Metrics': [
    'KPI Dashboard',
    'Revenue Reports',
    'User Metrics',
    'Cohort Analysis',
    'Unit Economics',
    'Pipeline Reports'
  ],
  'Financials': [
    'Income Statement',
    'Balance Sheet',
    'Cash Flow Statement',
    'Financial Model',
    'Tax Returns',
    'Bank Statements',
    'Management Accounts'
  ],
  'Legal & Compliance': [
    'Customer Contracts',
    'Vendor Agreements',
    'Debt Obligations',
    'Licenses & Permits',
    'Litigation Documents',
    'Insurance Policies'
  ],
  'HR & Team': [
    'Org Chart',
    'Employment Agreements',
    'ESOP Documentation',
    'Consultant Agreements',
    'HR Policies'
  ],
  'KYC & Compliance': [
    'UBO Declaration',
    'Director IDs',
    'Proof of Address',
    'AML Screening',
    'Risk Assessment',
    'Compliance Reports'
  ]
};

const stageChecklists = {
  'Pre-seed': [
    'Articles of Incorporation',
    'Cap Table',
    'Pitch Deck',
    'Product Demo',
    'Financial Model'
  ],
  'Seed': [
    'Articles of Incorporation',
    'Cap Table',
    'Shareholder Register',
    'Financing History',
    'Product Demo',
    'Tech Stack Overview',
    'Market Analysis',
    'KPI Dashboard',
    'Financial Model',
    'IP Assignments'
  ],
  'Series A': [
    'Articles of Incorporation',
    'Cap Table',
    'Shareholder Register',
    'Financing History',
    'Board Minutes',
    'Shareholders Agreement',
    'Product Demo',
    'Tech Stack Overview',
    'IP Portfolio',
    'Market Analysis',
    'Competitive Landscape',
    'KPI Dashboard',
    'Revenue Reports',
    'Unit Economics',
    'Income Statement',
    'Balance Sheet',
    'Cash Flow Statement',
    'Financial Model',
    'Customer Contracts',
    'Employment Agreements',
    'ESOP Documentation'
  ],
  'Series B+': [
    'Articles of Incorporation',
    'Cap Table',
    'Shareholder Register',
    'Financing History',
    'Board Minutes',
    'Shareholders Agreement',
    'Group Structure Chart',
    'Product Demo',
    'Architecture Diagrams',
    'Tech Stack Overview',
    'API Documentation',
    'Security Reports',
    'IP Portfolio',
    'IP Assignments',
    'Market Analysis',
    'Competitive Landscape',
    'Pricing Model',
    'Sales Process',
    'KPI Dashboard',
    'Revenue Reports',
    'User Metrics',
    'Cohort Analysis',
    'Unit Economics',
    'Pipeline Reports',
    'Income Statement',
    'Balance Sheet',
    'Cash Flow Statement',
    'Financial Model',
    'Tax Returns',
    'Bank Statements',
    'Management Accounts',
    'Customer Contracts',
    'Vendor Agreements',
    'Debt Obligations',
    'Licenses & Permits',
    'Org Chart',
    'Employment Agreements',
    'ESOP Documentation',
    'HR Policies',
    'UBO Declaration',
    'Director IDs',
    'AML Screening'
  ]
};

export default function FinancialDataRoom({ dealRoom, startup }) {
  const [documents, setDocuments] = useState(dealRoom.financial_documents || []);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSection, setSelectedSection] = useState('Company & Corporate');
  const [viewMode, setViewMode] = useState('upload'); // 'upload', 'checklist', 'templates'
  const queryClient = useQueryClient();

  const updateDealRoomMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DealRoom.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(['dealRoom']),
  });

  const handleFileUpload = async (e, category, section) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadedDocs = [];
      
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        uploadedDocs.push({
          id: Date.now() + Math.random(),
          name: file.name,
          url: file_url,
          category: category || 'Other',
          section: section || 'Other',
          uploadedAt: new Date().toISOString(),
          uploadedBy: (await base44.auth.me()).email,
          size: file.size,
          restricted: false,
          views: []
        });
      }
      
      const updatedDocs = [...documents, ...uploadedDocs];
      setDocuments(updatedDocs);
      
      await updateDealRoomMutation.mutateAsync({
        id: dealRoom.id,
        data: { financial_documents: updatedDocs }
      });

      toast.success(`${files.length} document${files.length > 1 ? 's' : ''} uploaded`);
    } catch (error) {
      console.error('Error uploading:', error);
      toast.error('Failed to upload documents');
    } finally {
      setUploading(false);
    }
  };

  const toggleRestriction = async (docId) => {
    const updatedDocs = documents.map(doc => 
      doc.id === docId ? { ...doc, restricted: !doc.restricted } : doc
    );
    setDocuments(updatedDocs);
    
    await updateDealRoomMutation.mutateAsync({
      id: dealRoom.id,
      data: { financial_documents: updatedDocs }
    });
  };

  const removeDocument = async (docId) => {
    const updatedDocs = documents.filter(d => d.id !== docId);
    setDocuments(updatedDocs);
    
    await updateDealRoomMutation.mutateAsync({
      id: dealRoom.id,
      data: { financial_documents: updatedDocs }
    });
    
    toast.success('Document removed');
  };

  const analyzeFinancials = async () => {
    if (documents.length === 0) {
      toast.error('Upload financial documents first');
      return;
    }

    setAnalyzing(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze the financial health and metrics from these documents.

Startup: ${startup?.company_name}
Stage: ${startup?.stage}
Current Revenue: $${startup?.revenue || 0}

Documents Available:
${documents.map(d => `- ${d.category}: ${d.name}`).join('\n')}

Provide comprehensive financial analysis:
1. FINANCIAL HEALTH SCORE (0-100)
2. KEY METRICS - Revenue, burn rate, runway, growth
3. STRENGTHS - What looks good financially
4. CONCERNS - Red flags or areas of concern
5. INVESTOR READINESS - Are financials ready for due diligence?
6. MISSING DOCUMENTS - What else should be provided
7. RECOMMENDATIONS - Actions to strengthen financial position

Be specific and actionable.`,
        file_urls: documents.slice(0, 5).map(d => d.url),
        response_json_schema: {
          type: 'object',
          properties: {
            health_score: { type: 'number' },
            health_summary: { type: 'string' },
            key_metrics: {
              type: 'object',
              properties: {
                revenue: { type: 'string' },
                burn_rate: { type: 'string' },
                runway_months: { type: 'string' },
                growth_rate: { type: 'string' },
                gross_margin: { type: 'string' }
              }
            },
            strengths: { type: 'array', items: { type: 'string' } },
            concerns: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  concern: { type: 'string' },
                  severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                  recommendation: { type: 'string' }
                }
              }
            },
            investor_readiness: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['ready', 'needs_work', 'not_ready'] },
                explanation: { type: 'string' }
              }
            },
            missing_documents: { type: 'array', items: { type: 'string' } },
            recommendations: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      setAnalysis(result);
      toast.success('Financial analysis complete!');
    } catch (error) {
      console.error('Error analyzing:', error);
      toast.error('Failed to analyze financials');
    } finally {
      setAnalyzing(false);
    }
  };

  const filteredDocs = selectedCategory === 'all' 
    ? documents 
    : documents.filter(d => d.category === selectedCategory);

  const docsBySection = Object.keys(documentCategories).reduce((acc, section) => {
    acc[section] = documents.filter(d => d.section === section);
    return acc;
  }, {});

  const currentStageChecklist = stageChecklists[startup?.stage] || stageChecklists['Seed'];
  const uploadedDocTypes = documents.map(d => d.category);
  const missingDocs = currentStageChecklist.filter(doc => !uploadedDocTypes.includes(doc));
  const completionRate = ((currentStageChecklist.length - missingDocs.length) / currentStageChecklist.length * 100).toFixed(0);
  
  const allCategories = Object.values(documentCategories).flat();

  const readinessConfig = {
    ready: { color: 'bg-emerald-100 text-emerald-700 border-emerald-300', label: 'Ready for Due Diligence' },
    needs_work: { color: 'bg-amber-100 text-amber-700 border-amber-300', label: 'Needs Improvement' },
    not_ready: { color: 'bg-red-100 text-red-700 border-red-300', label: 'Not Ready' }
  };

  return (
    <div className="space-y-6">
      {/* View Mode Tabs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Data Room</CardTitle>
              <CardDescription>
                Comprehensive due diligence document repository
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'upload' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('upload')}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </Button>
              <Button
                variant={viewMode === 'checklist' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('checklist')}
              >
                <FileText className="w-4 h-4 mr-2" />
                Checklist
              </Button>
              <Button
                variant={viewMode === 'templates' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('templates')}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Templates
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Progress Overview */}
      <Card className="bg-gradient-to-br from-indigo-50 to-violet-50 border-indigo-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-indigo-900">
                {startup?.stage || 'Seed'} Stage Readiness
              </p>
              <p className="text-xs text-indigo-700 mt-1">
                {currentStageChecklist.length - missingDocs.length} of {currentStageChecklist.length} required documents
              </p>
            </div>
            <div className="text-3xl font-bold text-indigo-900">{completionRate}%</div>
          </div>
          <div className="h-2 bg-indigo-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-600 transition-all"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Upload Mode */}
      {viewMode === 'upload' && (
        <>
          {/* Section Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {Object.keys(documentCategories).map((section) => (
              <Button
                key={section}
                variant={selectedSection === section ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedSection(section)}
                className="whitespace-nowrap"
              >
                {section}
                <Badge className="ml-2" variant="secondary">
                  {docsBySection[section]?.length || 0}
                </Badge>
              </Button>
            ))}
          </div>

          {/* Upload Grid for Selected Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{selectedSection}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {documentCategories[selectedSection]?.map((category) => (
                  <div key={category} className="border-2 border-dashed rounded-lg p-3 text-center hover:border-indigo-300 transition-colors">
                    <label htmlFor={`upload-${category}`} className="cursor-pointer">
                      <FileText className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                      <p className="text-xs font-medium text-slate-700 mb-1">{category}</p>
                      <Badge variant="outline" className="text-xs">
                        {documents.filter(d => d.category === category).length} files
                      </Badge>
                      <input
                        id={`upload-${category}`}
                        type="file"
                        multiple
                        accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.png,.jpg"
                        onChange={(e) => handleFileUpload(e, category, selectedSection)}
                        className="hidden"
                        disabled={uploading}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Checklist Mode */}
      {viewMode === 'checklist' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {startup?.stage || 'Seed'} Stage Required Documents
            </CardTitle>
            <CardDescription>
              Essential documents for investor due diligence at your stage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {currentStageChecklist.map((docType) => {
                const hasDoc = uploadedDocTypes.includes(docType);
                return (
                  <div key={docType} className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    hasDoc ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"
                  )}>
                    <div className="flex items-center gap-3">
                      {hasDoc ? (
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <div className="w-5 h-5 border-2 border-slate-300 rounded-full" />
                      )}
                      <span className={cn(
                        "text-sm",
                        hasDoc ? "text-emerald-900 font-medium" : "text-slate-700"
                      )}>
                        {docType}
                      </span>
                    </div>
                    {!hasDoc && (
                      <label htmlFor={`checklist-upload-${docType}`}>
                        <Button size="sm" variant="outline" asChild>
                          <span className="cursor-pointer">
                            <Upload className="w-3 h-3 mr-2" />
                            Upload
                          </span>
                        </Button>
                        <input
                          id={`checklist-upload-${docType}`}
                          type="file"
                          multiple
                          accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.png,.jpg"
                          onChange={(e) => {
                            const section = Object.keys(documentCategories).find(s => 
                              documentCategories[s].includes(docType)
                            );
                            handleFileUpload(e, docType, section);
                          }}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Templates Mode */}
      {viewMode === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Investment Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { name: 'SAFE Agreement Template', desc: 'Simple Agreement for Future Equity' },
                  { name: 'Convertible Note Template', desc: 'Standard convertible note terms' },
                  { name: 'Term Sheet Template', desc: 'Investment term sheet outline' },
                  { name: 'NDA Template', desc: 'Mutual non-disclosure agreement' }
                ].map((template) => (
                  <div key={template.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{template.name}</p>
                      <p className="text-xs text-slate-500">{template.desc}</p>
                    </div>
                    <Button size="sm" variant="outline">
                      <Download className="w-3 h-3 mr-2" />
                      Get
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Corporate Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { name: 'Cap Table Template', desc: 'Equity ownership spreadsheet' },
                  { name: 'Board Resolution Template', desc: 'Standard board resolution format' },
                  { name: 'Shareholders Agreement', desc: 'Basic shareholders agreement' },
                  { name: 'ESOP Plan Template', desc: 'Employee stock option plan' }
                ].map((template) => (
                  <div key={template.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{template.name}</p>
                      <p className="text-xs text-slate-500">{template.desc}</p>
                    </div>
                    <Button size="sm" variant="outline">
                      <Download className="w-3 h-3 mr-2" />
                      Get
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Financial Templates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { name: 'Financial Model Template', desc: '3-5 year projection model' },
                  { name: 'Unit Economics Calculator', desc: 'LTV, CAC, payback calculator' },
                  { name: 'Burn Rate Tracker', desc: 'Monthly cash burn tracking' },
                  { name: 'KPI Dashboard Template', desc: 'Key metrics dashboard' }
                ].map((template) => (
                  <div key={template.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{template.name}</p>
                      <p className="text-xs text-slate-500">{template.desc}</p>
                    </div>
                    <Button size="sm" variant="outline">
                      <Download className="w-3 h-3 mr-2" />
                      Get
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Compliance & KYC</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { name: 'UBO Declaration Form', desc: 'Ultimate beneficial owner declaration' },
                  { name: 'AML Checklist', desc: 'Anti-money laundering compliance' },
                  { name: 'Data Protection Policy', desc: 'GDPR-compliant policy template' },
                  { name: 'Risk Assessment Form', desc: 'Investor risk assessment' }
                ].map((template) => (
                  <div key={template.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{template.name}</p>
                      <p className="text-xs text-slate-500">{template.desc}</p>
                    </div>
                    <Button size="sm" variant="outline">
                      <Download className="w-3 h-3 mr-2" />
                      Get
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* AI Analysis Results */}
      {analysis && (
        <div className="space-y-4">
          {/* Health Score & Readiness */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Financial Health Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-3">
                  <div className="text-3xl font-bold text-slate-900">{analysis.health_score}</div>
                  <div className="flex-1">
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full transition-all",
                          analysis.health_score >= 70 ? "bg-emerald-500" :
                          analysis.health_score >= 40 ? "bg-amber-500" : "bg-red-500"
                        )}
                        style={{ width: `${analysis.health_score}%` }}
                      />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-600">{analysis.health_summary}</p>
              </CardContent>
            </Card>

            <Card className={cn("border-2", readinessConfig[analysis.investor_readiness?.status]?.color)}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Investor Readiness</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge className={readinessConfig[analysis.investor_readiness?.status]?.color}>
                  {readinessConfig[analysis.investor_readiness?.status]?.label}
                </Badge>
                <p className="text-xs mt-2">{analysis.investor_readiness?.explanation}</p>
              </CardContent>
            </Card>
          </div>

          {/* Key Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
                Key Financial Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Revenue</p>
                  <p className="text-lg font-semibold text-slate-900">{analysis.key_metrics?.revenue}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Burn Rate</p>
                  <p className="text-lg font-semibold text-slate-900">{analysis.key_metrics?.burn_rate}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Runway</p>
                  <p className="text-lg font-semibold text-slate-900">{analysis.key_metrics?.runway_months}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Growth Rate</p>
                  <p className="text-lg font-semibold text-emerald-600">{analysis.key_metrics?.growth_rate}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Gross Margin</p>
                  <p className="text-lg font-semibold text-slate-900">{analysis.key_metrics?.gross_margin}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Strengths & Concerns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-emerald-200 bg-emerald-50">
              <CardHeader>
                <CardTitle className="text-sm text-emerald-900">Financial Strengths</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {analysis.strengths?.map((strength, i) => (
                    <li key={i} className="text-xs text-emerald-800 flex items-start gap-2">
                      <span className="text-emerald-600">✓</span>
                      {strength}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="text-sm text-red-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Areas of Concern
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analysis.concerns?.map((concern, i) => (
                    <div key={i} className="bg-white rounded p-2 border border-red-200">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-red-800">{concern.concern}</p>
                        <Badge className={cn(
                          "text-xs",
                          concern.severity === 'high' && "bg-red-200 text-red-800",
                          concern.severity === 'medium' && "bg-amber-200 text-amber-800",
                          concern.severity === 'low' && "bg-blue-200 text-blue-800"
                        )}>
                          {concern.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-red-700">{concern.recommendation}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Missing Documents */}
          {analysis.missing_documents?.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader>
                <CardTitle className="text-sm text-amber-900">Missing Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {analysis.missing_documents.map((doc, i) => (
                    <li key={i} className="text-xs text-amber-800">• {doc}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Document List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Uploaded Documents</CardTitle>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {allCategories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredDocs.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No documents uploaded yet</p>
          ) : (
            <div className="space-y-2">
              {filteredDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="w-5 h-5 text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{doc.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{doc.category}</Badge>
                        <span className="text-xs text-slate-500">
                          {new Date(doc.uploadedAt).toLocaleDateString()}
                        </span>
                        {doc.views?.length > 0 && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {doc.views.length}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleRestriction(doc.id)}
                      title={doc.restricted ? 'Restricted access' : 'Public access'}
                    >
                      {doc.restricted ? (
                        <Lock className="w-4 h-4 text-red-500" />
                      ) : (
                        <Unlock className="w-4 h-4 text-emerald-500" />
                      )}
                    </Button>
                    <Button variant="ghost" size="icon" asChild>
                      <a href={doc.url} target="_blank" rel="noopener noreferrer">
                        <Download className="w-4 h-4 text-slate-400" />
                      </a>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => removeDocument(doc.id)}>
                      <Trash2 className="w-4 h-4 text-slate-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}