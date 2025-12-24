import React from 'react';
import { FileText, TrendingUp, AlertCircle } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function DealPitchAnalysis({ startup, dealRoom }) {
  const analysis = startup?.pitch_deck_extracted?.analysis;

  if (!analysis) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-12 text-center">
          <FileText className="w-12 h-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No Pitch Analysis</h3>
          <p className="text-slate-500 text-sm max-w-md">
            Upload and analyze a pitch deck from the My Startups page
          </p>
        </CardContent>
      </Card>
    );
  }

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Score Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className={cn("text-3xl font-bold mb-2", getScoreColor(analysis.overall_score))}>
              {analysis.overall_score}
            </div>
            <p className="text-sm text-slate-500">Overall Score</p>
            <Progress value={analysis.overall_score} className="mt-3 h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <div className={cn("text-3xl font-bold mb-2", getScoreColor(analysis.persuasiveness_score))}>
              {analysis.persuasiveness_score}
            </div>
            <p className="text-sm text-slate-500">Persuasiveness</p>
            <Progress value={analysis.persuasiveness_score} className="mt-3 h-2" />
          </CardContent>
        </Card>

        {analysis.fundability_score && (
          <Card>
            <CardContent className="pt-6 text-center">
              <div className={cn("text-3xl font-bold mb-2", getScoreColor(analysis.fundability_score))}>
                {analysis.fundability_score}
              </div>
              <p className="text-sm text-slate-500">Fundability</p>
              <Progress value={analysis.fundability_score} className="mt-3 h-2" />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6 text-center">
            <Badge className="mb-2 bg-indigo-600 text-white text-sm py-1">
              {analysis.investor_readiness?.replace('_', ' ')}
            </Badge>
            <p className="text-sm text-slate-500">Readiness</p>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      {analysis.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700 leading-relaxed">{analysis.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Strengths & Weaknesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-700">
              <TrendingUp className="w-4 h-4" />
              Top Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysis.top_strengths?.map((strength, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-500 mt-0.5">✓</span>
                  <span className="text-slate-700">{strength}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
              <AlertCircle className="w-4 h-4" />
              Areas to Improve
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {analysis.top_weaknesses?.map((weakness, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-amber-500 mt-0.5">!</span>
                  <span className="text-slate-700">{weakness}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Deal Killers */}
      {analysis.deal_killers?.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              Deal Killers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {analysis.deal_killers.map((killer, i) => (
                <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">✗</span>
                  {killer}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}