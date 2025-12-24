import React from 'react';
import { DollarSign, Users, Target, Calendar, TrendingUp } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DealOverview({ dealRoom, startup, matches, outreaches }) {
  const progressPercent = (dealRoom.raised_amount / dealRoom.target_amount * 100).toFixed(0);
  const repliedCount = outreaches.filter(o => o.replied_at).length;
  const responseRate = outreaches.length > 0 ? (repliedCount / outreaches.length * 100).toFixed(0) : 0;

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-emerald-600" />
              <div>
                <p className="text-sm text-slate-500">Raised</p>
                <p className="text-2xl font-bold text-slate-900">
                  ${(dealRoom.raised_amount / 1000000).toFixed(1)}M
                </p>
                <p className="text-xs text-slate-500">
                  of ${(dealRoom.target_amount / 1000000).toFixed(1)}M
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-indigo-600" />
              <div>
                <p className="text-sm text-slate-500">Investors</p>
                <p className="text-2xl font-bold text-slate-900">
                  {dealRoom.investor_ids?.length || 0}
                </p>
                <p className="text-xs text-slate-500">committed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Target className="w-8 h-8 text-violet-600" />
              <div>
                <p className="text-sm text-slate-500">Matches</p>
                <p className="text-2xl font-bold text-slate-900">{matches.length}</p>
                <p className="text-xs text-slate-500">potential investors</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-amber-600" />
              <div>
                <p className="text-sm text-slate-500">Response Rate</p>
                <p className="text-2xl font-bold text-slate-900">{responseRate}%</p>
                <p className="text-xs text-slate-500">{repliedCount} / {outreaches.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Funding Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funding Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Target Amount</span>
              <span className="font-semibold text-slate-900">
                ${dealRoom.target_amount.toLocaleString()}
              </span>
            </div>
            <Progress value={progressPercent} className="h-3" />
            <div className="flex justify-between text-xs text-slate-500">
              <span>${dealRoom.raised_amount.toLocaleString()} raised</span>
              <span>{progressPercent}% complete</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Created</p>
              <p className="text-sm font-medium text-slate-900">
                {new Date(dealRoom.created_date).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Target Close</p>
              <p className="text-sm font-medium text-slate-900">
                {dealRoom.target_close_date ? new Date(dealRoom.target_close_date).toLocaleDateString() : 'Not set'}
              </p>
            </div>
            {dealRoom.target_close_date && (
              <div className="col-span-2">
                <p className="text-xs text-slate-500 mb-1">Days Remaining</p>
                <p className="text-sm font-medium text-slate-900">
                  {Math.ceil((new Date(dealRoom.target_close_date) - new Date()) / (1000 * 60 * 60 * 24))} days
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Startup Info */}
      {startup && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Startup Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-slate-500 mb-1">Company</p>
              <p className="text-sm font-medium text-slate-900">{startup.company_name}</p>
            </div>
            {startup.industry?.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-2">Industry</p>
                <div className="flex flex-wrap gap-1">
                  {startup.industry.map((ind, i) => (
                    <Badge key={i} variant="secondary">{ind}</Badge>
                  ))}
                </div>
              </div>
            )}
            {startup.one_liner && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Description</p>
                <p className="text-sm text-slate-700">{startup.one_liner}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}