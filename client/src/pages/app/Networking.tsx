import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Users, 
  Sparkles, 
  Loader2, 
  Send, 
  Building2, 
  Target, 
  Calendar, 
  Network,
  Mail
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  LiquidBackground, 
  GlassSurface, 
  UnderGlow, 
  Pill,
  AnimatedGrid,
  RainbowButton,
  SecondaryGlassButton
} from "@/components/liquid-glass";
import type { Startup, Match, InvestmentFirm, Contact, Outreach, Investor } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

function MetricBadge({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-2xl border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 px-3 py-2 backdrop-blur-2xl shadow-lg">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl blur-md opacity-40" />
        <div className="relative rounded-xl bg-gradient-to-br from-purple-100/80 to-blue-100/80 dark:from-purple-900/50 dark:to-blue-900/50 border-2 border-white/60 dark:border-white/20 p-2 shadow-lg">
          <Icon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        </div>
      </div>
      <div className="leading-tight">
        <div className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</div>
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</div>
      </div>
    </div>
  );
}

function GlassTabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <TabsList
      className={`grid w-full grid-cols-2 gap-2 rounded-3xl border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 p-2 backdrop-blur-2xl shadow-lg md:grid-cols-4 ${className || ""}`}
    >
      {children}
    </TabsList>
  );
}

function GlassTabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className="h-11 rounded-2xl flex items-center justify-center data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700/70 hover:text-slate-900 dark:hover:text-slate-100 transition"
    >
      {children}
    </TabsTrigger>
  );
}

export default function NetworkingPage() {
  const { user } = useAuth();
  const [introMessage, setIntroMessage] = useState("");
  const [selectedInvestor, setSelectedInvestor] = useState<Investor | null>(null);

  const { data: startups = [], isLoading: startupsLoading } = useQuery<Startup[]>({
    queryKey: ["/api/startups/mine"],
  });

  const { data: matches = [], isLoading: matchesLoading } = useQuery<Match[]>({
    queryKey: ["/api/matches"],
  });

  const { data: firms = [], isLoading: firmsLoading } = useQuery<InvestmentFirm[]>({
    queryKey: ["/api/investment-firms"],
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const { data: outreaches = [], isLoading: outreachesLoading } = useQuery<Outreach[]>({
    queryKey: ["/api/outreaches"],
  });

  const { data: investors = [], isLoading: investorsLoading } = useQuery<Investor[]>({
    queryKey: ["/api/investors"],
  });

  const pageLoading = startupsLoading || matchesLoading || firmsLoading || contactsLoading || outreachesLoading || investorsLoading;

  const stats = useMemo(() => {
    const startupsCount = startups?.length ?? 0;
    const matchesCount = matches?.length ?? 0;
    const outreachesCount = outreaches?.length ?? 0;
    const activeThreads = outreaches.filter((o) =>
      ["draft", "pitch_sent", "opened", "replied", "call_scheduled"].includes(String(o.stage))
    ).length;

    return { startupsCount, matchesCount, outreachesCount, activeThreads };
  }, [startups, matches, outreaches]);

  const topMatches = useMemo(() => {
    return matches
      .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
      .slice(0, 6);
  }, [matches]);

  const firmsMap = useMemo(
    () => firms.reduce((acc, f) => ({ ...acc, [f.id]: f }), {} as Record<string, InvestmentFirm>),
    [firms]
  );

  const investorsMap = useMemo(
    () => investors.reduce((acc, i) => ({ ...acc, [i.id]: i }), {} as Record<string, Investor>),
    [investors]
  );

  if (pageLoading) {
    return (
      <div className="relative min-h-[55vh]">
        <LiquidBackground />
        <div className="flex h-[55vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading networking tools...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <LiquidBackground />
      <AnimatedGrid />

      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Pill>AI Networking</Pill>
            <h1 className="mt-3 text-4xl font-bold text-slate-900 dark:text-slate-100">
              Networking{" "}
              <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Workspace
              </span>
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Suggestions, warm intros, comparable investors, meetings, and AI-assisted notes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <MetricBadge icon={Building2} label="Startups" value={stats.startupsCount} />
            <MetricBadge icon={Sparkles} label="Matches" value={stats.matchesCount} />
            <MetricBadge icon={Send} label="Outreaches" value={stats.outreachesCount} />
            <MetricBadge icon={Users} label="Active" value={stats.activeThreads} />
          </div>
        </div>

        <div className="relative">
          <UnderGlow className="opacity-25" />
          <GlassSurface>
            <CardContent className="relative p-4 md:p-6">
              <Tabs defaultValue="suggestions" className="w-full">
                <GlassTabsList>
                  <GlassTabsTrigger value="suggestions">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Suggestions
                  </GlassTabsTrigger>
                  <GlassTabsTrigger value="introductions">
                    <Send className="mr-2 h-4 w-4" />
                    Introductions
                  </GlassTabsTrigger>
                  <GlassTabsTrigger value="similar">
                    <Building2 className="mr-2 h-4 w-4" />
                    Similar
                  </GlassTabsTrigger>
                  <GlassTabsTrigger value="meetings">
                    <Calendar className="mr-2 h-4 w-4" />
                    Meetings
                  </GlassTabsTrigger>
                </GlassTabsList>

                <div className="mt-6">
                  <TabsContent value="suggestions" className="m-0 space-y-6">
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <Badge className="rounded-full border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 text-slate-800 dark:text-slate-200">
                          AI Powered
                        </Badge>
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Top Investor Matches
                        </span>
                      </div>
                      
                      {topMatches.length === 0 ? (
                        <div className="flex flex-col items-center py-12">
                          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 mb-4">
                            <Target className="h-8 w-8 text-slate-500 dark:text-slate-400" />
                          </div>
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                            No matches yet
                          </h3>
                          <p className="text-slate-600 dark:text-slate-400 text-sm mb-4 text-center max-w-md">
                            Generate investor matches from the Matches page to see suggestions here
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {topMatches.map((match) => {
                            const firm = firmsMap[match.firmId || ""];
                            const investor = investorsMap[match.investorId || ""];
                            const investorName = investor 
                              ? [investor.firstName, investor.lastName].filter(Boolean).join(" ")
                              : null;
                            
                            return (
                              <GlassSurface key={match.id} className="p-4" data-testid={`card-suggestion-${match.id}`}>
                                <div className="flex items-start justify-between gap-2 mb-3">
                                  <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/50 dark:to-pink-900/50 flex items-center justify-center">
                                      <Building2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                    </div>
                                    <div>
                                      <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                                        {firm?.name || "Unknown Firm"}
                                      </p>
                                      {investorName && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                          {investorName}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <Badge className={`text-xs ${
                                    (match.matchScore || 0) >= 80 
                                      ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                                      : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300"
                                  }`}>
                                    {match.matchScore}%
                                  </Badge>
                                </div>
                                {match.matchReasons && match.matchReasons.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mb-3">
                                    {match.matchReasons.slice(0, 2).map((reason, i) => (
                                      <Badge key={i} className="text-xs rounded-full border-white/60 dark:border-white/20 bg-white/70 dark:bg-slate-700/70 text-slate-700 dark:text-slate-300">
                                        {reason}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="w-full rounded-xl"
                                  onClick={() => setSelectedInvestor(investor)}
                                  data-testid={`button-request-intro-${match.id}`}
                                >
                                  <Mail className="w-4 h-4 mr-1" />
                                  Request Intro
                                </Button>
                              </GlassSurface>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="introductions" className="m-0 space-y-6">
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <Badge className="rounded-full border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 text-slate-800 dark:text-slate-200">
                          Composer
                        </Badge>
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Warm Introduction Request
                        </span>
                      </div>

                      <GlassSurface className="p-6">
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                              Target Investor
                            </label>
                            <Input
                              placeholder="Search for an investor..."
                              className="rounded-xl bg-white/50 dark:bg-slate-800/50"
                              data-testid="input-target-investor"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                              Introduction Message
                            </label>
                            <Textarea
                              placeholder="Write a brief introduction about why you'd like to connect..."
                              value={introMessage}
                              onChange={(e) => setIntroMessage(e.target.value)}
                              className="min-h-[120px] rounded-xl bg-white/50 dark:bg-slate-800/50"
                              data-testid="input-intro-message"
                            />
                          </div>
                          <div className="flex justify-end gap-3">
                            <SecondaryGlassButton data-testid="button-ai-generate">
                              <Sparkles className="w-4 h-4 mr-2" />
                              AI Generate
                            </SecondaryGlassButton>
                            <RainbowButton data-testid="button-send-request">
                              <Send className="w-4 h-4 mr-2" />
                              Send Request
                            </RainbowButton>
                          </div>
                        </div>
                      </GlassSurface>
                    </div>
                  </TabsContent>

                  <TabsContent value="similar" className="m-0 space-y-6">
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <Badge className="rounded-full border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 text-slate-800 dark:text-slate-200">
                          Discovery
                        </Badge>
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Similar Company Investors
                        </span>
                      </div>

                      <GlassSurface className="p-6">
                        <div className="flex flex-col items-center py-8">
                          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 mb-4">
                            <Network className="h-8 w-8 text-slate-500 dark:text-slate-400" />
                          </div>
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                            Find Similar Investors
                          </h3>
                          <p className="text-slate-600 dark:text-slate-400 text-sm mb-4 text-center max-w-md">
                            Discover investors who have funded companies similar to yours
                          </p>
                          <RainbowButton data-testid="button-find-similar">
                            <Sparkles className="w-4 h-4 mr-2" />
                            Analyze Similar Companies
                          </RainbowButton>
                        </div>
                      </GlassSurface>
                    </div>
                  </TabsContent>

                  <TabsContent value="meetings" className="m-0 space-y-6">
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <Badge className="rounded-full border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 text-slate-800 dark:text-slate-200">
                          Calendar
                        </Badge>
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Upcoming Meetings
                        </span>
                      </div>

                      <GlassSurface className="p-6">
                        <div className="flex flex-col items-center py-8">
                          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 mb-4">
                            <Calendar className="h-8 w-8 text-slate-500 dark:text-slate-400" />
                          </div>
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                            No upcoming meetings
                          </h3>
                          <p className="text-slate-600 dark:text-slate-400 text-sm mb-4 text-center max-w-md">
                            Schedule meetings with investors through your outreach campaigns
                          </p>
                          <SecondaryGlassButton data-testid="button-schedule-meeting">
                            <Calendar className="w-4 h-4 mr-2" />
                            Schedule Meeting
                          </SecondaryGlassButton>
                        </div>
                      </GlassSurface>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </GlassSurface>
        </div>
      </div>
    </div>
  );
}
