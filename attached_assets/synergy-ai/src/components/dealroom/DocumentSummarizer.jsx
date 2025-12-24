import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  FileText, Sparkles, Loader2, Download, Upload
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
import { toast } from "sonner";

export default function DocumentSummarizer({ dealRoom }) {
  const [documents, setDocuments] = useState([]);
  const [summarizing, setSummarizing] = useState(false);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSummarizing(true);
    try {
      // Upload file
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // Generate AI summary
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this deal room document and provide a comprehensive summary.

Extract:
1. Document type (e.g., term sheet, due diligence, financial model, legal doc)
2. Key points (bullet points)
3. Critical numbers/metrics
4. Action items mentioned
5. Risks or concerns highlighted
6. Opportunities identified
7. Overall sentiment (positive/neutral/negative)

Be specific and highlight what founders need to know quickly.`,
        file_urls: [file_url],
        response_json_schema: {
          type: 'object',
          properties: {
            document_type: { type: 'string' },
            executive_summary: { type: 'string' },
            key_points: { type: 'array', items: { type: 'string' } },
            critical_numbers: { 
              type: 'array', 
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  value: { type: 'string' }
                }
              }
            },
            action_items: { type: 'array', items: { type: 'string' } },
            risks: { type: 'array', items: { type: 'string' } },
            opportunities: { type: 'array', items: { type: 'string' } },
            sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] }
          }
        }
      });

      const newDoc = {
        id: Date.now().toString(),
        name: file.name,
        url: file_url,
        uploadedAt: new Date().toISOString(),
        summary: result
      };

      setDocuments([...documents, newDoc]);
      toast.success('Document analyzed!');
    } catch (error) {
      console.error('Error summarizing document:', error);
      toast.error('Failed to analyze document');
    } finally {
      setSummarizing(false);
    }
  };

  const sentimentConfig = {
    positive: { color: 'bg-emerald-100 text-emerald-700', icon: '✓' },
    neutral: { color: 'bg-slate-100 text-slate-700', icon: '○' },
    negative: { color: 'bg-red-100 text-red-700', icon: '⚠' }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Document Summaries</CardTitle>
              <CardDescription>AI-powered document analysis</CardDescription>
            </div>
            <div>
              <label htmlFor="doc-upload">
                <Button asChild disabled={summarizing}>
                  <span>
                    {summarizing ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    Upload Document
                  </span>
                </Button>
                <input
                  id="doc-upload"
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={summarizing}
                />
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No documents uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {documents.map((doc) => {
                const sentiment = doc.summary?.sentiment || 'neutral';
                return (
                  <div key={doc.id} className="border rounded-lg p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="w-4 h-4 text-slate-400" />
                          <h4 className="font-medium text-slate-900">{doc.name}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {doc.summary?.document_type || 'Document'}
                          </Badge>
                          <Badge className={sentimentConfig[sentiment]?.color}>
                            {sentimentConfig[sentiment]?.icon} {sentiment}
                          </Badge>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" asChild>
                        <a href={doc.url} target="_blank" rel="noopener noreferrer">
                          <Download className="w-4 h-4" />
                        </a>
                      </Button>
                    </div>

                    {/* Executive Summary */}
                    {doc.summary?.executive_summary && (
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-sm text-slate-700">
                          {doc.summary.executive_summary}
                        </p>
                      </div>
                    )}

                    {/* Key Points */}
                    {doc.summary?.key_points?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-2">Key Points</p>
                        <ul className="space-y-1">
                          {doc.summary.key_points.slice(0, 3).map((point, i) => (
                            <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                              <Sparkles className="w-3 h-3 text-indigo-500 mt-0.5 flex-shrink-0" />
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Critical Numbers */}
                    {doc.summary?.critical_numbers?.length > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        {doc.summary.critical_numbers.map((num, i) => (
                          <div key={i} className="bg-indigo-50 rounded p-2">
                            <p className="text-xs text-indigo-600">{num.label}</p>
                            <p className="text-sm font-semibold text-indigo-900">{num.value}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Risks */}
                    {doc.summary?.risks?.length > 0 && (
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-red-800 mb-1">Risks Identified</p>
                        <ul className="space-y-0.5">
                          {doc.summary.risks.map((risk, i) => (
                            <li key={i} className="text-xs text-red-700">⚠️ {risk}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Action Items */}
                    {doc.summary?.action_items?.length > 0 && (
                      <div className="bg-amber-50 rounded-lg p-3">
                        <p className="text-xs font-medium text-amber-800 mb-1">Action Items</p>
                        <ul className="space-y-0.5">
                          {doc.summary.action_items.map((item, i) => (
                            <li key={i} className="text-xs text-amber-700">□ {item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}