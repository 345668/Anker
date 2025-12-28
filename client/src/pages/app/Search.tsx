import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { 
  Search as SearchIcon, 
  Building2, 
  Users, 
  Rocket,
  Mail, 
  ExternalLink, 
  ArrowRight,
  Sparkles
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
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
    <AppLayout
      title="Global Search"
      subtitle="Find investors, firms, startups, and contacts across your network"
      heroHeight="35vh"
      videoUrl={videoBackgrounds.search}
    >
      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-4xl mx-auto px-6">
          {/* Search Input */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative mb-8"
          >
            <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search investors, firms, contacts, startups..."
              className="pl-14 h-14 text-lg rounded-full bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-[rgb(142,132,247)] focus:ring-[rgb(142,132,247)]/20"
              autoFocus
              data-testid="input-global-search"
            />
          </motion.div>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {query && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
                <TabsList className="w-full flex flex-wrap gap-2 p-2 rounded-2xl border border-white/10 bg-white/5">
                  <TabsTrigger 
                    value="all" 
                    className="rounded-full px-4 py-2 text-white/60 data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white"
                  >
                    All <span className="ml-1.5 px-2 py-0.5 rounded-full bg-white/10 text-xs">{totalResults}</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="firms" 
                    className="rounded-full px-4 py-2 text-white/60 data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white"
                  >
                    Firms <span className="ml-1.5 px-2 py-0.5 rounded-full bg-white/10 text-xs">{searchResults.firms.length}</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="investors" 
                    className="rounded-full px-4 py-2 text-white/60 data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white"
                  >
                    Investors <span className="ml-1.5 px-2 py-0.5 rounded-full bg-white/10 text-xs">{searchResults.investors.length}</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="contacts" 
                    className="rounded-full px-4 py-2 text-white/60 data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white"
                  >
                    Contacts <span className="ml-1.5 px-2 py-0.5 rounded-full bg-white/10 text-xs">{searchResults.contacts.length}</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="startups" 
                    className="rounded-full px-4 py-2 text-white/60 data-[state=active]:bg-[rgb(142,132,247)] data-[state=active]:text-white"
                  >
                    Startups <span className="ml-1.5 px-2 py-0.5 rounded-full bg-white/10 text-xs">{searchResults.startups.length}</span>
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="space-y-8">
                {/* Firms */}
                {filtered.firms.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-white/50 mb-4 flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      Investment Firms
                    </h3>
                    <div className="space-y-3">
                      {filtered.firms.slice(0, 10).map((firm, idx) => (
                        <motion.div
                          key={firm.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                        >
                          <Link href={`/app/firms/${firm.id}`}>
                            <div 
                              className="group flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[rgb(142,132,247)]/50 transition-all cursor-pointer"
                              data-testid={`search-result-firm-${firm.id}`}
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] flex items-center justify-center">
                                  <Building2 className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                  <p className="font-medium text-white group-hover:text-[rgb(142,132,247)] transition-colors">
                                    {firm.name}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    {firm.type && (
                                      <span className="px-2 py-0.5 rounded-full text-xs bg-white/10 text-white/60">
                                        {firm.type}
                                      </span>
                                    )}
                                    {firm.sectors?.slice(0, 2).map((s: string, i: number) => (
                                      <span key={i} className="px-2 py-0.5 rounded-full text-xs border border-white/10 text-white/50">
                                        {s}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <ArrowRight className="w-5 h-5 text-white/30 group-hover:text-[rgb(142,132,247)] transition-colors" />
                            </div>
                          </Link>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Investors */}
                {filtered.investors.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-white/50 mb-4 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Investors
                    </h3>
                    <div className="space-y-3">
                      {filtered.investors.slice(0, 10).map((investor, idx) => (
                        <motion.div
                          key={investor.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                        >
                          <Link href={`/app/investors/${investor.id}`}>
                            <div 
                              className="group flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[rgb(142,132,247)]/50 transition-all cursor-pointer"
                              data-testid={`search-result-investor-${investor.id}`}
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] flex items-center justify-center text-white font-medium">
                                  {investor.firstName?.charAt(0) || "?"}
                                </div>
                                <div>
                                  <p className="font-medium text-white group-hover:text-[rgb(142,132,247)] transition-colors">
                                    {[investor.firstName, investor.lastName].filter(Boolean).join(" ")}
                                  </p>
                                  <p className="text-sm text-white/50">
                                    {investor.title}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {investor.email && (
                                  <a 
                                    href={`mailto:${investor.email}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-[rgb(142,132,247)]"
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
                                    className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-[rgb(142,132,247)]"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                )}
                                <ArrowRight className="w-5 h-5 text-white/30 group-hover:text-[rgb(142,132,247)] transition-colors" />
                              </div>
                            </div>
                          </Link>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contacts */}
                {filtered.contacts.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-white/50 mb-4 flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Contacts
                    </h3>
                    <div className="space-y-3">
                      {filtered.contacts.slice(0, 10).map((contact, idx) => {
                        const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
                        return (
                          <motion.div
                            key={contact.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.03 }}
                          >
                            <div 
                              className="group flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[rgb(142,132,247)]/50 transition-all cursor-pointer"
                              data-testid={`search-result-contact-${contact.id}`}
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] flex items-center justify-center text-white font-medium">
                                  {contact.firstName?.charAt(0) || "?"}
                                </div>
                                <div>
                                  <p className="font-medium text-white group-hover:text-[rgb(142,132,247)] transition-colors">
                                    {fullName}
                                  </p>
                                  <p className="text-sm text-white/50">
                                    {contact.title} {contact.company && `at ${contact.company}`}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {contact.email && (
                                  <a 
                                    href={`mailto:${contact.email}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-[rgb(142,132,247)]"
                                  >
                                    <Mail className="w-4 h-4" />
                                  </a>
                                )}
                                <ArrowRight className="w-5 h-5 text-white/30 group-hover:text-[rgb(142,132,247)] transition-colors" />
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Startups */}
                {filtered.startups.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-white/50 mb-4 flex items-center gap-2">
                      <Rocket className="w-4 h-4" />
                      Startups
                    </h3>
                    <div className="space-y-3">
                      {filtered.startups.slice(0, 10).map((startup, idx) => (
                        <motion.div
                          key={startup.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                        >
                          <Link href={`/app/startups/${startup.id}`}>
                            <div 
                              className="group flex items-center justify-between p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[rgb(142,132,247)]/50 transition-all cursor-pointer"
                              data-testid={`search-result-startup-${startup.id}`}
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] flex items-center justify-center text-white font-bold">
                                  {startup.name?.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-medium text-white group-hover:text-[rgb(142,132,247)] transition-colors">
                                    {startup.name}
                                  </p>
                                  <p className="text-sm text-white/50 line-clamp-1">
                                    {startup.tagline || startup.industries?.join(", ")}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                {startup.stage && (
                                  <span className="px-3 py-1 rounded-full text-xs bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)]">
                                    {startup.stage}
                                  </span>
                                )}
                                <ArrowRight className="w-5 h-5 text-white/30 group-hover:text-[rgb(142,132,247)] transition-colors" />
                              </div>
                            </div>
                          </Link>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No Results */}
                {totalResults === 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center py-16 rounded-2xl border border-white/10 bg-white/5"
                  >
                    <div 
                      className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-6"
                      style={{ backgroundColor: 'rgba(142, 132, 247, 0.2)' }}
                    >
                      <SearchIcon className="w-10 h-10 text-[rgb(142,132,247)]" />
                    </div>
                    <h3 className="text-xl font-light text-white mb-2">No results found</h3>
                    <p className="text-white/50">Try a different search term</p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* Empty State */}
          {!query && !isLoading && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-16"
            >
              <div 
                className="w-24 h-24 mx-auto rounded-2xl flex items-center justify-center mb-6"
                style={{ backgroundColor: 'rgba(142, 132, 247, 0.2)' }}
              >
                <Sparkles className="w-12 h-12 text-[rgb(142,132,247)]" />
              </div>
              <h2 className="text-2xl font-light text-white mb-3">Search Everything</h2>
              <p className="text-white/50 max-w-md mx-auto">
                Find investors, contacts, startups, and firms across your entire network
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
