import React from 'react';
import { FileText, Download, ExternalLink } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OnboardingDocuments({ recommendations, startups }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Recommended Startups & Documents</CardTitle>
          <CardDescription>
            AI-curated startups that match your investment profile
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recommendations.recommended_startups?.map((rec, i) => {
              const startup = startups.find(s => s.company_name === rec.startup_name);
              
              return (
                <div key={i} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-slate-900">{rec.startup_name}</h4>
                        <Badge className="bg-indigo-100 text-indigo-700">
                          {rec.match_score}% Match
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-600 mb-2">{rec.why_relevant}</p>
                    </div>
                  </div>

                  {/* Key Documents */}
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-slate-700 mb-2">📄 Key Documents to Review:</p>
                    <ul className="space-y-1">
                      {rec.key_documents?.map((doc, j) => (
                        <li key={j} className="text-xs text-slate-600 flex items-center gap-2">
                          <FileText className="w-3 h-3 text-slate-400" />
                          {doc}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Initial Questions */}
                  <div className="bg-indigo-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-indigo-800 mb-2">❓ Initial Questions to Ask:</p>
                    <ul className="space-y-1">
                      {rec.initial_questions?.slice(0, 3).map((q, j) => (
                        <li key={j} className="text-xs text-indigo-700">{q}</li>
                      ))}
                    </ul>
                  </div>

                  {startup && (
                    <Button variant="outline" size="sm" className="w-full">
                      <ExternalLink className="w-3.5 h-3.5 mr-2" />
                      View Full Profile
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}