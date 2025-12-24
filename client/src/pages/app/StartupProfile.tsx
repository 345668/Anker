import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
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
  Play
} from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import type { Startup, User } from "@shared/schema";

export default function StartupProfile() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();

  const { data: startup, isLoading } = useQuery<Startup>({
    queryKey: ["/api/startups", id],
    enabled: !!id,
  });

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "N/A";
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount}`;
  };

  const isOwner = user && startup && user.id === startup.founderId;

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
              <Card className="dark:bg-slate-800 dark:border-slate-700">
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row items-start gap-6">
                    <Avatar className="h-24 w-24 shrink-0">
                      <AvatarImage src={startup.logo || undefined} />
                      <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-2xl font-bold">
                        {startup.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div>
                          <h1 className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="text-startup-name">
                            {startup.name}
                          </h1>
                          {startup.tagline && (
                            <p className="text-lg text-slate-600 dark:text-slate-400 mt-1">
                              {startup.tagline}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {isOwner ? (
                            <Button onClick={() => setLocation(`/app/startups/${startup.id}/edit`)} data-testid="button-edit-startup">
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
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
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

              <Card className="dark:bg-slate-800 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="dark:text-white">About</CardTitle>
                </CardHeader>
                <CardContent>
                  {startup.description ? (
                    <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                      {startup.description}
                    </p>
                  ) : (
                    <p className="text-slate-400 dark:text-slate-500 italic">
                      No description provided
                    </p>
                  )}
                </CardContent>
              </Card>

              {(startup.pitchDeckUrl || startup.demoUrl) && (
                <Card className="dark:bg-slate-800 dark:border-slate-700">
                  <CardHeader>
                    <CardTitle className="dark:text-white">Materials</CardTitle>
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
                <Card className="dark:bg-slate-800 dark:border-slate-700">
                  <CardHeader>
                    <CardTitle className="dark:text-white">Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {startup.revenue && (
                        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                          <p className="text-sm text-slate-500 dark:text-slate-400">Revenue</p>
                          <p className="text-xl font-semibold text-slate-900 dark:text-white">{startup.revenue}</p>
                        </div>
                      )}
                      {startup.mrr && (
                        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                          <p className="text-sm text-slate-500 dark:text-slate-400">MRR</p>
                          <p className="text-xl font-semibold text-slate-900 dark:text-white">{formatCurrency(startup.mrr)}</p>
                        </div>
                      )}
                      {startup.customers && (
                        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                          <p className="text-sm text-slate-500 dark:text-slate-400">Customers</p>
                          <p className="text-xl font-semibold text-slate-900 dark:text-white">{startup.customers}</p>
                        </div>
                      )}
                      {startup.growth && (
                        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                          <p className="text-sm text-slate-500 dark:text-slate-400">Growth</p>
                          <p className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">{startup.growth}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card className="dark:bg-slate-800 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="dark:text-white">Company Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {startup.location && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                        <MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Location</p>
                        <p className="font-medium text-slate-900 dark:text-white">{startup.location}</p>
                      </div>
                    </div>
                  )}
                  {startup.founded && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Founded</p>
                        <p className="font-medium text-slate-900 dark:text-white">{startup.founded}</p>
                      </div>
                    </div>
                  )}
                  {startup.teamSize && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                        <Users className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Team Size</p>
                        <p className="font-medium text-slate-900 dark:text-white">{startup.teamSize} people</p>
                      </div>
                    </div>
                  )}
                  {startup.website && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                        <Globe className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Website</p>
                        <a 
                          href={startup.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          {startup.website.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="dark:bg-slate-800 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="dark:text-white">Fundraising</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {startup.targetAmount && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Target Raise</p>
                        <p className="font-medium text-slate-900 dark:text-white">{formatCurrency(startup.targetAmount)}</p>
                      </div>
                    </div>
                  )}
                  {startup.amountRaised !== null && startup.amountRaised !== undefined && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Raised So Far</p>
                        <p className="font-medium text-slate-900 dark:text-white">{formatCurrency(startup.amountRaised)}</p>
                      </div>
                    </div>
                  )}
                  {startup.valuation && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Valuation</p>
                        <p className="font-medium text-slate-900 dark:text-white">{formatCurrency(startup.valuation)}</p>
                      </div>
                    </div>
                  )}

                  {!isOwner && (
                    <Separator className="my-4" />
                  )}

                  {!isOwner && (
                    <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700" data-testid="button-request-intro">
                      <Mail className="w-4 h-4 mr-2" />
                      Request Introduction
                    </Button>
                  )}
                </CardContent>
              </Card>

              {(startup.linkedinUrl || startup.twitterUrl) && (
                <Card className="dark:bg-slate-800 dark:border-slate-700">
                  <CardHeader>
                    <CardTitle className="dark:text-white">Social</CardTitle>
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
    </div>
  );
}
