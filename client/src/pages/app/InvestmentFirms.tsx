import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Building2, MapPin, Globe, Search, ExternalLink, Linkedin, Users, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import AppLayout from "@/components/AppLayout";
import type { InvestmentFirm } from "@shared/schema";

const industries = ["All Industries", "Venture Capital", "Private Equity", "Angel", "Accelerator", "Corporate VC", "Family Office"];
const locations = ["All Locations", "USA", "Europe", "Asia", "UK", "Germany", "France", "Other"];

export default function InvestmentFirms() {
  const [searchQuery, setSearchQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState("All Industries");
  const [locationFilter, setLocationFilter] = useState("All Locations");

  const { data: firms = [], isLoading } = useQuery<InvestmentFirm[]>({
    queryKey: ["/api/firms"],
  });

  const filteredFirms = firms.filter((firm) => {
    const matchesSearch =
      !searchQuery ||
      firm.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      firm.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      firm.industry?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesIndustry =
      industryFilter === "All Industries" ||
      firm.industry?.toLowerCase().includes(industryFilter.toLowerCase());

    const matchesLocation =
      locationFilter === "All Locations" ||
      firm.hqLocation?.toLowerCase().includes(locationFilter.toLowerCase());

    return matchesSearch && matchesIndustry && matchesLocation;
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout 
      title="Investment Firms"
      subtitle="Browse venture capital and investment firms"
      heroHeight="35vh"
    >
      <div className="py-12 bg-[rgb(18,18,18)]">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <Input
                  placeholder="Search firms..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 h-12"
                  data-testid="input-search-firms"
                />
              </div>
              <div className="flex gap-3 flex-wrap">
                {industries.slice(0, 5).map((industry) => (
                  <button
                    key={industry}
                    onClick={() => setIndustryFilter(industry)}
                    className={`px-4 py-2 rounded-full text-sm font-light transition-all border ${
                      industryFilter === industry 
                        ? 'bg-white text-black border-white' 
                        : 'bg-transparent text-white/60 border-white/20 hover:border-white/40'
                    }`}
                    data-testid={`button-filter-${industry.toLowerCase().replace(' ', '-')}`}
                  >
                    {industry}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>

          <div className="mb-4 text-white/50 text-sm">
            Showing {filteredFirms.length} of {firms.length} investment firms
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredFirms.map((firm, index) => (
              <motion.div
                key={firm.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(index * 0.02, 0.5) }}
              >
                <Link href={`/app/firms/${firm.id}`}>
                  <div 
                    className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer group h-full"
                    data-testid={`card-firm-${firm.id}`}
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-14 h-14 rounded-xl bg-[rgb(142,132,247)]/20 flex items-center justify-center border border-white/10">
                        <Building2 className="w-7 h-7 text-[rgb(142,132,247)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-medium text-white truncate">
                          {firm.name}
                        </h3>
                        {firm.industry && (
                          <p className="text-sm text-white/50 truncate">{firm.industry}</p>
                        )}
                        {firm.hqLocation && (
                          <p className="text-sm text-[rgb(142,132,247)] truncate flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {firm.hqLocation}
                          </p>
                        )}
                      </div>
                    </div>

                    {firm.description && (
                      <p className="text-sm text-white/40 line-clamp-2 mb-4">{firm.description}</p>
                    )}

                    <div className="flex flex-wrap gap-2 mb-4">
                      {firm.employeeRange && (
                        <span className="px-2 py-1 text-xs rounded-full bg-white/10 text-white/60 border border-white/10 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {firm.employeeRange}
                        </span>
                      )}
                      {firm.fundingRaised && (
                        <span className="px-2 py-1 text-xs rounded-full bg-white/10 text-white/60 border border-white/10">
                          {firm.fundingRaised}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                      <div className="flex gap-3">
                        {firm.website && (
                          <Globe className="w-4 h-4 text-white/30" />
                        )}
                        {firm.linkedinUrl && (
                          <Linkedin className="w-4 h-4 text-white/30" />
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          {filteredFirms.length === 0 && (
            <div className="text-center py-16">
              <Building2 className="w-16 h-16 text-white/20 mx-auto mb-4" />
              <h3 className="text-xl font-light text-white mb-2">No firms found</h3>
              <p className="text-white/40">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
