import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { 
  Search as SearchIcon, Loader2, Building2, Users, Rocket,
  Mail, ExternalLink, ArrowRight
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export default function Search() {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [isSearching, setIsSearching] = useState(false);

  const { data: firms = [] } = useQuery({
    queryKey: ['firms'],
    queryFn: () => base44.entities.InvestorFirm.list('-created_date', 500),
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.list('-created_date', 500),
  });

  const { data: startups = [] } = useQuery({
    queryKey: ['startups'],
    queryFn: () => base44.entities.Startup.list('-created_date', 500),
  });

  const firmsMap = firms.reduce((acc, f) => ({ ...acc, [f.id]: f }), {});

  // Search logic
  const searchResults = React.useMemo(() => {
    if (!query.trim()) return { firms: [], contacts: [], startups: [] };

    const q = query.toLowerCase();

    const matchedFirms = firms.filter(f => 
      f.company_name?.toLowerCase().includes(q) ||
      f.investment_focus?.some(focus => focus.toLowerCase().includes(q)) ||
      f.firm_type?.toLowerCase().includes(q)
    );

    const matchedContacts = contacts.filter(c =>
      c.full_name?.toLowerCase().includes(q) ||
      c.work_email?.toLowerCase().includes(q) ||
      c.title?.toLowerCase().includes(q)
    );

    const matchedStartups = startups.filter(s =>
      s.company_name?.toLowerCase().includes(q) ||
      s.industry?.some(ind => ind.toLowerCase().includes(q)) ||
      s.one_liner?.toLowerCase().includes(q)
    );

    return {
      firms: matchedFirms,
      contacts: matchedContacts,
      startups: matchedStartups,
    };
  }, [query, firms, contacts, startups]);

  const totalResults = searchResults.firms.length + searchResults.contacts.length + searchResults.startups.length;

  const getFilteredResults = () => {
    switch (activeTab) {
      case 'investors': return { firms: searchResults.firms, contacts: [], startups: [] };
      case 'contacts': return { firms: [], contacts: searchResults.contacts, startups: [] };
      case 'startups': return { firms: [], contacts: [], startups: searchResults.startups };
      default: return searchResults;
    }
  };

  const filtered = getFilteredResults();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Search input */}
      <div className="relative">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search investors, contacts, startups..."
          className="pl-12 h-14 text-lg"
          autoFocus
        />
      </div>

      {query && (
        <>
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">
                All <Badge variant="secondary" className="ml-1.5">{totalResults}</Badge>
              </TabsTrigger>
              <TabsTrigger value="investors">
                Investors <Badge variant="secondary" className="ml-1.5">{searchResults.firms.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="contacts">
                Contacts <Badge variant="secondary" className="ml-1.5">{searchResults.contacts.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="startups">
                Startups <Badge variant="secondary" className="ml-1.5">{searchResults.startups.length}</Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Results */}
          <div className="space-y-6">
            {/* Investor Firms */}
            {filtered.firms.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-500 mb-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Investor Firms
                </h3>
                <div className="space-y-2">
                  {filtered.firms.slice(0, 10).map((firm) => (
                    <Link
                      key={firm.id}
                      to={createPageUrl(`Investors?highlight=${firm.id}`)}
                      className="flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-slate-500" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 group-hover:text-indigo-600">
                            {firm.company_name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="secondary" className="text-xs">{firm.firm_type}</Badge>
                            {firm.investment_focus?.slice(0, 2).map((f, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{f}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Contacts */}
            {filtered.contacts.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-500 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Contacts
                </h3>
                <div className="space-y-2">
                  {filtered.contacts.slice(0, 10).map((contact) => (
                    <Link
                      key={contact.id}
                      to={createPageUrl(`Contacts?highlight=${contact.id}`)}
                      className="flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-violet-400 rounded-full flex items-center justify-center text-white font-medium">
                          {contact.full_name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 group-hover:text-indigo-600">
                            {contact.full_name}
                          </p>
                          <p className="text-sm text-slate-500">
                            {contact.title} {firmsMap[contact.firm_id] && `at ${firmsMap[contact.firm_id].company_name}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {contact.work_email && (
                          <a 
                            href={`mailto:${contact.work_email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-slate-400 hover:text-indigo-600"
                          >
                            <Mail className="w-4 h-4" />
                          </a>
                        )}
                        {contact.linkedin_url && (
                          <a 
                            href={contact.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-slate-400 hover:text-indigo-600"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Startups */}
            {filtered.startups.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-500 mb-3 flex items-center gap-2">
                  <Rocket className="w-4 h-4" />
                  Startups
                </h3>
                <div className="space-y-2">
                  {filtered.startups.slice(0, 10).map((startup) => (
                    <Link
                      key={startup.id}
                      to={createPageUrl(`MyStartups?highlight=${startup.id}`)}
                      className="flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-lg flex items-center justify-center text-white font-bold">
                          {startup.company_name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 group-hover:text-indigo-600">
                            {startup.company_name}
                          </p>
                          <p className="text-sm text-slate-500 line-clamp-1">
                            {startup.one_liner || startup.industry?.join(', ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{startup.stage}</Badge>
                        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* No results */}
            {totalResults === 0 && (
              <div className="text-center py-12">
                <SearchIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-1">No results found</h3>
                <p className="text-slate-500">Try a different search term</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Empty state */}
      {!query && (
        <div className="text-center py-12">
          <SearchIcon className="w-16 h-16 text-slate-200 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-700 mb-2">Search across your workspace</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            Find investors by name, focus area, or type. Search contacts by name or email. 
            Discover startups by industry or stage.
          </p>
        </div>
      )}
    </div>
  );
}