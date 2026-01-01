import { useState, useMemo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Users, Search, Linkedin, Twitter, ArrowRight, MapPin, Building2, ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import { useFullDataset, useClientPagination } from "@/hooks/use-full-dataset";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Businessman } from "@shared/schema";

const cities = [
  "All Cities",
  "London",
  "New York",
  "Dubai",
  "Singapore",
  "Hong Kong",
  "Paris",
  "Amsterdam",
  "Zurich",
  "Geneva",
  "Munich",
  "Guwahati",
  "Mumbai",
  "Delhi",
  "Bengaluru",
  "Chennai",
  "Hyderabad",
  "Kolkata",
  "Pune",
  "Ahmedabad",
  "Dibrugarh",
  "Jorhat",
  "Shillong",
  "Tinsukia",
  "Silchar"
];

const countries = [
  "All Countries",
  "United Kingdom",
  "United States",
  "UAE",
  "Singapore",
  "Hong Kong",
  "France",
  "Netherlands",
  "Switzerland",
  "Germany",
  "India"
];

export default function Businessmen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("All Cities");
  const [countryFilter, setCountryFilter] = useState("All Countries");
  const [isEnriching, setIsEnriching] = useState(false);
  const { toast } = useToast();

  const { 
    data: businessmen, 
    total: totalBusinessmen, 
    isLoading, 
    isHydrating: hydrating,
    progress: loadProgress 
  } = useFullDataset<Businessman>("/api/businessmen");

  const cityCounts = useMemo(() => {
    const counts: Record<string, number> = {
      "All Cities": businessmen.length,
    };
    
    for (const person of businessmen) {
      const city = person.city;
      if (city) {
        counts[city] = (counts[city] || 0) + 1;
      }
    }
    
    return counts;
  }, [businessmen]);

  const filteredBusinessmen = useMemo(() => businessmen.filter((person) => {
    const matchesSearch =
      !searchQuery ||
      person.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      person.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      person.familyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      person.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      person.flagshipCompany?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      person.title?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCity =
      cityFilter === "All Cities" ||
      person.city === cityFilter;

    const matchesCountry =
      countryFilter === "All Countries" ||
      person.country === countryFilter;

    return matchesSearch && matchesCity && matchesCountry;
  }), [businessmen, searchQuery, cityFilter, countryFilter]);

  const {
    pageData: paginatedBusinessmen,
    currentPage,
    totalPages,
    nextPage,
    prevPage,
  } = useClientPagination(filteredBusinessmen, 24);

  const handleDeepResearch = async () => {
    try {
      setIsEnriching(true);
      const response = await apiRequest("POST", "/api/admin/businessmen/deep-research", { batchSize: 10 });
      const result = await response.json();
      
      toast({
        title: "Deep Research Complete",
        description: `Enriched ${result.enriched} of ${result.total} businessmen`,
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/businessmen"] });
    } catch (error: any) {
      toast({
        title: "Deep Research Failed",
        description: error.message || "Could not complete enrichment",
        variant: "destructive",
      });
    } finally {
      setIsEnriching(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout 
      title="Top Businessmen"
      subtitle="Influential business leaders by city"
      heroHeight="35vh"
      videoUrl={videoBackgrounds.investors}
    >
      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <Input
                    placeholder="Search businessmen..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 h-12"
                    data-testid="input-search-businessmen"
                  />
                </div>
                <Button
                  onClick={handleDeepResearch}
                  disabled={isEnriching}
                  className="bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(212,93,121)] text-white border-0"
                  data-testid="button-deep-research"
                >
                  {isEnriching ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enriching...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Deep Research
                    </>
                  )}
                </Button>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {cities.map((city) => (
                  <button
                    key={city}
                    onClick={() => setCityFilter(city)}
                    className={`px-4 py-2 rounded-full text-sm font-light transition-all border ${
                      cityFilter === city 
                        ? 'bg-white text-black border-white' 
                        : 'bg-transparent text-white/60 border-white/20 hover:border-white/40'
                    }`}
                    data-testid={`button-filter-city-${city.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {city} {cityCounts[city] ? `(${cityCounts[city]})` : ''}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-4">
              <span className="text-white font-medium" data-testid="text-total-count">
                {totalBusinessmen.toLocaleString()} Total Businessmen
              </span>
              {hydrating && (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-[rgb(142,132,247)] animate-spin" />
                  <span className="text-sm text-white/50">Loading all data... {loadProgress}%</span>
                </div>
              )}
              {filteredBusinessmen.length !== businessmen.length && (
                <span className="text-white/50 text-sm">
                  ({filteredBusinessmen.length.toLocaleString()} matching filters)
                </span>
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={prevPage}
                  disabled={currentPage === 1}
                  className="border-white/20 text-white hover:bg-white/10"
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-white/70 text-sm min-w-[100px] text-center">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={nextPage}
                  disabled={currentPage === totalPages}
                  className="border-white/20 text-white hover:bg-white/10"
                  data-testid="button-next-page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedBusinessmen.map((person, index) => (
              <motion.div
                key={person.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(index * 0.02, 0.5) }}
              >
                <Link href={`/app/businessmen/${person.id}`}>
                  <div 
                    className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer group"
                    data-testid={`card-businessman-${person.id}`}
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <Avatar className="h-14 w-14 rounded-xl border border-white/10">
                        <AvatarImage src={person.avatar || undefined} />
                        <AvatarFallback className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] rounded-xl text-lg">
                          {person.firstName?.charAt(0)}{person.lastName?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-medium text-white truncate">
                          {person.familyName || `${person.firstName} ${person.lastName || ''}`}
                        </h3>
                        <p className="text-sm text-white/50 truncate">{person.title || person.businessSectors}</p>
                        {(person.flagshipCompany || person.company) && (
                          <p className="text-sm text-[rgb(142,132,247)] truncate flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {person.flagshipCompany || person.company}
                          </p>
                        )}
                      </div>
                      {person.city && (
                        <span className="px-2 py-1 text-xs rounded-full bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] border border-[rgb(142,132,247)]/30 whitespace-nowrap flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {person.city}
                        </span>
                      )}
                    </div>

                    {person.bio && (
                      <p className="text-sm text-white/40 line-clamp-2 mb-4">{person.bio}</p>
                    )}

                    <div className="flex flex-wrap gap-2 mb-4">
                      {person.industry && (
                        <span className="px-2 py-1 text-xs rounded-full bg-white/10 text-white/60 border border-white/10">
                          {person.industry}
                        </span>
                      )}
                      {person.country && (
                        <span className="px-2 py-1 text-xs rounded-full bg-white/5 text-white/40 border border-white/10">
                          {person.country}
                        </span>
                      )}
                      {person.netWorth && (
                        <span className="px-2 py-1 text-xs rounded-full bg-green-500/10 text-green-400/70 border border-green-500/20">
                          {person.netWorth}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                      <div className="flex gap-3">
                        {(person.linkedinUrl || person.personLinkedinUrl) && (
                          <Linkedin className="w-4 h-4 text-white/30" />
                        )}
                        {person.twitterUrl && (
                          <Twitter className="w-4 h-4 text-white/30" />
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          {filteredBusinessmen.length === 0 && (
            <div className="text-center py-16">
              <Users className="w-16 h-16 text-white/20 mx-auto mb-4" />
              <h3 className="text-xl font-light text-white mb-2">No businessmen found</h3>
              <p className="text-white/40">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
