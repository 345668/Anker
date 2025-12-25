import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Building2, Users, MapPin, DollarSign, Search, ExternalLink, Linkedin, Twitter, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AppLayout, { videoBackgrounds } from "@/components/AppLayout";
import type { Investor, InvestmentFirm } from "@shared/schema";

const stages = ["All Stages", "Pre-seed", "Seed", "Series A", "Series B", "Series C", "Growth"];
const sectors = ["All Sectors", "SaaS", "Fintech", "Healthcare", "AI/ML", "Consumer", "Enterprise", "Climate", "Crypto"];

export default function Investors() {
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("All Stages");
  const [sectorFilter, setSectorFilter] = useState("All Sectors");

  const { data: investors = [], isLoading: loadingInvestors } = useQuery<Investor[]>({
    queryKey: ["/api/investors"],
  });

  const { data: firms = [], isLoading: loadingFirms } = useQuery<InvestmentFirm[]>({
    queryKey: ["/api/firms"],
  });

  const filteredInvestors = investors.filter((investor) => {
    const matchesSearch =
      !searchQuery ||
      investor.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      investor.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      investor.title?.toLowerCase().includes(searchQuery.toLowerCase());

    const investorStages = Array.isArray(investor.stages) ? investor.stages : [];
    const investorSectors = Array.isArray(investor.sectors) ? investor.sectors : [];
    
    const matchesStage =
      stageFilter === "All Stages" ||
      investorStages.includes(stageFilter);

    const matchesSector =
      sectorFilter === "All Sectors" ||
      investorSectors.includes(sectorFilter);

    return matchesSearch && matchesStage && matchesSector;
  });

  const getFirmName = (firmId: string | null) => {
    if (!firmId) return null;
    const firm = firms.find((f) => f.id === firmId);
    return firm?.name;
  };

  if (loadingInvestors || loadingFirms) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout 
      title="Browse Investors"
      subtitle="Find investors that match your startup"
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
            <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                <Input
                  placeholder="Search investors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 h-12"
                  data-testid="input-search"
                />
              </div>
              <div className="flex gap-3">
                {stages.map((stage) => (
                  <button
                    key={stage}
                    onClick={() => setStageFilter(stage)}
                    className={`px-4 py-2 rounded-full text-sm font-light transition-all border ${
                      stageFilter === stage 
                        ? 'bg-white text-black border-white' 
                        : 'bg-transparent text-white/60 border-white/20 hover:border-white/40'
                    }`}
                    data-testid={`button-filter-${stage.toLowerCase().replace(' ', '-')}`}
                  >
                    {stage}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredInvestors.map((investor, index) => (
              <motion.div
                key={investor.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
              >
                <Link href={`/app/investors/${investor.id}`}>
                  <div 
                    className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer group"
                    data-testid={`card-investor-${investor.id}`}
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <Avatar className="h-14 w-14 rounded-xl border border-white/10">
                        <AvatarImage src={investor.photoUrl || undefined} />
                        <AvatarFallback className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] rounded-xl text-lg">
                          {investor.firstName?.charAt(0)}{investor.lastName?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-medium text-white truncate">
                          {investor.firstName} {investor.lastName}
                        </h3>
                        <p className="text-sm text-white/50 truncate">{investor.title}</p>
                        {investor.firmId && (
                          <p className="text-sm text-[rgb(142,132,247)] truncate flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {getFirmName(investor.firmId)}
                          </p>
                        )}
                      </div>
                    </div>

                    {investor.bio && (
                      <p className="text-sm text-white/40 line-clamp-2 mb-4">{investor.bio}</p>
                    )}

                    <div className="flex flex-wrap gap-2 mb-4">
                      {(investor.sectors as string[] || []).slice(0, 3).map((sector) => (
                        <span
                          key={sector}
                          className="px-2 py-1 text-xs rounded-full bg-white/10 text-white/60 border border-white/10"
                        >
                          {sector}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                      <div className="flex gap-3">
                        {investor.linkedinUrl && (
                          <Linkedin className="w-4 h-4 text-white/30" />
                        )}
                        {investor.twitterUrl && (
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

          {filteredInvestors.length === 0 && (
            <div className="text-center py-16">
              <Users className="w-16 h-16 text-white/20 mx-auto mb-4" />
              <h3 className="text-xl font-light text-white mb-2">No investors found</h3>
              <p className="text-white/40">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
