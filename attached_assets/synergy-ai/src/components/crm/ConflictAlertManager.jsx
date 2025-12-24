import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  AlertTriangle, Plus, X, Settings, Shield, Trash2
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const CONFLICT_TYPES = [
  { value: 'portfolio_overlap', label: 'Portfolio Company Overlap' },
  { value: 'sector_competition', label: 'Sector Competition' },
  { value: 'fund_lifecycle', label: 'Fund Lifecycle Issues' },
  { value: 'geographic_mismatch', label: 'Geographic Mismatch' },
  { value: 'stage_mismatch', label: 'Stage Mismatch' },
  { value: 'check_size_mismatch', label: 'Check Size Mismatch' },
  { value: 'slow_response', label: 'Slow Response Time' },
  { value: 'low_engagement', label: 'Low Engagement History' },
  { value: 'negative_sentiment', label: 'Negative Sentiment' },
  { value: 'custom', label: 'Custom Criteria' },
];

const SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'];

export default function ConflictAlertManager({ firm, conflicts = [], onAlertsUpdate }) {
  const [rules, setRules] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    type: 'portfolio_overlap',
    severity: 'medium',
    criteria: '',
    threshold: '',
    description: '',
  });

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      const user = await base44.auth.me();
      const existingRules = user.conflict_alert_rules || [];
      setRules(existingRules);
    } catch (error) {
      console.error('Error loading rules:', error);
    }
  };

  const addRule = async () => {
    try {
      const user = await base44.auth.me();
      const updatedRules = [...(user.conflict_alert_rules || []), {
        ...newRule,
        id: Date.now().toString(),
        created_at: new Date().toISOString(),
      }];
      
      await base44.auth.updateMe({ conflict_alert_rules: updatedRules });
      setRules(updatedRules);
      setShowDialog(false);
      resetForm();
      
      if (onAlertsUpdate) onAlertsUpdate();
    } catch (error) {
      console.error('Error adding rule:', error);
    }
  };

  const deleteRule = async (ruleId) => {
    try {
      const user = await base44.auth.me();
      const updatedRules = (user.conflict_alert_rules || []).filter(r => r.id !== ruleId);
      await base44.auth.updateMe({ conflict_alert_rules: updatedRules });
      setRules(updatedRules);
      
      if (onAlertsUpdate) onAlertsUpdate();
    } catch (error) {
      console.error('Error deleting rule:', error);
    }
  };

  const resetForm = () => {
    setNewRule({
      name: '',
      type: 'portfolio_overlap',
      severity: 'medium',
      criteria: '',
      threshold: '',
      description: '',
    });
  };

  const getSeverityColor = (severity) => {
    const colors = {
      low: 'bg-blue-100 text-blue-800',
      medium: 'bg-amber-100 text-amber-800',
      high: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800',
    };
    return colors[severity] || colors.medium;
  };

  // Evaluate rules against current firm
  const evaluatedAlerts = rules.map(rule => {
    let triggered = false;
    let message = '';

    switch (rule.type) {
      case 'portfolio_overlap':
        if (firm.portfolio_companies?.length > parseInt(rule.threshold || 5)) {
          triggered = true;
          message = `Has ${firm.portfolio_companies.length} portfolio companies (threshold: ${rule.threshold})`;
        }
        break;
      case 'fund_lifecycle':
        if (firm.current_fund_raised && firm.current_fund_target) {
          const deploymentRate = (firm.current_fund_raised / firm.current_fund_target) * 100;
          if (deploymentRate > parseFloat(rule.threshold || 80)) {
            triggered = true;
            message = `Fund ${deploymentRate.toFixed(0)}% deployed (threshold: ${rule.threshold}%)`;
          }
        }
        break;
      case 'check_size_mismatch':
        const threshold = parseFloat(rule.threshold);
        if (firm.check_size_min && threshold && firm.check_size_min > threshold) {
          triggered = true;
          message = `Min check $${(firm.check_size_min / 1000000).toFixed(1)}M exceeds threshold $${(threshold / 1000000).toFixed(1)}M`;
        }
        break;
      case 'negative_sentiment':
        // This would be evaluated from sentiment data
        const hasNegativeSentiment = conflicts.some(c => c.type === 'negative_sentiment');
        if (hasNegativeSentiment) {
          triggered = true;
          message = 'Negative sentiment detected in recent analysis';
        }
        break;
      default:
        // For custom rules, check if conflict exists
        const matchingConflict = conflicts.find(c => 
          c.type === rule.type || c.description?.toLowerCase().includes(rule.criteria?.toLowerCase())
        );
        if (matchingConflict) {
          triggered = true;
          message = matchingConflict.description;
        }
    }

    return {
      ...rule,
      triggered,
      message,
    };
  });

  const activeAlerts = evaluatedAlerts.filter(a => a.triggered);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-600" />
              Conflict Alert Rules
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setShowDialog(true)}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Rule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {activeAlerts.length > 0 && (
            <div className="mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-sm font-medium text-amber-900 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {activeAlerts.length} Alert{activeAlerts.length > 1 ? 's' : ''} Triggered
              </p>
              <div className="space-y-2">
                {activeAlerts.map((alert) => (
                  <div key={alert.id} className="bg-white rounded p-2 border border-amber-200">
                    <div className="flex items-start justify-between mb-1">
                      <p className="text-sm font-medium text-slate-900">{alert.name}</p>
                      <Badge className={getSeverityColor(alert.severity)}>
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600">{alert.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rules.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">
              No alert rules configured. Add rules to monitor for conflicts.
            </p>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{rule.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {CONFLICT_TYPES.find(t => t.value === rule.type)?.label || rule.type}
                      </Badge>
                      <Badge className={cn("text-xs", getSeverityColor(rule.severity))}>
                        {rule.severity}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => deleteRule(rule.id)}
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Rule Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Conflict Alert Rule</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Rule Name</Label>
              <Input
                value={newRule.name}
                onChange={(e) => setNewRule({...newRule, name: e.target.value})}
                placeholder="e.g., Large Portfolio Competition"
              />
            </div>

            <div>
              <Label>Conflict Type</Label>
              <Select
                value={newRule.type}
                onValueChange={(value) => setNewRule({...newRule, type: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFLICT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Severity Level</Label>
              <Select
                value={newRule.severity}
                onValueChange={(value) => setNewRule({...newRule, severity: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {['portfolio_overlap', 'fund_lifecycle', 'check_size_mismatch'].includes(newRule.type) && (
              <div>
                <Label>Threshold</Label>
                <Input
                  type="number"
                  value={newRule.threshold}
                  onChange={(e) => setNewRule({...newRule, threshold: e.target.value})}
                  placeholder={
                    newRule.type === 'portfolio_overlap' ? 'Number of companies' :
                    newRule.type === 'fund_lifecycle' ? 'Deployment % (e.g., 85)' :
                    'Amount in USD'
                  }
                />
              </div>
            )}

            {newRule.type === 'custom' && (
              <div>
                <Label>Criteria Keywords</Label>
                <Input
                  value={newRule.criteria}
                  onChange={(e) => setNewRule({...newRule, criteria: e.target.value})}
                  placeholder="e.g., competitor, conflict, issue"
                />
              </div>
            )}

            <div>
              <Label>Description</Label>
              <Input
                value={newRule.description}
                onChange={(e) => setNewRule({...newRule, description: e.target.value})}
                placeholder="What to check for..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={addRule}
                disabled={!newRule.name || !newRule.type}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                Add Rule
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}