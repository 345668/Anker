import { useState } from "react";
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
  Bell,
  LogOut,
  Filter,
  ArrowRight,
  TrendingUp,
  Sparkles
} from "lucide-react";
import { Link, useLocation } from "wouter";
import type { Startup } from "@shared/schema";

const stages = ["All Stages", "Pre-seed", "Seed", "Series A", "Series B", "Series C+"];
const industries = ["All Industries", "AI/ML", "SaaS", "FinTech", "HealthTech", "EdTech", "E-commerce", "CleanTech", "Cybersecurity"];

export default function AllStartups() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("All Stages");
  const [industryFilter, setIndustryFilter] = useState("All Industries");

  const { data: startups = [], isLoading } = useQuery<Startup[]>({
    queryKey: ["/api/startups"],
    enabled: !!user,
  });

  const filteredStartups = startups.filter(startup => {
    const matchesSearch = !searchQuery || 
      startup.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      startup.tagline?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      startup.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStage = stageFilter === "All Stages" || startup.stage === stageFilter;
    
    const matchesIndustry = industryFilter === "All Industries" || 
      (startup.industries && startup.industries.includes(industryFilter));
    
    return matchesSearch && matchesStage && matchesIndustry;
  });

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "N/A";
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount}`;
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-600 dark:text-slate-400">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center px-6 sticky top-0 z-30">
        <Link href="/app/dashboard" className="flex items-center gap-2 mr-8" data-testid="link-dashboard-home">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-slate-900 dark:text-white">Anker Platform</span>
        </Link>

        <div className="flex-1 max-w-xl">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search startups..."
              className="pl-10 bg-slate-100 dark:bg-slate-700 border-0"
              data-testid="input-search-startups"
            />
          </div>
        </div>

        <div className="flex items-center gap-4 ml-auto">
          <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
            <Bell className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2" data-testid="button-user-menu">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.profileImageUrl || undefined} />
                  <AvatarFallback className="bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs">
                    {user?.firstName?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:block">
                  {user?.firstName}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
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
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="text-page-title">
                Browse Startups
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
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

            <div className="ml-auto text-sm text-slate-500 dark:text-slate-400">
              {filteredStartups.length} startup{filteredStartups.length !== 1 ? 's' : ''} found
            </div>
          </div>

          {filteredStartups.length === 0 ? (
            <Card className="dark:bg-slate-800 dark:border-slate-700">
              <CardContent className="py-16 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Rocket className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No startups found</h3>
                <p className="text-slate-600 dark:text-slate-400">
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
                    className="dark:bg-slate-800 dark:border-slate-700 h-full flex flex-col cursor-pointer hover-elevate"
                    onClick={() => setLocation(`/app/startups/${startup.id}`)}
                    data-testid={`card-startup-${startup.id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={startup.logo || undefined} />
                          <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white font-semibold">
                            {startup.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg dark:text-white truncate">{startup.name}</CardTitle>
                          {startup.tagline && (
                            <CardDescription className="dark:text-slate-400 line-clamp-1">
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
                          <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
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
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 line-clamp-3 flex-1">
                          {startup.description}
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-3 text-sm pt-4 border-t border-slate-100 dark:border-slate-700">
                        {startup.location && (
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <MapPin className="w-3.5 h-3.5" />
                            <span className="truncate">{startup.location}</span>
                          </div>
                        )}
                        {startup.teamSize && (
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <Users className="w-3.5 h-3.5" />
                            <span>{startup.teamSize} people</span>
                          </div>
                        )}
                        {startup.targetAmount && (
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <DollarSign className="w-3.5 h-3.5" />
                            <span>{formatCurrency(startup.targetAmount)}</span>
                          </div>
                        )}
                        {startup.website && (
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
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
