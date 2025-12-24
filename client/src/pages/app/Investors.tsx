import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Building2, Users, MapPin, DollarSign, ArrowLeft, Search, Filter, ExternalLink, Linkedin, Twitter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-slate-600 dark:text-slate-400">Loading investors...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center px-6 sticky top-0 z-30">
        <Link href="/app/dashboard" data-testid="link-back-dashboard">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="ml-4">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Browse Investors</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Find investors that match your startup
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search investors by name or title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-investors"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-stage-filter">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              {stages.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {stage}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sectorFilter} onValueChange={setSectorFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-sector-filter">
              <SelectValue placeholder="Sector" />
            </SelectTrigger>
            <SelectContent>
              {sectors.map((sector) => (
                <SelectItem key={sector} value={sector}>
                  {sector}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredInvestors.length === 0 ? (
          <Card className="p-12 text-center">
            <Users className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
              No investors found
            </h3>
            <p className="text-slate-500 dark:text-slate-400">
              {investors.length === 0
                ? "No investors are currently listed. Check back soon!"
                : "Try adjusting your search or filters."}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredInvestors.map((investor) => (
              <Card key={investor.id} className="hover-elevate" data-testid={`card-investor-${investor.id}`}>
                <CardHeader className="flex flex-row items-start gap-4">
                  <Avatar className="h-14 w-14">
                    <AvatarImage src={investor.avatar || undefined} />
                    <AvatarFallback className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                      {investor.firstName?.charAt(0)}
                      {investor.lastName?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">
                      {investor.firstName} {investor.lastName}
                    </CardTitle>
                    {investor.title && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                        {investor.title}
                      </p>
                    )}
                    {getFirmName(investor.firmId) && (
                      <p className="text-sm font-medium text-purple-600 dark:text-purple-400 truncate">
                        {getFirmName(investor.firmId)}
                      </p>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {investor.bio && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                      {investor.bio}
                    </p>
                  )}

                  {investor.location && (
                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                      <MapPin className="w-4 h-4" />
                      <span>{investor.location}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {(Array.isArray(investor.stages) ? investor.stages : []).slice(0, 3).map((stage) => (
                      <Badge key={stage} variant="secondary" className="text-xs">
                        {stage}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {(Array.isArray(investor.sectors) ? investor.sectors : []).slice(0, 3).map((sector) => (
                      <Badge key={sector} variant="outline" className="text-xs">
                        {sector}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    {investor.linkedinUrl && (
                      <a
                        href={investor.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-blue-600 transition-colors"
                        data-testid={`link-investor-linkedin-${investor.id}`}
                      >
                        <Linkedin className="w-5 h-5" />
                      </a>
                    )}
                    {investor.twitterUrl && (
                      <a
                        href={investor.twitterUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-sky-500 transition-colors"
                        data-testid={`link-investor-twitter-${investor.id}`}
                      >
                        <Twitter className="w-5 h-5" />
                      </a>
                    )}
                    <div className="flex-1" />
                    <Link href={`/app/investors/${investor.id}`}>
                      <Button size="sm" data-testid={`button-view-investor-${investor.id}`}>
                        View Profile
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
