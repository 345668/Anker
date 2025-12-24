import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, MessageSquare, ArrowRight } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function SlideImprovementSuggestions({ slide }) {
  const [improvements, setImprovements] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateImprovements = async () => {
    setLoading(true);
    try {
      const response = await base44.functions.invoke('mistralPitchAnalysis', {
        analysisType: 'slide_improvements',
        slideContent: JSON.stringify(slide),
        slideType: slide.slide_type
      });

      if (response.data.success) {
        setImprovements(response.data.analysis);
      }
    } catch (error) {
      console.error('Error generating improvements:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 text-purple-900">
          <Sparkles className="w-4 h-4" />
          AI Content Improvements
        </CardTitle>
        <CardDescription className="text-xs">
          Get specific rewrite suggestions powered by Mistral AI
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!improvements && !loading && (
          <Button 
            onClick={generateImprovements}
            size="sm"
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            <Sparkles className="w-3 h-3 mr-2" />
            Generate Improvements
          </Button>
        )}

        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
          </div>
        )}

        {improvements && Array.isArray(improvements.improvements) && (
          <div className="space-y-3">
            {improvements.improvements.map((improvement, i) => (
              <div key={i} className="bg-white rounded-lg p-3 border border-purple-200">
                <div className="flex items-start gap-2 mb-2">
                  <Badge className="bg-purple-100 text-purple-700 text-xs">
                    #{i + 1}
                  </Badge>
                  <p className="text-xs font-medium text-purple-900">{improvement.type || improvement.category}</p>
                </div>
                
                {improvement.current && (
                  <div className="mb-2 p-2 bg-red-50 rounded border border-red-200">
                    <p className="text-xs font-medium text-red-800 mb-1">Before:</p>
                    <p className="text-xs text-red-700">{improvement.current}</p>
                  </div>
                )}
                
                {improvement.suggested && (
                  <div className="p-2 bg-emerald-50 rounded border border-emerald-200">
                    <p className="text-xs font-medium text-emerald-800 mb-1">After:</p>
                    <p className="text-xs text-emerald-700">{improvement.suggested}</p>
                  </div>
                )}
                
                {improvement.rationale && (
                  <p className="text-xs text-slate-600 mt-2 italic">
                    💡 {improvement.rationale}
                  </p>
                )}
              </div>
            ))}
            
            <Button 
              onClick={generateImprovements}
              variant="outline"
              size="sm"
              className="w-full"
            >
              Regenerate
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}