import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Zap,
  ChevronDown,
  Bell,
  LogOut,
  ArrowLeft,
  Globe,
  MapPin,
  Users,
  DollarSign,
  Calendar,
  Building2,
  TrendingUp,
  ExternalLink,
  Mail,
  MessageSquare,
  Star,
  Share2,
  Edit,
  FileText,
  Play,
  Loader2
} from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Startup, User } from "@shared/schema";

const stages = ["Pre-seed", "Seed", "Series A", "Series B", "Series C+", "Growth"];
const fundingStatuses = ["Not Raising", "Actively Raising", "Recently Funded", "Bootstrapped"];

export default function StartupProfile() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: "",
    tagline: "",
    description: "",
    website: "",
    stage: "",
    fundingStatus: "",
    targetAmount: "",
    location: "",
  });

  const { data: startup, isLoading } = useQuery<Startup>({
    queryKey: ["/api/startups", id],
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof editFormData }) => {
      return apiRequest("PATCH", `/api/startups/${id}`, {
        ...data,
        targetAmount: data.targetAmount ? parseInt(data.targetAmount) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/startups", id] });
      setIsEditOpen(false);
      toast({ title: "Startup updated", description: "Your startup profile has been updated." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update startup", variant: "destructive" });
    },
  });

  const isOwner = user && startup && user.id === startup.founderId;

  const openEditModal = () => {
    if (!startup) return;
    setEditFormData({
      name: startup.name || "",
      tagline: startup.tagline || "",
      description: startup.description || "",
      website: startup.website || "",
      stage: startup.stage || "",
      fundingStatus: startup.fundingStatus || "",
      targetAmount: startup.targetAmount?.toString() || "",
      location: startup.location || "",
    });
    setIsEditOpen(true);
  };

  useEffect(() => {
    if (startup && isOwner) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("edit") === "true") {
        openEditModal();
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, [startup, isOwner]);

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

  if (!startup) {
    return (
      <div className="min-h-screen bg-[rgb(18,18,18)] flex items-center justify-center">
        <Card className="bg-white/5 border-white/10 max-w-md w-full mx-4">
          <CardContent className="py-12 text-center">
            <h2 className="text-xl font-light text-white mb-2">Startup Not Found</h2>
            <p className="text-white/50 mb-6">
              The startup you're looking for doesn't exist or has been removed.
            </p>
            <Button onClick={() => setLocation('/app/dashboard')} data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
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
            <DropdownMenuContent align="end" className="bg-[rgb(30,30,30)] border-white/10">
              <DropdownMenuItem onClick={() => logout()} className="text-red-400" data-testid="button-logout">
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="p-6 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Button 
            variant="ghost" 
            className="mb-6"
            onClick={() => window.history.back()}
            data-testid="button-go-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Card className="bg-white/5 border-white/10">
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row items-start gap-6">
                    <Avatar className="h-24 w-24 shrink-0 border border-white/10">
                      <AvatarImage src={startup.logo || undefined} />
                      <AvatarFallback className="bg-gradient-to-br from-[rgb(142,132,247)] to-[rgb(251,194,213)] text-white text-2xl font-bold">
                        {startup.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div>
                          <h1 className="text-2xl font-light text-white" data-testid="text-startup-name">
                            {startup.name}
                          </h1>
                          {startup.tagline && (
                            <p className="text-lg text-white/50 mt-1">
                              {startup.tagline}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {isOwner ? (
                            <Button onClick={openEditModal} data-testid="button-edit-startup">
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </Button>
                          ) : (
                            <>
                              <Button variant="outline" size="icon" data-testid="button-share">
                                <Share2 className="w-4 h-4" />
                              </Button>
                              <Button variant="outline" size="icon" data-testid="button-save">
                                <Star className="w-4 h-4" />
                              </Button>
                              <Button data-testid="button-connect">
                                <MessageSquare className="w-4 h-4 mr-2" />
                                Connect
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-4">
                        {startup.stage && (
                          <Badge variant="secondary">{startup.stage}</Badge>
                        )}
                        {startup.fundingStatus && (
                          <Badge className={
                            startup.fundingStatus === "Actively Raising" 
                              ? "bg-[rgb(196,227,230)]/20 text-[rgb(196,227,230)]"
                              : ""
                          }>
                            {startup.fundingStatus}
                          </Badge>
                        )}
                        {startup.industries?.map(industry => (
                          <Badge key={industry} variant="outline">{industry}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white">About</CardTitle>
                </CardHeader>
                <CardContent>
                  {startup.description ? (
                    <p className="text-white/60 whitespace-pre-wrap">
                      {startup.description}
                    </p>
                  ) : (
                    <p className="text-white/40 italic">
                      No description provided
                    </p>
                  )}
                </CardContent>
              </Card>

              {(startup.pitchDeckUrl || startup.demoUrl) && (
                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white">Materials</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-3">
                    {startup.pitchDeckUrl && (
                      <Button variant="outline" onClick={() => window.open(startup.pitchDeckUrl || '', '_blank')} data-testid="button-view-deck">
                        <FileText className="w-4 h-4 mr-2" />
                        View Pitch Deck
                        <ExternalLink className="w-3 h-3 ml-2" />
                      </Button>
                    )}
                    {startup.demoUrl && (
                      <Button variant="outline" onClick={() => window.open(startup.demoUrl || '', '_blank')} data-testid="button-view-demo">
                        <Play className="w-4 h-4 mr-2" />
                        Watch Demo
                        <ExternalLink className="w-3 h-3 ml-2" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {(startup.revenue || startup.mrr || startup.customers || startup.growth) && (
                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white">Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {startup.revenue && (
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                          <p className="text-sm text-white/50">Revenue</p>
                          <p className="text-xl font-semibold text-white">{startup.revenue}</p>
                        </div>
                      )}
                      {startup.mrr && (
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                          <p className="text-sm text-white/50">MRR</p>
                          <p className="text-xl font-semibold text-white">{formatCurrency(startup.mrr)}</p>
                        </div>
                      )}
                      {startup.customers && (
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                          <p className="text-sm text-white/50">Customers</p>
                          <p className="text-xl font-semibold text-white">{startup.customers}</p>
                        </div>
                      )}
                      {startup.growth && (
                        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                          <p className="text-sm text-white/50">Growth</p>
                          <p className="text-xl font-semibold text-[rgb(196,227,230)]">{startup.growth}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white">Company Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {startup.location && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                        <MapPin className="w-4 h-4 text-white/50" />
                      </div>
                      <div>
                        <p className="text-sm text-white/50">Location</p>
                        <p className="font-medium text-white">{startup.location}</p>
                      </div>
                    </div>
                  )}
                  {startup.founded && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-white/50" />
                      </div>
                      <div>
                        <p className="text-sm text-white/50">Founded</p>
                        <p className="font-medium text-white">{startup.founded}</p>
                      </div>
                    </div>
                  )}
                  {startup.teamSize && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                        <Users className="w-4 h-4 text-white/50" />
                      </div>
                      <div>
                        <p className="text-sm text-white/50">Team Size</p>
                        <p className="font-medium text-white">{startup.teamSize} people</p>
                      </div>
                    </div>
                  )}
                  {startup.website && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                        <Globe className="w-4 h-4 text-white/50" />
                      </div>
                      <div>
                        <p className="text-sm text-white/50">Website</p>
                        <a 
                          href={startup.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="font-medium text-[rgb(142,132,247)] hover:underline"
                        >
                          {startup.website.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white">Fundraising</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {startup.targetAmount && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[rgb(254,212,92)]/20 flex items-center justify-center">
                        <DollarSign className="w-4 h-4 text-[rgb(254,212,92)]" />
                      </div>
                      <div>
                        <p className="text-sm text-white/50">Target Raise</p>
                        <p className="font-medium text-white">{formatCurrency(startup.targetAmount)}</p>
                      </div>
                    </div>
                  )}
                  {startup.amountRaised !== null && startup.amountRaised !== undefined && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[rgb(142,132,247)]/20 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-[rgb(142,132,247)]" />
                      </div>
                      <div>
                        <p className="text-sm text-white/50">Raised So Far</p>
                        <p className="font-medium text-white">{formatCurrency(startup.amountRaised)}</p>
                      </div>
                    </div>
                  )}
                  {startup.valuation && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[rgb(251,194,213)]/20 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-[rgb(251,194,213)]" />
                      </div>
                      <div>
                        <p className="text-sm text-white/50">Valuation</p>
                        <p className="font-medium text-white">{formatCurrency(startup.valuation)}</p>
                      </div>
                    </div>
                  )}

                  {!isOwner && (
                    <Separator className="my-4" />
                  )}

                  {!isOwner && (
                    <Button className="w-full bg-gradient-to-r from-[rgb(142,132,247)] to-[rgb(251,194,213)] hover:opacity-90" data-testid="button-request-intro">
                      <Mail className="w-4 h-4 mr-2" />
                      Request Introduction
                    </Button>
                  )}
                </CardContent>
              </Card>

              {(startup.linkedinUrl || startup.twitterUrl) && (
                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white">Social</CardTitle>
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    {startup.linkedinUrl && (
                      <Button variant="outline" size="sm" onClick={() => window.open(startup.linkedinUrl || '', '_blank')}>
                        LinkedIn
                        <ExternalLink className="w-3 h-3 ml-2" />
                      </Button>
                    )}
                    {startup.twitterUrl && (
                      <Button variant="outline" size="sm" onClick={() => window.open(startup.twitterUrl || '', '_blank')}>
                        Twitter
                        <ExternalLink className="w-3 h-3 ml-2" />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </motion.div>
      </main>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="bg-[rgb(25,25,25)] border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Startup</DialogTitle>
            <DialogDescription className="text-white/50">
              Update your company profile
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                className="bg-white/5 border-white/10 text-white"
                placeholder="Acme Inc."
                data-testid="input-edit-startup-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Tagline</Label>
              <Input
                value={editFormData.tagline}
                onChange={(e) => setEditFormData({ ...editFormData, tagline: e.target.value })}
                className="bg-white/5 border-white/10 text-white"
                placeholder="The future of X"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                className="bg-white/5 border-white/10 text-white min-h-[100px]"
                placeholder="Describe what your company does..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Stage</Label>
                <Select value={editFormData.stage} onValueChange={(v) => setEditFormData({ ...editFormData, stage: v })}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
                    {stages.map((s) => (
                      <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Funding Status</Label>
                <Select value={editFormData.fundingStatus} onValueChange={(v) => setEditFormData({ ...editFormData, fundingStatus: v })}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent className="bg-[rgb(30,30,30)] border-white/10">
                    {fundingStatuses.map((s) => (
                      <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Target Amount ($)</Label>
                <Input
                  type="number"
                  value={editFormData.targetAmount}
                  onChange={(e) => setEditFormData({ ...editFormData, targetAmount: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="1000000"
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={editFormData.location}
                  onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="San Francisco, CA"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input
                value={editFormData.website}
                onChange={(e) => setEditFormData({ ...editFormData, website: e.target.value })}
                className="bg-white/5 border-white/10 text-white"
                placeholder="https://example.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)} className="border-white/10 text-white">
              Cancel
            </Button>
            <Button 
              onClick={() => startup && updateMutation.mutate({ id: startup.id, data: editFormData })}
              disabled={!editFormData.name || updateMutation.isPending}
              className="bg-[rgb(142,132,247)] hover:bg-[rgb(142,132,247)]/80"
              data-testid="button-update-startup"
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Update Startup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
