import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Building2, MapPin, DollarSign, Star, ExternalLink } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function DealInvestors({ dealRoom, matches, firms, contacts }) {
  const dealMatches = matches.filter(m => dealRoom.match_ids?.includes(m.id));
  const dealFirms = firms.filter(f => dealRoom.investor_ids?.includes(f.id));

  return (
    <div className="space-y-6">
      {/* Committed Investors */}
      {dealFirms.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Committed Investors</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dealFirms.map((firm) => {
              const contact = contacts.find(c => c.firm_id === firm.id && c.is_primary);
              const isLead = firm.id === dealRoom.lead_investor_id;
              
              return (
                <Card key={firm.id} className={cn(isLead && "border-indigo-300 bg-indigo-50")}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-slate-900">{firm.company_name}</h4>
                        <p className="text-sm text-slate-500">{firm.firm_type}</p>
                        {isLead && (
                          <Badge className="mt-2 bg-indigo-600 text-white">Lead Investor</Badge>
                        )}
                      </div>
                      {firm.linkedin_url && (
                        <Button variant="ghost" size="icon" asChild>
                          <a href={firm.linkedin_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                      )}
                    </div>

                    {contact && (
                      <div className="mb-3 p-2 bg-slate-50 rounded">
                        <p className="text-xs text-slate-500">Contact</p>
                        <p className="text-sm font-medium text-slate-900">{contact.full_name}</p>
                        <p className="text-xs text-slate-600">{contact.title}</p>
                      </div>
                    )}

                    <div className="space-y-1 text-xs text-slate-600">
                      {firm.investment_focus?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {firm.investment_focus.slice(0, 3).map((focus, i) => (
                            <Badge key={i} variant="outline" className="text-xs">{focus}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Potential Investors (Matches) */}
      {dealMatches.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Potential Investors ({dealMatches.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dealMatches.map((match) => {
              const firm = firms.find(f => f.id === match.firm_id);
              const contact = contacts.find(c => c.id === match.contact_id);
              if (!firm) return null;

              return (
                <Card key={match.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-slate-500" />
                        </div>
                        <div>
                          <h4 className="font-medium text-slate-900 text-sm">{firm.company_name}</h4>
                          <p className="text-xs text-slate-500">{firm.firm_type}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-500" />
                          <span className="text-sm font-semibold text-slate-900">
                            {match.match_score}
                          </span>
                        </div>
                      </div>
                    </div>

                    {contact && (
                      <div className="mb-2 text-xs">
                        <p className="text-slate-500">Contact: <span className="text-slate-900">{contact.full_name}</span></p>
                      </div>
                    )}

                    {firm.investment_stages?.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-slate-600 mb-2">
                        <DollarSign className="w-3 h-3" />
                        <span>{firm.investment_stages.join(', ')}</span>
                      </div>
                    )}

                    {match.match_reasons?.length > 0 && (
                      <div className="mt-3 p-2 bg-emerald-50 rounded text-xs">
                        <p className="text-emerald-700">{match.match_reasons[0]}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {dealFirms.length === 0 && dealMatches.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Building2 className="w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No Investors Yet</h3>
            <p className="text-slate-500 text-sm max-w-md">
              Add matches to this deal room from the Matches page to track potential investors
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}