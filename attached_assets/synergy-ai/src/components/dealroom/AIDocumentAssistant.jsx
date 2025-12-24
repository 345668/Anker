import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Bot, Upload, Loader2, FileText, AlertTriangle, CheckCircle,
  Sparkles, Shield, Eye, Zap
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function AIDocumentAssistant({ dealRoom, documents = [], onDocumentsUpdate }) {
  const [processing, setProcessing] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const analyzeDocuments = async () => {
    if (documents.length === 0) {
      toast.error('No documents to analyze');
      return;
    }

    setProcessing(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze these deal room documents and provide comprehensive insights for a ${dealRoom.funding_round} fundraising round.

**DEAL CONTEXT:**
Company: ${dealRoom.name}
Round: ${dealRoom.funding_round}
Target: $${(dealRoom.target_amount / 1000000).toFixed(1)}M
Status: ${dealRoom.status}
Documents: ${documents.map(d => `${d.name} (${d.type})`).join(', ')}

**ANALYSIS TASKS:**

1. **DOCUMENT CATEGORIZATION**
   Categorize each document as:
   - Financial (P&L, balance sheet, cap table, projections)
   - Legal (term sheets, contracts, agreements, NDAs)
   - Business (pitch deck, business plan, market analysis)
   - Due Diligence (customer references, tech audit, IP documentation)
   - Compliance (SEC filings, regulatory approvals, certifications)
   - Other

2. **KEY TERMS EXTRACTION**
   For legal/contract documents, extract:
   - Valuation and pricing terms
   - Investment amount and structure
   - Board seats and governance rights
   - Liquidation preferences
   - Anti-dilution provisions
   - Vesting schedules
   - Protective provisions
   - Investor rights (pro-rata, information, participation)
   - Restrictions and covenants
   - Exit provisions

3. **RISK IDENTIFICATION**
   Flag potential risks:
   - Unusual or founder-unfriendly terms
   - Missing standard clauses
   - Valuation concerns (over/under valued)
   - Cap table issues (over-dilution, complex structure)
   - IP ownership gaps
   - Regulatory compliance issues
   - Financial red flags (burn rate, runway concerns)
   - Litigation or legal exposure
   - Conflicts with previous agreements

4. **MISSING DOCUMENTATION**
   Based on ${dealRoom.funding_round} stage, identify missing:
   - Standard legal documents (subscription agreements, investor rights)
   - Financial statements (audited/unaudited, projections)
   - Due diligence materials
   - Corporate documents (certificates, bylaws)
   - Required disclosures

5. **INVESTOR READINESS ASSESSMENT**
   Score readiness (0-100) based on:
   - Document completeness
   - Quality and professionalism
   - Legal soundness
   - Financial transparency
   - Standard compliance

Provide actionable insights for each area.`,
        file_urls: documents.map(d => d.url).filter(Boolean).slice(0, 10),
        response_json_schema: {
          type: 'object',
          properties: {
            categorized_documents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  document_name: { type: 'string' },
                  category: { type: 'string' },
                  subcategory: { type: 'string' },
                  importance: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                  summary: { type: 'string' }
                }
              }
            },
            key_terms: {
              type: 'object',
              properties: {
                valuation: { type: 'string' },
                investment_amount: { type: 'string' },
                investment_structure: { type: 'string' },
                liquidation_preference: { type: 'string' },
                anti_dilution: { type: 'string' },
                board_composition: { type: 'string' },
                protective_provisions: { type: 'array', items: { type: 'string' } },
                investor_rights: { type: 'array', items: { type: 'string' } },
                vesting: { type: 'string' },
                other_key_terms: { type: 'array', items: { type: 'string' } }
              }
            },
            risks_identified: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  risk_type: { type: 'string' },
                  severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                  description: { type: 'string' },
                  recommendation: { type: 'string' },
                  affected_documents: { type: 'array', items: { type: 'string' } }
                }
              }
            },
            missing_documents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  document_type: { type: 'string' },
                  priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                  reason: { type: 'string' },
                  typical_source: { type: 'string' }
                }
              }
            },
            investor_readiness_score: { type: 'number' },
            readiness_breakdown: {
              type: 'object',
              properties: {
                legal_completeness: { type: 'number' },
                financial_transparency: { type: 'number' },
                due_diligence_ready: { type: 'number' },
                documentation_quality: { type: 'number' }
              }
            },
            recommendations: { type: 'array', items: { type: 'string' } },
            next_steps: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      setAnalysis(result);
      toast.success('Document analysis complete!');
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error('Failed to analyze documents');
    } finally {
      setProcessing(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      const newDocument = {
        name: file.name,
        url: file_url,
        type: file.type.includes('pdf') ? 'PDF' : 
              file.type.includes('word') ? 'Word' : 
              file.type.includes('excel') ? 'Excel' : 'Other',
        uploaded_at: new Date().toISOString()
      };

      const updatedDocuments = [...(dealRoom.documents || []), newDocument];
      
      await base44.entities.DealRoom.update(dealRoom.id, {
        documents: updatedDocuments
      });

      if (onDocumentsUpdate) {
        onDocumentsUpdate(updatedDocuments);
      }

      toast.success('Document uploaded successfully!');
    } catch (error) {
      toast.error('Upload failed');
    } finally {
      setUploadingFile(false);
    }
  };

  const getSeverityColor = (severity) => {
    const colors = {
      critical: 'bg-red-100 text-red-800 border-red-200',
      high: 'bg-orange-100 text-orange-800 border-orange-200',
      medium: 'bg-amber-100 text-amber-800 border-amber-200',
      low: 'bg-blue-100 text-blue-800 border-blue-200'
    };
    return colors[severity] || colors.medium;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-indigo-900">
            <Bot className="w-5 h-5" />
            AI Document Assistant
          </CardTitle>
          <CardDescription>
            Automated categorization, term extraction, and risk analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <input
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              id="doc-upload"
              accept=".pdf,.doc,.docx,.xls,.xlsx"
            />
            <label htmlFor="doc-upload" className="flex-1">
              <Button 
                variant="outline" 
                className="w-full"
                disabled={uploadingFile}
                asChild
              >
                <span>
                  {uploadingFile ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Document
                    </>
                  )}
                </span>
              </Button>
            </label>
            <Button 
              onClick={analyzeDocuments}
              disabled={processing || documents.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Analyze All
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Analysis Results */}
      {analysis && (
        <>
          {/* Investor Readiness Score */}
          <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-emerald-900">
                <Shield className="w-5 h-5" />
                Investor Readiness Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="flex-shrink-0">
                  <div className={cn(
                    "w-24 h-24 rounded-full flex flex-col items-center justify-center border-4",
                    analysis.investor_readiness_score >= 80 ? "border-emerald-500" :
                    analysis.investor_readiness_score >= 60 ? "border-amber-500" :
                    "border-red-500"
                  )}>
                    <span className={cn("text-3xl font-bold",
                      analysis.investor_readiness_score >= 80 ? "text-emerald-600" :
                      analysis.investor_readiness_score >= 60 ? "text-amber-600" :
                      "text-red-600"
                    )}>
                      {analysis.investor_readiness_score}
                    </span>
                    <span className="text-xs text-slate-500">/100</span>
                  </div>
                </div>
                
                <div className="flex-1 space-y-3">
                  {analysis.readiness_breakdown && (
                    <>
                      {Object.entries(analysis.readiness_breakdown).map(([key, value]) => (
                        <div key={key}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-slate-700 capitalize">
                              {key.replace(/_/g, ' ')}
                            </span>
                            <span className="text-sm font-bold text-slate-900">{value}%</span>
                          </div>
                          <Progress value={value} className="h-2" />
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Categorized Documents */}
          {analysis.categorized_documents?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-slate-600" />
                  Document Categorization
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analysis.categorized_documents.map((doc, i) => (
                    <div key={i} className="flex items-start justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="font-medium text-slate-900">{doc.document_name}</p>
                          <Badge className={getSeverityColor(doc.importance)}>
                            {doc.importance}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-xs">{doc.category}</Badge>
                          {doc.subcategory && (
                            <Badge variant="secondary" className="text-xs">{doc.subcategory}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-600">{doc.summary}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Key Terms */}
          {analysis.key_terms && Object.keys(analysis.key_terms).some(k => analysis.key_terms[k]) && (
            <Card className="border-indigo-200 bg-indigo-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-indigo-900">
                  <Eye className="w-5 h-5" />
                  Extracted Key Terms
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(analysis.key_terms).map(([key, value]) => {
                    if (!value) return null;
                    return (
                      <div key={key} className="bg-white rounded-lg p-3 border border-indigo-200">
                        <p className="text-xs font-medium text-slate-500 uppercase mb-1">
                          {key.replace(/_/g, ' ')}
                        </p>
                        {Array.isArray(value) ? (
                          <ul className="space-y-1">
                            {value.map((v, i) => (
                              <li key={i} className="text-sm text-slate-700">• {v}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-slate-900 font-medium">{value}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Risks Identified */}
          {analysis.risks_identified?.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-900">
                  <AlertTriangle className="w-5 h-5" />
                  Risks & Red Flags ({analysis.risks_identified.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" className="w-full">
                  {analysis.risks_identified.map((risk, i) => (
                    <AccordionItem key={i} value={`risk-${i}`}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="flex items-center gap-3">
                            <Badge className={cn("text-xs", getSeverityColor(risk.severity))}>
                              {risk.severity}
                            </Badge>
                            <span className="font-medium text-slate-900">{risk.risk_type}</span>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="pl-4 space-y-3">
                          <div>
                            <p className="text-xs font-medium text-slate-500 uppercase mb-1">Description</p>
                            <p className="text-sm text-slate-700">{risk.description}</p>
                          </div>
                          
                          <div className="bg-white rounded-lg p-3 border border-red-200">
                            <p className="text-xs font-medium text-red-900 uppercase mb-1">Recommendation</p>
                            <p className="text-sm text-red-800">{risk.recommendation}</p>
                          </div>

                          {risk.affected_documents?.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-slate-500 uppercase mb-1">Affected Documents</p>
                              <div className="flex flex-wrap gap-1">
                                {risk.affected_documents.map((doc, j) => (
                                  <Badge key={j} variant="outline" className="text-xs">{doc}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )}

          {/* Missing Documents */}
          {analysis.missing_documents?.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-900">
                  <AlertTriangle className="w-5 h-5" />
                  Missing Documentation ({analysis.missing_documents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analysis.missing_documents.map((doc, i) => (
                    <div key={i} className={cn(
                      "p-4 rounded-lg border",
                      getSeverityColor(doc.priority)
                    )}>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-slate-900">{doc.document_type}</p>
                          <Badge className={cn("text-xs mt-1", getSeverityColor(doc.priority))}>
                            {doc.priority} priority
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 mb-2">{doc.reason}</p>
                      {doc.typical_source && (
                        <p className="text-xs text-slate-600">
                          <strong>Where to get it:</strong> {doc.typical_source}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {analysis.recommendations?.length > 0 && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-900">
                  <Zap className="w-5 h-5" />
                  AI Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysis.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <span className="text-blue-800">{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Next Steps */}
          {analysis.next_steps?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Suggested Next Steps</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2">
                  {analysis.next_steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="text-sm text-slate-700 pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          <Button 
            variant="outline" 
            size="sm"
            onClick={analyzeDocuments}
            disabled={processing}
            className="w-full"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Re-analyze Documents
          </Button>
        </>
      )}
    </div>
  );
}