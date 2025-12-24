import React, { useState } from 'react';
import { DollarSign, Edit, Check, X } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function FundingGoalEditor({ startup, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [fundingGoal, setFundingGoal] = useState(startup?.funding_goal || '');

  const formatCurrency = (value) => {
    if (!value) return 'Not set';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const handleSave = async () => {
    const numValue = parseFloat(fundingGoal) || 0;
    await onUpdate({ funding_goal: numValue });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFundingGoal(startup?.funding_goal || '');
    setIsEditing(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            Funding Goal
          </CardTitle>
          {!isEditing && (
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
              <Edit className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="number"
                value={fundingGoal}
                onChange={(e) => setFundingGoal(e.target.value)}
                placeholder="Enter amount"
                className="pl-8"
              />
            </div>
            <Button size="icon" onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700">
              <Check className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={handleCancel}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-3xl font-bold text-slate-900">
              {formatCurrency(startup?.funding_goal)}
            </p>
            <p className="text-sm text-slate-500 mt-1">Target raise amount</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}