import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Upload, FileText, AlertTriangle, CheckCircle, Loader2, 
  Download, Trash2, Sparkles, Shield, FileWarning
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
import { cn } from "@/lib/utils";

export default function DueDiligence({ dealRoom, startup }) {
  const [documents, setDocuments] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const queryClient = useQueryClient();

  const updateDealRoomMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DealRoom.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(['dealRoom']),
  });

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setAnalyzing(true);
    try {
      const uploadedDocs = [];
      
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        uploadedDocs.push({
          id: Date.now() + Math.random(),
          name: file.name,
          url: file_url,
          uploadedAt: new Date().toISOString(),
          size: file.size,
          type: file.type
        });
      }
      
      setDocuments([...documents, ...uploadedDocs]);
      toast.success(`${files.length} document${files.length > 1 ? 's' : ''} uploaded`);
    } catch (error) {
      console.error('Error uploading documents:', error);
      toast.error('Failed to upload documents');
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeDueDiligence = async () => {
    if (documents.length === 0) {
      toast.error('Please upload documents first');
      return;
    }

    setAnalyzing(true);
    try {
      // Analyze all documents for due diligence
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Perform comprehensive due diligence analysis on this startup's data room.

Startup: ${startup?.company_name}
Industry: ${startup?.industry?.join(', ')}
Stage: ${startup?.stage}
Team Size: ${startup?.team_size}

Uploaded Documents: ${documents.map(d => d.name).join(', ')}

Conduct a thorough due diligence review and provide:

1. RED FLAGS - Critical issues that could derail the deal
2. YELLOW FLAGS - Concerns that need clarification
3. GREEN FLAGS - Strong positive indicators
4. FINANCIAL HEALTH - Assessment of financial documents
5. LEGAL COMPLIANCE - Legal and regulatory status
6. MARKET VALIDATION - Market traction and validation
7. TEAM ASSESSMENT - Founding team evaluation
8. IP & TECHNOLOGY - Intellectual property status
9. RISK SCORE - Overall risk rating (0-100, where 100 is highest risk)
10. INVESTMENT RECOMMENDATION - Proceed/Caution/Pass with reasoning

Be thorough and specific. Identify concrete issues, not generic concerns.`,
        file_urls: documents.map(d => d.url).slice(0, 5), // Max 5 files for analysis
        response_json_schema: {
          type: 'object',
          properties: {
            red_flags: { 
              type: 'array', 
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string' },
                  issue: { type: 'string' },
                  severity: { type: 'string', enum: ['critical', 'high', 'medium'] },
                  recommendation: { type: 'string' }
                }
              }
            },
            yellow_flags: { 
              type: 'array', 
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string' },
                  concern: { type: 'string' },
                  clarification_needed: { type: 'string' }
                }
              }
            },
            green_flags: { type: 'array', items: { type: 'string' } },
            financial_health: {
              type: 'object',
              properties: {
                score: { type: 'number' },
                summary: { type: 'string' },
                concerns: { type: 'array', items: { type: 'string' } },
                strengths: { type: 'array', items: { type: 'string' } }
              }
            },
            legal_compliance: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['compliant', 'needs_review', 'issues_found'] },
                summary: { type: 'string' },
                issues: { type: 'array', items: { type: 'string' } }
              }
            },
            market_validation: {
              type: 'object',
              properties: {
                score: { type: 'number' },
                summary: { type: 'string' }
              }
            },
            team_assessment: {
              type: 'object',
              properties: {
                score: { type: 'number' },
                strengths: { type: 'array', items: { type: 'string' } },
                gaps: { type: 'array', items: { type: 'string' } }
              }
            },
            ip_technology: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                summary: { type: 'string' }
              }
            },
            risk_score: { type: 'number' },
            investment_recommendation: {
              type: 'object',
              properties: {
                decision: { type: 'string', enum: ['proceed', 'caution', 'pass'] },
                reasoning: { type: 'string' },
                next_steps: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        }
      });

      setAnalysis(result);

      // Generate industry-specific checklist
      const checklistResult = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate a comprehensive due diligence checklist for this startup.

Industry: ${startup?.industry?.join(', ')}
Stage: ${startup?.stage}
Business Model: ${startup?.business_model}

Create a detailed checklist organized by category. Include:
- Financial documents to review
- Legal documents needed
- Technical/product validation
- Market validation
- Team verification
- Operational readiness

Be specific to the industry and stage. Mark priority level for each item.`,
        response_json_schema: {
          type: 'object',
          properties: {
            categories: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        item: { type: 'string' },
                        priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                        completed: { type: 'boolean' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      setChecklist(checklistResult.categories);

      // Update deal room with analysis
      await updateDealRoomMutation.mutateAsync({
        id: dealRoom.id,
        data: {
          ai_insights: {
            ...dealRoom.ai_insights,
            due_diligence: {
              analyzed_at: new Date().toISOString(),
              risk_score: result.risk_score,
              recommendation: result.investment_recommendation.decision,
              red_flags_count: result.red_flags?.length || 0,
              yellow_flags_count: result.yellow_flags?.length || 0,
              green_flags_count: result.green_flags?.length || 0
            }
          }
        }
      });

      toast.success('Due diligence analysis complete!');
    } catch (error) {
      console.error('Error analyzing:', error);
      toast.error('Failed to analyze documents');
    } finally {
      setAnalyzing(false);
    }
  };

  const removeDocument = (id) => {
    setDocuments(documents.filter(d => d.id !== id));
  };

  const recommendationConfig = {
    proceed: { color: 'bg-emerald-100 text-emerald-700 border-emerald-300', icon: CheckCircle },
    caution: { color: 'bg-amber-100 text-amber-700 border-amber-300', icon: AlertTriangle },
    pass: { color: 'bg-red-100 text-red-700 border-red-300', icon: FileWarning }
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Room</CardTitle>
          <CardDescription>
            Upload documents for AI-powered due diligence analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-indigo-300 transition-colors">
            <label htmlFor="dd-upload" className="cursor-pointer">
              <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="text-sm text-slate-600 mb-1">
                Upload due diligence documents
              </p>
              <p className="text-xs text-slate-500">
                Financial statements, legal docs, cap tables, contracts, etc.
              </p>
              <input
                id="dd-upload"
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xlsx,.xls,.txt"
                onChange={handleFileUpload}
                className="hidden"
                disabled={analyzing}
              />
            </label>
          </div>

          {documents.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">
                  {documents.length} document{documents.length !== 1 ? 's' : ''} uploaded
                </p>
                <Button 
                  onClick={analyzeDueDiligence}
                  disabled={analyzing}
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {analyzing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Analyze Documents
                </Button>
              </div>
              
              <div className="space-y-1">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="text-sm text-slate-700 truncate">{doc.name}</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeDocument(doc.id)}>
                      <Trash2 className="w-4 h-4 text-slate-400" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis Results */}
      {analysis && (
        <div className="space-y-4">
          {/* Overall Assessment */}
          <Card className={cn("border-2", recommendationConfig[analysis.investment_recommendation?.decision]?.color)}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Investment Recommendation</CardTitle>
                <Badge className={recommendationConfig[analysis.investment_recommendation?.decision]?.color}>
                  {analysis.investment_recommendation?.decision?.toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-700">{analysis.investment_recommendation?.reasoning}</p>
              
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs text-slate-500">Risk Score</p>
                  <p className="text-2xl font-bold text-slate-900">{analysis.risk_score}/100</p>
                </div>
                <Progress value={analysis.risk_score} className="flex-1" />
              </div>

              {analysis.investment_recommendation?.next_steps?.length > 0 && (
                <div className="bg-white rounded-lg p-3 border">
                  <p className="text-xs font-medium text-slate-700 mb-2">Next Steps:</p>
                  <ul className="space-y-1">
                    {analysis.investment_recommendation.next_steps.map((step, i) => (
                      <li key={i} className="text-xs text-slate-600">• {step}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Flags Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Red Flags */}
            <Card className="border-red-200 bg-red-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-red-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Red Flags ({analysis.red_flags?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.red_flags?.length > 0 ? (
                  <div className="space-y-2">
                    {analysis.red_flags.map((flag, i) => (
                      <div key={i} className="bg-white rounded p-2 border border-red-200">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-red-800">{flag.category}</p>
                          <Badge className="bg-red-200 text-red-800 text-xs">{flag.severity}</Badge>
                        </div>
                        <p className="text-xs text-red-700 mb-1">{flag.issue}</p>
                        <p className="text-xs text-red-600 italic">{flag.recommendation}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-red-600">No critical issues found</p>
                )}
              </CardContent>
            </Card>

            {/* Yellow Flags */}
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-amber-900 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Yellow Flags ({analysis.yellow_flags?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.yellow_flags?.length > 0 ? (
                  <div className="space-y-2">
                    {analysis.yellow_flags.slice(0, 3).map((flag, i) => (
                      <div key={i} className="bg-white rounded p-2 border border-amber-200">
                        <p className="text-xs font-medium text-amber-800 mb-1">{flag.category}</p>
                        <p className="text-xs text-amber-700">{flag.concern}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-600">No concerns identified</p>
                )}
              </CardContent>
            </Card>

            {/* Green Flags */}
            <Card className="border-emerald-200 bg-emerald-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-emerald-900 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Green Flags ({analysis.green_flags?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.green_flags?.length > 0 ? (
                  <ul className="space-y-1">
                    {analysis.green_flags.slice(0, 5).map((flag, i) => (
                      <li key={i} className="text-xs text-emerald-700 flex items-start gap-1">
                        <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        {flag}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-emerald-600">No strengths highlighted</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Detailed Assessments */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Financial Health */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Financial Health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Progress value={analysis.financial_health?.score} className="flex-1" />
                  <span className="text-sm font-semibold">{analysis.financial_health?.score}/100</span>
                </div>
                <p className="text-xs text-slate-600">{analysis.financial_health?.summary}</p>
              </CardContent>
            </Card>

            {/* Legal Compliance */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Legal Compliance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Badge className={
                  analysis.legal_compliance?.status === 'compliant' ? 'bg-emerald-100 text-emerald-700' :
                  analysis.legal_compliance?.status === 'needs_review' ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }>
                  {analysis.legal_compliance?.status?.replace('_', ' ')}
                </Badge>
                <p className="text-xs text-slate-600">{analysis.legal_compliance?.summary}</p>
              </CardContent>
            </Card>

            {/* Team Assessment */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Team Assessment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Progress value={analysis.team_assessment?.score} className="flex-1" />
                  <span className="text-sm font-semibold">{analysis.team_assessment?.score}/100</span>
                </div>
                {analysis.team_assessment?.strengths?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-700">Strengths:</p>
                    <p className="text-xs text-emerald-600">{analysis.team_assessment.strengths[0]}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Market Validation */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Market Validation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Progress value={analysis.market_validation?.score} className="flex-1" />
                  <span className="text-sm font-semibold">{analysis.market_validation?.score}/100</span>
                </div>
                <p className="text-xs text-slate-600">{analysis.market_validation?.summary}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Checklist */}
      {checklist && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Due Diligence Checklist</CardTitle>
            <CardDescription>Industry-specific checklist for {startup?.industry?.join(', ')} at {startup?.stage} stage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {checklist.map((category, i) => (
                <div key={i} className="border rounded-lg p-4">
                  <h4 className="font-medium text-slate-900 mb-3">{category.name}</h4>
                  <div className="space-y-2">
                    {category.items?.map((item, j) => (
                      <div key={j} className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          defaultChecked={item.completed}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <p className="text-sm text-slate-700">{item.item}</p>
                          <Badge className={cn(
                            "text-xs mt-1",
                            item.priority === 'critical' && 'bg-red-100 text-red-700',
                            item.priority === 'high' && 'bg-amber-100 text-amber-700',
                            item.priority === 'medium' && 'bg-blue-100 text-blue-700',
                            item.priority === 'low' && 'bg-slate-100 text-slate-700'
                          )}>
                            {item.priority}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}