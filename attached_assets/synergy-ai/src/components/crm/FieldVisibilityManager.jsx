import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Settings2, Check } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const FIELD_CATEGORIES_FIRM = {
  basic: {
    label: 'Basic Information',
    fields: ['company_name', 'firm_type', 'website', 'linkedin_url', 'location', 'city', 'country']
  },
  fund: {
    label: 'Fund Details',
    fields: ['fund_description', 'fund_focus', 'fund_stage', 'investment_stages', 'investment_focus', 'investing_sectors']
  },
  financial: {
    label: 'Financial',
    fields: ['aum', 'aum_usd_millions', 'deal_size_range', 'check_size_min', 'check_size_max', 'avg_check_size', 'funding_raised']
  },
  portfolio: {
    label: 'Portfolio & Track Record',
    fields: ['portfolio_companies', 'total_investments', 'number_of_investments', 'total_exits', 'number_of_exits']
  },
  geographic: {
    label: 'Geographic Focus',
    fields: ['preferred_geography', 'street_address', 'state_region', 'family_office_city', 'family_office_state', 'family_office_country']
  },
  social: {
    label: 'Social & Web',
    fields: ['twitter_url', 'facebook_url', 'urls', 'vc_logo']
  },
  metadata: {
    label: 'Metadata',
    fields: ['foundation_year', 'founding_year', 'employee_range', 'industry', 'parent_company', 'managing_organization']
  },
  quality: {
    label: 'Data Quality',
    fields: ['data_completion_score', 'data_completion_score_visual', 'data_validation_period', 'url_quality', 'data_record_fill_rate']
  },
  family_office: {
    label: 'Family Office',
    fields: ['family_office_website', 'firm_structure']
  },
  contact_info: {
    label: 'Contact Details',
    fields: ['emails', 'phones', 'addresses']
  },
  system: {
    label: 'System',
    fields: ['folk_created_at', 'folk_created_by', 'folk_added_to_group_at', 'last_synced_at', 'enrichment_status', 'last_enriched']
  }
};

const FIELD_CATEGORIES_CONTACT = {
  basic: {
    label: 'Basic Information',
    fields: ['full_name', 'firm', 'title', 'work_email', 'personal_email', 'primary_phone', 'secondary_phone']
  },
  social: {
    label: 'Social & Web',
    fields: ['linkedin_url', 'twitter_url']
  },
  details: {
    label: 'Additional Details',
    fields: ['location', 'bio', 'is_primary']
  },
  investment: {
    label: 'Investment Info',
    fields: ['investment_focus', 'preferred_geography']
  },
  metadata: {
    label: 'Metadata',
    fields: ['enrichment_status', 'last_enriched', 'created_date']
  }
};

const DEFAULT_VISIBLE_FIELDS_FIRM = [
  'company_name', 'firm_type', 'website', 'linkedin_url', 'investment_stages', 
  'investment_focus', 'preferred_geography', 'portfolio_companies', 'total_investments'
];

const DEFAULT_VISIBLE_FIELDS_CONTACT = [
  'full_name', 'firm', 'work_email', 'primary_phone', 'title', 'enrichment_status'
];

export default function FieldVisibilityManager({ visibleFields, onFieldsChange, entityType = 'firm' }) {
  const FIELD_CATEGORIES = entityType === 'contact' ? FIELD_CATEGORIES_CONTACT : FIELD_CATEGORIES_FIRM;
  const DEFAULT_VISIBLE_FIELDS = entityType === 'contact' ? DEFAULT_VISIBLE_FIELDS_CONTACT : DEFAULT_VISIBLE_FIELDS_FIRM;

  const [localVisible, setLocalVisible] = useState(visibleFields || DEFAULT_VISIBLE_FIELDS);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setLocalVisible(visibleFields || DEFAULT_VISIBLE_FIELDS);
  }, [visibleFields]);

  const toggleField = (field) => {
    const newVisible = localVisible.includes(field)
      ? localVisible.filter(f => f !== field)
      : [...localVisible, field];
    setLocalVisible(newVisible);
  };

  const toggleCategory = (categoryFields) => {
    const allVisible = categoryFields.every(f => localVisible.includes(f));
    const newVisible = allVisible
      ? localVisible.filter(f => !categoryFields.includes(f))
      : [...new Set([...localVisible, ...categoryFields])];
    setLocalVisible(newVisible);
  };

  const applyChanges = () => {
    onFieldsChange(localVisible);
    setOpen(false);
  };

  const resetToDefault = () => {
    setLocalVisible(DEFAULT_VISIBLE_FIELDS);
  };

  const showAll = () => {
    const allFields = Object.values(FIELD_CATEGORIES).flatMap(cat => cat.fields);
    setLocalVisible(allFields);
  };

  const hideAll = () => {
    setLocalVisible(['company_name']); // Always keep company name visible
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="w-4 h-4" />
          Columns ({localVisible.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Visible Fields</h4>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={resetToDefault}>
                Reset
              </Button>
              <Button variant="ghost" size="sm" onClick={hideAll}>
                Hide All
              </Button>
              <Button variant="ghost" size="sm" onClick={showAll}>
                Show All
              </Button>
            </div>
          </div>

          <ScrollArea className="h-96">
            <div className="space-y-4 pr-4">
              {Object.entries(FIELD_CATEGORIES).map(([key, category]) => {
                const visibleCount = category.fields.filter(f => localVisible.includes(f)).length;
                const allVisible = visibleCount === category.fields.length;
                
                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => toggleCategory(category.fields)}
                        className="flex items-center gap-2 text-sm font-medium hover:text-indigo-600"
                      >
                        {allVisible ? (
                          <Eye className="w-4 h-4 text-indigo-600" />
                        ) : visibleCount > 0 ? (
                          <EyeOff className="w-4 h-4 text-amber-500" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-slate-400" />
                        )}
                        {category.label}
                      </button>
                      <Badge variant="secondary" className="text-xs">
                        {visibleCount}/{category.fields.length}
                      </Badge>
                    </div>
                    <div className="space-y-1 pl-6">
                      {category.fields.map(field => (
                        <div key={field} className="flex items-center space-x-2">
                          <Checkbox
                            id={field}
                            checked={localVisible.includes(field)}
                            onCheckedChange={() => toggleField(field)}
                            disabled={field === 'company_name'} // Always visible
                          />
                          <label
                            htmlFor={field}
                            className="text-xs text-slate-600 cursor-pointer hover:text-slate-900"
                          >
                            {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </label>
                        </div>
                      ))}
                    </div>
                    <Separator />
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="flex justify-between pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={applyChanges} className="gap-2">
              <Check className="w-4 h-4" />
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}