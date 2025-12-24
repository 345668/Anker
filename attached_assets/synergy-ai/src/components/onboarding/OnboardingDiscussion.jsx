import React from 'react';
import { MessageSquare, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function OnboardingDiscussion({ recommendations, profile }) {
  return (
    <div className="space-y-4">
      {/* Discussion Topics */}
      <Card>
        <CardHeader>
          <CardTitle>Key Discussion Topics</CardTitle>
          <CardDescription>
            Tailored to your {profile.investment_focus?.join(', ')} focus
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recommendations.discussion_topics?.map((topic, i) => (
              <div key={i} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  <h4 className="font-medium text-slate-900">{topic.topic}</h4>
                </div>

                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-slate-700 mb-2">Key Questions:</p>
                  <ul className="space-y-1">
                    {topic.key_questions?.map((q, j) => (
                      <li key={j} className="text-xs text-slate-600">• {q}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-indigo-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-indigo-800 mb-2">Evaluation Criteria:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {topic.evaluation_criteria?.map((criteria, j) => (
                      <Badge key={j} variant="outline" className="text-xs bg-white">
                        {criteria}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Red Flags to Watch */}
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Red Flags to Watch For
          </CardTitle>
          <CardDescription>Based on your investment focus</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {recommendations.red_flags?.map((flag, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-red-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {flag}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Next Steps */}
      <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
        <CardHeader>
          <CardTitle className="text-emerald-900 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Your Next Steps
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {recommendations.next_steps?.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-emerald-800">
                <span className="font-semibold">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}