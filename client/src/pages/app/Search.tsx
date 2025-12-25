import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  Search as SearchIcon, 
  Building2, 
  Users, 
  Rocket,
  Mail, 
  ExternalLink, 
  ArrowRight,
  Loader2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  LiquidBackground, 
  GlassSurface,
  AnimatedGrid 
} from "@/components/liquid-glass";
import type { InvestmentFirm, Contact, Startup, Investor } from "@shared/schema";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const { data: firms = [], isLoading: firmsLoading } = useQuery<InvestmentFirm[]>({
    queryKey: ["/api/investment-firms"],
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: startups = [], isLoading: startupsLoading } = useQuery<Startup[]>({
    queryKey: ["/api/startups/all"],
  });

  const { data: investors = [], isLoading: investorsLoading } = useQuery<Investor[]>({
    queryKey: ["/api/investors"],
  });

  const firmsMap = useMemo(
    () => firms.reduce((acc, f) => ({ ...acc, [f.id]: f }), {} as Record<string, InvestmentFirm>),
    [firms]
  );

  const searchResults = useMemo(() => {
    if (!query.trim()) return { firms: [], contacts: [], startups: [], investors: [] };

    const q = query.toLowerCase();

    const matchedFirms = firms.filter(f => 
      f.name?.toLowerCase().includes(q) ||
      f.sectors?.some((s: string) => s.toLowerCase().includes(q)) ||
      f.type?.toLowerCase().includes(q)
    );

    const matchedContacts = contacts.filter(c => {
      const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ");
      return fullName.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.title?.toLowerCase().includes(q);
    });

    const matchedStartups = startups.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.industries?.some((ind: string) => ind.toLowerCase().includes(q)) ||
      s.tagline?.toLowerCase().includes(q)
    );

    const matchedInvestors = investors.filter(i =>
      [i.firstName, i.lastName].filter(Boolean).join(" ").toLowerCase().includes(q) ||
      i.email?.toLowerCase().includes(q) ||
      i.title?.toLowerCase().includes(q)
    );

    return {
      firms: matchedFirms,
      contacts: matchedContacts,
      startups: matchedStartups,
      investors: matchedInvestors,
    };
  }, [query, firms, contacts, startups, investors]);

  const totalResults = searchResults.firms.length + searchResults.contacts.length + 
                       searchResults.startups.length + searchResults.investors.length;

  const getFilteredResults = () => {
    switch (activeTab) {
      case "firms": return { ...searchResults, contacts: [], startups: [], investors: [] };
      case "contacts": return { ...searchResults, firms: [], startups: [], investors: [] };
      case "startups": return { ...searchResults, firms: [], contacts: [], investors: [] };
      case "investors": return { ...searchResults, firms: [], contacts: [], startups: [] };
      default: return searchResults;
    }
  };

  const filtered = getFilteredResults();
  const isLoading = firmsLoading || contactsLoading || startupsLoading || investorsLoading;

  return (
    <div className="relative min-h-screen">
      <LiquidBackground />
      <AnimatedGrid />

      <div className="max-w-4xl mx-auto space-y-6 p-6">
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search investors, contacts, startups..."
            className="pl-12 h-14 text-lg rounded-2xl bg-white/70 dark:bg-slate-800/70 border-2 border-white/60 dark:border-white/20 backdrop-blur-2xl shadow-lg"
            autoFocus
            data-testid="input-global-search"
          />
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
          </div>
        )}

        {query && !isLoading && (
          <>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="rounded-2xl bg-white/55 dark:bg-slate-800/55 border-2 border-white/60 dark:border-white/20 backdrop-blur-2xl">
                <TabsTrigger value="all" className="rounded-xl">
                  All <Badge className="ml-1.5 rounded-full">{totalResults}</Badge>
                </TabsTrigger>
                <TabsTrigger value="firms" className="rounded-xl">
                  Firms <Badge className="ml-1.5 rounded-full">{searchResults.firms.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="investors" className="rounded-xl">
                  Investors <Badge className="ml-1.5 rounded-full">{searchResults.investors.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="contacts" className="rounded-xl">
                  Contacts <Badge className="ml-1.5 rounded-full">{searchResults.contacts.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="startups" className="rounded-xl">
                  Startups <Badge className="ml-1.5 rounded-full">{searchResults.startups.length}</Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="space-y-6">
              {filtered.firms.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Investment Firms
                  </h3>
                  <div className="space-y-2">
                    {filtered.firms.slice(0, 10).map((firm) => (
                      <Link key={firm.id} href={`/app/firms/${firm.id}`}>
                        <GlassSurface 
                          className="flex items-center justify-between p-4 cursor-pointer group"
                          data-testid={`search-result-firm-${firm.id}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                            </div>
                            <div>
                              <p className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                {firm.name}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {firm.type && <Badge className="text-xs">{firm.type}</Badge>}
                                {firm.sectors?.slice(0, 2).map((s: string, i: number) => (
                                  <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                        </GlassSurface>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {filtered.investors.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Investors
                  </h3>
                  <div className="space-y-2">
                    {filtered.investors.slice(0, 10).map((investor) => (
                      <Link key={investor.id} href={`/app/investors/${investor.id}`}>
                        <GlassSurface 
                          className="flex items-center justify-between p-4 cursor-pointer group"
                          data-testid={`search-result-investor-${investor.id}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-violet-400 rounded-full flex items-center justify-center text-white font-medium">
                              {investor.firstName?.charAt(0) || "?"}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                {[investor.firstName, investor.lastName].filter(Boolean).join(" ")}
                              </p>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                {investor.title}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {investor.email && (
                              <a 
                                href={`mailto:${investor.email}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                              >
                                <Mail className="w-4 h-4" />
                              </a>
                            )}
                            {investor.linkedinUrl && (
                              <a 
                                href={investor.linkedinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                          </div>
                        </GlassSurface>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {filtered.contacts.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Contacts
                  </h3>
                  <div className="space-y-2">
                    {filtered.contacts.slice(0, 10).map((contact) => {
                      const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
                      return (
                        <GlassSurface 
                          key={contact.id}
                          className="flex items-center justify-between p-4 cursor-pointer group"
                          data-testid={`search-result-contact-${contact.id}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-violet-400 rounded-full flex items-center justify-center text-white font-medium">
                              {contact.firstName?.charAt(0) || "?"}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                {fullName}
                              </p>
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                {contact.title} {contact.company && `at ${contact.company}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {contact.email && (
                              <a 
                                href={`mailto:${contact.email}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                              >
                                <Mail className="w-4 h-4" />
                              </a>
                            )}
                            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                          </div>
                        </GlassSurface>
                      );
                    })}
                  </div>
                </div>
              )}

              {filtered.startups.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                    <Rocket className="w-4 h-4" />
                    Startups
                  </h3>
                  <div className="space-y-2">
                    {filtered.startups.slice(0, 10).map((startup) => (
                      <Link key={startup.id} href={`/app/startups/${startup.id}`}>
                        <GlassSurface 
                          className="flex items-center justify-between p-4 cursor-pointer group"
                          data-testid={`search-result-startup-${startup.id}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-lg flex items-center justify-center text-white font-bold">
                              {startup.name?.charAt(0)}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                {startup.name}
                              </p>
                              <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1">
                                {startup.tagline || startup.industries?.join(", ")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {startup.stage && <Badge>{startup.stage}</Badge>}
                            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                          </div>
                        </GlassSurface>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {totalResults === 0 && (
                <div className="text-center py-12">
                  <SearchIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-1">No results found</h3>
                  <p className="text-slate-500 dark:text-slate-400">Try a different search term</p>
                </div>
              )}
            </div>
          </>
        )}

        {!query && !isLoading && (
          <div className="text-center py-12">
            <SearchIcon className="w-16 h-16 text-slate-200 dark:text-slate-700 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Search Everything</h2>
            <p className="text-slate-500 dark:text-slate-400">
              Find investors, contacts, startups, and more
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
