import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Users, Search, Linkedin, Twitter, ArrowRight, MapPin, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import AdminLayout from "@/pages/admin/AdminLayout";
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
  "Munich"
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
  "Germany"
];

export default function Businessmen() {
  const [location] = useLocation();
  const isAdminRoute = location.startsWith("/admin");
  const [searchQuery, setSearchQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("All Cities");
  const [countryFilter, setCountryFilter] = useState("All Countries");

  const { data: businessmen = [], isLoading } = useQuery<Businessman[]>({
    queryKey: ["/api/businessmen"],
  });

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

  const filteredBusinessmen = businessmen.filter((person) => {
    const matchesSearch =
      !searchQuery ||
      person.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      person.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      person.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      person.title?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCity =
      cityFilter === "All Cities" ||
      person.city === cityFilter;

    const matchesCountry =
      countryFilter === "All Countries" ||
      person.country === countryFilter;

    return matchesSearch && matchesCity && matchesCountry;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const content = (
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBusinessmen.map((person, index) => (
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
                          {person.firstName} {person.lastName}
                        </h3>
                        <p className="text-sm text-white/50 truncate">{person.title}</p>
                        {person.company && (
                          <p className="text-sm text-[rgb(142,132,247)] truncate flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {person.company}
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
  );

  if (isAdminRoute) {
    return <AdminLayout>{content}</AdminLayout>;
  }

  return (
    <AppLayout 
      title="Top Businessmen"
      subtitle="Influential business leaders by city"
      heroHeight="35vh"
      videoUrl={videoBackgrounds.investors}
    >
      {content}
    </AppLayout>
  );
}
