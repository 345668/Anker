import React from 'react';
import { Users, Mail } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function OnboardingIntroductions({ recommendations }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Suggested Connections</CardTitle>
          <CardDescription>
            Key founders and team members to connect with
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recommendations.suggested_connections?.map((connection, i) => (
              <div key={i} className="flex items-start gap-3 p-3 border rounded-lg hover:border-indigo-200 transition-colors">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-indigo-100 text-indigo-700">
                    {connection.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-medium text-slate-900">{connection.name}</h4>
                    <Button variant="ghost" size="sm">
                      <Mail className="w-4 h-4 mr-1.5" />
                      Connect
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mb-1">{connection.role}</p>
                  <p className="text-sm text-slate-600">{connection.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Investment Thesis */}
      {recommendations.investment_thesis && (
        <Card className="bg-gradient-to-br from-indigo-50 to-violet-50 border-indigo-200">
          <CardHeader>
            <CardTitle className="text-indigo-900">Your Investment Thesis</CardTitle>
            <CardDescription>AI-generated based on your profile</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-medium text-indigo-700 mb-1">Core Focus:</p>
              <p className="text-sm text-indigo-900">{recommendations.investment_thesis.core_focus}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-indigo-700 mb-1">Sweet Spot:</p>
              <p className="text-sm text-indigo-900">{recommendations.investment_thesis.sweet_spot}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-indigo-700 mb-1">Value Add:</p>
              <ul className="space-y-1">
                {recommendations.investment_thesis.value_add?.map((value, i) => (
                  <li key={i} className="text-sm text-indigo-800">• {value}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}