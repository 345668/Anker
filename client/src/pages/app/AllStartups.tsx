import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Rocket, 
  Globe, 
  MapPin, 
  Users, 
  DollarSign,
  Zap,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Bell,
  LogOut,
  Filter,
  ArrowRight,
  TrendingUp,
  Sparkles
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useDebounce } from "@/hooks/use-debounce";
import type { Startup } from "@shared/schema";

const stages = ["All Stages", "Pre-seed", "Seed", "Series A", "Series B", "Series C+"];
const industries = ["All Industries", "AI/ML", "SaaS", "FinTech", "HealthTech", "EdTech", "E-commerce", "CleanTech", "Cybersecurity"];

export default function AllStartups() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("All Stages");
  const [industryFilter, setIndustryFilter] = useState("All Industries");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 24;

  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: startupsResponse, isLoading } = useQuery<{ data: Startup[], total: number }>({
    queryKey: ["/api/startups", { search: debouncedSearch, page: currentPage }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      params.set("offset", String((currentPage - 1) * pageSize));
      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }
      const res = await fetch(`/api/startups?${params}`);
      if (!res.ok) throw new Error("Failed to fetch startups");
      return res.json();
    },
    enabled: !!user,
  });

  const startups = startupsResponse?.data ?? [];
  const totalStartups = startupsResponse?.total ?? 0;

  const filteredStartups = startups.filter(startup => {
    const matchesStage = stageFilter === "All Stages" || startup.stage === stageFilter;
    
    const matchesIndustry = industryFilter === "All Industries" || 
      (startup.industries && startup.industries.includes(industryFilter));
    
    return matchesStage && matchesIndustry;
  });

  const totalPages = Math.max(1, Math.ceil(totalStartups / pageSize));
  
  const nextPage = useCallback(() => {
    if (currentPage < totalPages) setCurrentPage(p => p + 1);
  }, [currentPage, totalPages]);
  
  const prevPage = useCallback(() => {
    if (currentPage > 1) setCurrentPage(p => p - 1);
  }, [currentPage]);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "N/A";
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount}`;
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgb(18,18,18)]">
      <header className="h-16 bg-black/50 border-b border-white/10 flex items-center px-6 sticky top-0 z-30 backdrop-blur-md">
        <Link href="/app/dashboard" className="flex items-center gap-2 mr-8" data-testid="link-dashboard-home">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-medium text-white">Anker</span>
        </Link>

        <div className="flex-1 max-w-xl">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search startups..."
              className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
              data-testid="input-search-startups"
            />
          </div>
        </div>

        <div className="flex items-center gap-4 ml-auto">
          <Button variant="ghost" size="icon" className="relative text-white/60" data-testid="button-notifications">
            <Bell className="w-5 h-5" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 text-white/80" data-testid="button-user-menu">
                <Avatar className="h-8 w-8 border border-white/10">
                  <AvatarImage src={user?.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)] text-xs">
                    {user?.firstName?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-light hidden sm:block">
                  {user?.firstName}
                </span>
                <ChevronDown className="w-4 h-4 text-white/40" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => logout()} className="text-red-600" data-testid="button-logout">
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-light text-white" data-testid="text-page-title">
                Browse Startups
              </h1>
              <p className="text-white/50">
                Discover investment opportunities matching your criteria
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-6">
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-40" data-testid="select-filter-stage">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                {stages.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={industryFilter} onValueChange={setIndustryFilter}>
              <SelectTrigger className="w-44" data-testid="select-filter-industry">
                <SelectValue placeholder="Industry" />
              </SelectTrigger>
              <SelectContent>
                {industries.map(i => (
                  <SelectItem key={i} value={i}>{i}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(stageFilter !== "All Stages" || industryFilter !== "All Industries" || searchQuery) && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setStageFilter("All Stages");
                  setIndustryFilter("All Industries");
                  setSearchQuery("");
                }}
                data-testid="button-clear-filters"
              >
                Clear filters
              </Button>
            )}

            <div className="ml-auto text-sm text-white/50">
              {filteredStartups.length} startup{filteredStartups.length !== 1 ? 's' : ''} found
            </div>
          </div>

          {filteredStartups.length === 0 ? (
            <Card className="bg-white/5 border-white/10">
              <CardContent className="py-16 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                  <Rocket className="w-8 h-8 text-[rgb(142,132,247)]" />
                </div>
                <h3 className="text-lg font-light text-white mb-2">No startups found</h3>
                <p className="text-white/50">
                  {searchQuery || stageFilter !== "All Stages" || industryFilter !== "All Industries"
                    ? "Try adjusting your filters or search query"
                    : "No public startups available at this time"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredStartups.map((startup, index) => (
                <motion.div
                  key={startup.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <Card 
                    className="bg-white/5 border-white/10 h-full flex flex-col cursor-pointer hover-elevate"
                    onClick={() => setLocation(`/app/startups/${startup.id}`)}
                    data-testid={`card-startup-${startup.id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-12 w-12 border border-white/10">
                          <AvatarImage src={startup.logo || undefined} />
                          <AvatarFallback className="bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white font-semibold">
                            {startup.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg text-white truncate">{startup.name}</CardTitle>
                          {startup.tagline && (
                            <CardDescription className="text-white/50 line-clamp-1">
                              {startup.tagline}
                            </CardDescription>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col">
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {startup.stage && (
                          <Badge variant="secondary" className="text-xs">
                            {startup.stage}
                          </Badge>
                        )}
                        {startup.fundingStatus === "Actively Raising" && (
                          <Badge className="text-xs bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)]">
                            <Sparkles className="w-3 h-3 mr-1" />
                            Raising
                          </Badge>
                        )}
                        {startup.industries && startup.industries.slice(0, 2).map(industry => (
                          <Badge key={industry} variant="outline" className="text-xs">
                            {industry}
                          </Badge>
                        ))}
                      </div>

                      {startup.description && (
                        <p className="text-sm text-white/50 mb-4 line-clamp-3 flex-1">
                          {startup.description}
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-3 text-sm pt-4 border-t border-white/10">
                        {startup.location && (
                          <div className="flex items-center gap-1.5 text-white/50">
                            <MapPin className="w-3.5 h-3.5" />
                            <span className="truncate">{startup.location}</span>
                          </div>
                        )}
                        {startup.teamSize && (
                          <div className="flex items-center gap-1.5 text-white/50">
                            <Users className="w-3.5 h-3.5" />
                            <span>{startup.teamSize} people</span>
                          </div>
                        )}
                        {startup.targetAmount && (
                          <div className="flex items-center gap-1.5 text-white/50">
                            <DollarSign className="w-3.5 h-3.5" />
                            <span>{formatCurrency(startup.targetAmount)}</span>
                          </div>
                        )}
                        {startup.website && (
                          <div className="flex items-center gap-1.5 text-white/50">
                            <Globe className="w-3.5 h-3.5" />
                            <span>Website</span>
                          </div>
                        )}
                      </div>

                      <Button 
                        variant="ghost" 
                        className="w-full mt-4 justify-between"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocation(`/app/startups/${startup.id}`);
                        }}
                        data-testid={`button-view-startup-${startup.id}`}
                      >
                        View Details
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
