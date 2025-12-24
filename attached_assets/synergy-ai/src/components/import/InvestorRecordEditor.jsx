import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { X, Save, Sparkles, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Badge } from "@/components/ui/badge";

const firmTypes = [
  'Venture Capital',
  'Corporate Venture Capital',
  'Family Office',
  'Angel Investor',
  'Angel Group/Network',
  'Private Equity',
  'Fund of Funds',
  'Accelerator/Incubator',
  'Micro VC',
  'Growth Equity',
  'Syndicate',
  'Other'
];

const investmentStages = [
  'Pre-seed',
  'Seed',
  'Series A',
  'Series B',
  'Series C+',
  'Growth',
  'Late Stage'
];

export default function InvestorRecordEditor({ record, type = 'firm', open, onClose, onSave }) {
  const [formData, setFormData] = useState(record || {});
  const [enriching, setEnriching] = useState(false);

  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleArrayChange = (field, value) => {
    const array = value.split(',').map(v => v.trim()).filter(Boolean);
    setFormData({ ...formData, [field]: array });
  };

  const handleSave = () => {
    onSave(formData);
  };

  const enrichWithAI = async () => {
    setEnriching(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Enrich this investor profile with web research.

Name: ${formData.company_name || formData.full_name}
${formData.website ? `Website: ${formData.website}` : ''}
${formData.linkedin_url ? `LinkedIn: ${formData.linkedin_url}` : ''}

Research and provide:
- Investment focus/sectors
- Geographic preferences
- Investment stages
- Check size range
- Recent investments
- Key information

Be specific and accurate.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            investment_focus: { type: 'array', items: { type: 'string' } },
            investing_sectors: { type: 'array', items: { type: 'string' } },
            investment_stages: { type: 'array', items: { type: 'string' } },
            geographic_focus: { type: 'array', items: { type: 'string' } },
            check_size_min: { type: 'number' },
            check_size_max: { type: 'number' },
            firm_description: { type: 'string' },
            investment_thesis: { type: 'string' }
          }
        }
      });

      setFormData({ ...formData, ...result });
    } catch (error) {
      console.error('Enrichment error:', error);
    } finally {
      setEnriching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {record ? 'Edit' : 'Add'} {type === 'firm' ? 'Investor' : 'Contact'}
          </DialogTitle>
          <DialogDescription>
            Fill in the details below. Use AI enrichment to auto-fill missing information.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {type === 'firm' ? (
            <>
              {/* Firm Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="company_name">Company Name *</Label>
                  <Input
                    id="company_name"
                    value={formData.company_name || ''}
                    onChange={(e) => handleChange('company_name', e.target.value)}
                    placeholder="Acme Ventures"
                  />
                </div>

                <div>
                  <Label htmlFor="firm_type">Firm Type</Label>
                  <Select
                    value={formData.firm_type || ''}
                    onValueChange={(value) => handleChange('firm_type', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {firmTypes.map((type) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    value={formData.website || ''}
                    onChange={(e) => handleChange('website', e.target.value)}
                    placeholder="https://..."
                  />
                </div>

                <div>
                  <Label htmlFor="linkedin_url">LinkedIn</Label>
                  <Input
                    id="linkedin_url"
                    value={formData.linkedin_url || ''}
                    onChange={(e) => handleChange('linkedin_url', e.target.value)}
                    placeholder="https://linkedin.com/company/..."
                  />
                </div>

                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city || ''}
                    onChange={(e) => handleChange('city', e.target.value)}
                    placeholder="San Francisco"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="firm_description">Description</Label>
                  <Textarea
                    id="firm_description"
                    value={formData.firm_description || ''}
                    onChange={(e) => handleChange('firm_description', e.target.value)}
                    placeholder="Brief description of the firm..."
                    rows={3}
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="investment_focus">Investment Focus (comma-separated)</Label>
                  <Input
                    id="investment_focus"
                    value={formData.investment_focus?.join(', ') || ''}
                    onChange={(e) => handleArrayChange('investment_focus', e.target.value)}
                    placeholder="SaaS, Fintech, AI"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="investment_stages">Investment Stages (comma-separated)</Label>
                  <Input
                    id="investment_stages"
                    value={formData.investment_stages?.join(', ') || ''}
                    onChange={(e) => handleArrayChange('investment_stages', e.target.value)}
                    placeholder="Seed, Series A, Series B"
                  />
                </div>

                <div>
                  <Label htmlFor="check_size_min">Min Check Size ($)</Label>
                  <Input
                    id="check_size_min"
                    type="number"
                    value={formData.check_size_min || ''}
                    onChange={(e) => handleChange('check_size_min', parseFloat(e.target.value))}
                    placeholder="100000"
                  />
                </div>

                <div>
                  <Label htmlFor="check_size_max">Max Check Size ($)</Label>
                  <Input
                    id="check_size_max"
                    type="number"
                    value={formData.check_size_max || ''}
                    onChange={(e) => handleChange('check_size_max', parseFloat(e.target.value))}
                    placeholder="5000000"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Contact Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name || ''}
                    onChange={(e) => handleChange('full_name', e.target.value)}
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formData.title || ''}
                    onChange={(e) => handleChange('title', e.target.value)}
                    placeholder="Partner"
                  />
                </div>

                <div>
                  <Label htmlFor="firm_name">Firm Name</Label>
                  <Input
                    id="firm_name"
                    value={formData.firm_name || ''}
                    onChange={(e) => handleChange('firm_name', e.target.value)}
                    placeholder="Acme Ventures"
                  />
                </div>

                <div>
                  <Label htmlFor="work_email">Work Email</Label>
                  <Input
                    id="work_email"
                    type="email"
                    value={formData.work_email || ''}
                    onChange={(e) => handleChange('work_email', e.target.value)}
                    placeholder="john@acme.vc"
                  />
                </div>

                <div>
                  <Label htmlFor="primary_phone">Phone</Label>
                  <Input
                    id="primary_phone"
                    value={formData.primary_phone || ''}
                    onChange={(e) => handleChange('primary_phone', e.target.value)}
                    placeholder="+1 555 1234"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="linkedin_url">LinkedIn</Label>
                  <Input
                    id="linkedin_url"
                    value={formData.linkedin_url || ''}
                    onChange={(e) => handleChange('linkedin_url', e.target.value)}
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>
              </div>
            </>
          )}

          {/* AI Enrichment Button */}
          <div className="flex justify-center pt-4 border-t">
            <Button
              onClick={enrichWithAI}
              disabled={enriching || !formData.company_name}
              variant="outline"
              className="w-full"
            >
              {enriching ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Researching...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Auto-Fill with AI Research
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={type === 'firm' ? !formData.company_name : !formData.full_name}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}