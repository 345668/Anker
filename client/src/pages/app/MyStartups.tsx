import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Plus, 
  Rocket, 
  Building2, 
  Globe, 
  MapPin, 
  Users, 
  DollarSign,
  MoreVertical,
  Edit,
  Eye,
  Trash2,
  ExternalLink,
  Zap,
  Search,
  ChevronDown,
  Bell,
  LogOut
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Startup } from "@shared/schema";

const stages = ["Pre-seed", "Seed", "Series A", "Series B", "Series C+"];
const fundingStatuses = ["Actively Raising", "Open to Investors", "Not Currently Raising"];
const industries = [
  "AI/ML", "SaaS", "FinTech", "HealthTech", "EdTech", "E-commerce", 
  "CleanTech", "Cybersecurity", "Blockchain", "Consumer", "Enterprise", "Other"
];

export default function MyStartups() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    tagline: "",
    description: "",
    website: "",
    stage: "",
    fundingStatus: "",
    location: "",
    teamSize: "",
    industries: [] as string[],
    targetAmount: "",
    isPublic: false,
  });

  const { data: startups = [], isLoading } = useQuery<Startup[]>({
    queryKey: ["/api/startups/mine"],
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/startups", {
        name: data.name,
        tagline: data.tagline,
        description: data.description,
        website: data.website,
        stage: data.stage,
        fundingStatus: data.fundingStatus,
        location: data.location,
        teamSize: data.teamSize ? parseInt(data.teamSize) : null,
        industries: data.industries,
        targetAmount: data.targetAmount ? parseInt(data.targetAmount) : null,
        isPublic: data.isPublic,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/startups/mine"] });
      setIsCreateOpen(false);
      setFormData({
        name: "",
        tagline: "",
        description: "",
        website: "",
        stage: "",
        fundingStatus: "",
        location: "",
        teamSize: "",
        industries: [],
        targetAmount: "",
        isPublic: false,
      });
      toast({ title: "Startup created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create startup", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/startups/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/startups/mine"] });
      toast({ title: "Startup deleted" });
    },
  });

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

  const handleIndustryToggle = (industry: string) => {
    setFormData(prev => ({
      ...prev,
      industries: prev.industries.includes(industry)
        ? prev.industries.filter(i => i !== industry)
        : [...prev.industries, industry],
    }));
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "N/A";
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount}`;
  };

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
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400">
            <Search className="w-4 h-4" />
            <span className="text-sm">Search startups...</span>
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="text-page-title">
                My Startups
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                Manage your company profiles and fundraising materials
              </p>
            </div>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700" data-testid="button-add-startup">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Startup
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Startup</DialogTitle>
                  <DialogDescription>
                    Add your company to attract potential investors
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData); }} className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Company Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Acme Inc"
                        required
                        data-testid="input-startup-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        value={formData.website}
                        onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                        placeholder="https://example.com"
                        data-testid="input-startup-website"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tagline">Tagline</Label>
                    <Input
                      id="tagline"
                      value={formData.tagline}
                      onChange={(e) => setFormData(prev => ({ ...prev, tagline: e.target.value }))}
                      placeholder="The future of X"
                      data-testid="input-startup-tagline"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Tell investors about your company..."
                      rows={4}
                      data-testid="input-startup-description"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Stage</Label>
                      <Select value={formData.stage} onValueChange={(v) => setFormData(prev => ({ ...prev, stage: v }))}>
                        <SelectTrigger data-testid="select-startup-stage">
                          <SelectValue placeholder="Select stage" />
                        </SelectTrigger>
                        <SelectContent>
                          {stages.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Funding Status</Label>
                      <Select value={formData.fundingStatus} onValueChange={(v) => setFormData(prev => ({ ...prev, fundingStatus: v }))}>
                        <SelectTrigger data-testid="select-startup-funding-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {fundingStatuses.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        value={formData.location}
                        onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                        placeholder="San Francisco, CA"
                        data-testid="input-startup-location"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="teamSize">Team Size</Label>
                      <Input
                        id="teamSize"
                        type="number"
                        value={formData.teamSize}
                        onChange={(e) => setFormData(prev => ({ ...prev, teamSize: e.target.value }))}
                        placeholder="10"
                        data-testid="input-startup-team-size"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Industries</Label>
                    <div className="flex flex-wrap gap-2">
                      {industries.map(industry => (
                        <Badge
                          key={industry}
                          variant={formData.industries.includes(industry) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => handleIndustryToggle(industry)}
                          data-testid={`badge-industry-${industry.toLowerCase().replace(/\//g, '-')}`}
                        >
                          {industry}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="targetAmount">Target Raise Amount ($)</Label>
                    <Input
                      id="targetAmount"
                      type="number"
                      value={formData.targetAmount}
                      onChange={(e) => setFormData(prev => ({ ...prev, targetAmount: e.target.value }))}
                      placeholder="500000"
                      data-testid="input-startup-target-amount"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isPublic"
                      checked={formData.isPublic}
                      onChange={(e) => setFormData(prev => ({ ...prev, isPublic: e.target.checked }))}
                      className="rounded border-slate-300"
                      data-testid="checkbox-startup-public"
                    />
                    <Label htmlFor="isPublic" className="text-sm">
                      Make this startup visible to investors
                    </Label>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-startup">
                      {createMutation.isPending ? "Creating..." : "Create Startup"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {startups.length === 0 ? (
            <Card className="dark:bg-slate-800 dark:border-slate-700">
              <CardContent className="py-16 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Rocket className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No startups yet</h3>
                <p className="text-slate-600 dark:text-slate-400 mb-6">
                  Create your first startup profile to start attracting investors
                </p>
                <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-first-startup">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Startup
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {startups.map((startup) => (
                <motion.div
                  key={startup.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="dark:bg-slate-800 dark:border-slate-700 h-full flex flex-col">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={startup.logo || undefined} />
                            <AvatarFallback className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                              {startup.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <CardTitle className="text-lg dark:text-white">{startup.name}</CardTitle>
                            {startup.tagline && (
                              <CardDescription className="dark:text-slate-400 line-clamp-1">
                                {startup.tagline}
                              </CardDescription>
                            )}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-startup-menu-${startup.id}`}>
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setLocation(`/app/startups/${startup.id}`)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setLocation(`/app/startups/${startup.id}/edit`)}>
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            {startup.website && (
                              <DropdownMenuItem onClick={() => window.open(startup.website || '', '_blank')}>
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Visit Website
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem 
                              onClick={() => deleteMutation.mutate(startup.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col">
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {startup.stage && (
                          <Badge variant="secondary" className="text-xs">
                            {startup.stage}
                          </Badge>
                        )}
                        {startup.isPublic ? (
                          <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Public
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            Private
                          </Badge>
                        )}
                      </div>

                      {startup.description && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 line-clamp-2 flex-1">
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
                            <span>Raising {formatCurrency(startup.targetAmount)}</span>
                          </div>
                        )}
                        {startup.website && (
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <Globe className="w-3.5 h-3.5" />
                            <a 
                              href={startup.website} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="truncate hover:text-indigo-600"
                            >
                              Website
                            </a>
                          </div>
                        )}
                      </div>
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
