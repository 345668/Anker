import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Users, Sparkles, Loader2, Send, Building2, Target, Calendar, Network } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import InvestorSuggestions from "@/components/networking/InvestorSuggestions";
import IntroductionComposer from "@/components/networking/IntroductionComposer";
import SimilarCompanyInvestors from "@/components/networking/SimilarCompanyInvestors";
import MeetingScheduler from "@/components/networking/MeetingScheduler";
import AINoteTaker from "@/components/networking/AINoteTaker";
import CalendarView from "@/components/networking/CalendarView";
import InvestorNetworkGraph from "@/components/networking/InvestorNetworkGraph";

/**
 * Networking — SynergyAI "Liquid Glass" restyle
 */

function AnimatedGrid() {
  return (
    <div
      className="absolute inset-0 opacity-[0.22] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_70%)]"
      aria-hidden="true">

      <div className="h-full w-full bg-[linear-gradient(to_right,rgba(15,23,42,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.07)_1px,transparent_1px)] bg-[size:56px_56px] animate-[gridDrift_18s_linear_infinite]" />
      <style>{`
        @keyframes gridDrift {
          from { transform: translateY(0px); }
          to { transform: translateY(56px); }
        }
      `}</style>
    </div>);

}

function PageBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />
      <AnimatedGrid />
      <div className="absolute -top-24 -right-28 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-purple-400/20 to-pink-400/16 blur-3xl" />
      <div className="absolute top-1/3 right-[10%] h-[420px] w-[420px] rounded-full bg-gradient-to-br from-orange-400/14 to-yellow-400/12 blur-3xl" />
      <div className="absolute -bottom-24 left-[12%] h-[520px] w-[520px] rounded-full bg-gradient-to-br from-green-400/12 to-blue-400/14 blur-3xl" />
    </div>);

}

function GlassSurface({ className, children }) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-3xl",
        "border-2 border-white/60",
        "bg-gradient-to-br from-white/55 to-white/30",
        "backdrop-blur-2xl",
        "shadow-lg hover:shadow-xl transition-shadow",
        className
      )}>

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.65),transparent_55%)] opacity-60" />
      {children}
    </Card>);

}

function UnderGlow({ className }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute -inset-4 -z-10 rounded-[2.25rem] blur-3xl opacity-30",
        "bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400",
        className
      )}
      aria-hidden="true" />);


}

function Pill({ children, className }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1",
        "border-2 border-white/60 bg-white/55 backdrop-blur-2xl",
        "text-xs font-semibold text-slate-700",
        className
      )}>

      <span className="h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
      {children}
    </div>);

}

function MetricBadge({ icon: Icon, label, value }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-2xl border-2 border-white/60 bg-white/55 px-3 py-2 backdrop-blur-2xl shadow-lg">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl blur-md opacity-40" />
        <div className="relative rounded-xl bg-gradient-to-br from-purple-100/80 to-blue-100/80 border-2 border-white/60 p-2 shadow-lg">
          <Icon className="h-4 w-4 text-purple-600" />
        </div>
      </div>
      <div className="leading-tight">
        <div className="text-xs font-medium text-slate-600">{label}</div>
        <div className="text-sm font-semibold text-slate-900">{value}</div>
      </div>
    </div>);

}

function GlassTabsList({ className, ...props }) {
  return (
    <TabsList
      className={cn(
        "grid w-full grid-cols-2 gap-2 rounded-3xl border-2 border-white/60 bg-white/55 p-2",
        "backdrop-blur-2xl shadow-lg",
        "md:grid-cols-6",
        className
      )}
      {...props} />);


}

function GlassTabsTrigger({ className, ...props }) {
  return (
    <TabsTrigger
      className={cn(
        "h-11 rounded-2xl flex items-center justify-center",
        "data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-blue-600",
        "data-[state=active]:text-white data-[state=active]:shadow-lg",
        "text-slate-700 hover:bg-white/70 hover:text-slate-900",
        "transition",
        className
      )}
      {...props} />);


}

export default function Networking() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
    };
    loadUser();
  }, []);

  const { data: startups = [], isLoading: startupsLoading } = useQuery({
    queryKey: ["myStartups", user?.id],
    queryFn: () => base44.entities.Startup.filter({ founder_id: user?.id }),
    enabled: !!user
  });

  const { data: matches = [], isLoading: matchesLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: () => base44.entities.Match.list("-match_score", 100),
    enabled: !!user
  });

  const { data: firms = [], isLoading: firmsLoading } = useQuery({
    queryKey: ["firms"],
    queryFn: () => base44.entities.InvestorFirm.list("-created_date", 500),
    enabled: !!user
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => base44.entities.Contact.list("-created_date", 500),
    enabled: !!user
  });

  const { data: outreaches = [], isLoading: outreachesLoading } = useQuery({
    queryKey: ["outreaches"],
    queryFn: () => base44.entities.Outreach.list("-created_date", 200),
    enabled: !!user
  });

  const pageLoading =
  !user || startupsLoading || matchesLoading || firmsLoading || contactsLoading || outreachesLoading;

  const stats = useMemo(() => {
    const startupsCount = startups?.length ?? 0;
    const matchesCount = matches?.length ?? 0;
    const outreachesCount = outreaches?.length ?? 0;

    const activeThreads = outreaches.filter((o) =>
    ["draft", "sent", "replied", "call_scheduled"].includes(String(o.stage))
    ).length;

    return { startupsCount, matchesCount, outreachesCount, activeThreads };
  }, [startups, matches, outreaches]);

  if (pageLoading) {
    return (
      <div className="relative min-h-[55vh]">
        <PageBackground />
        <div className="flex h-[55vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading networking tools…</span>
          </div>
        </div>
      </div>);

  }

  return (
    <div className="relative">
      <PageBackground />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <Pill>AI Networking</Pill>
            <h1 className="mt-3 text-4xl font-bold text-slate-900">
              Networking <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">Workspace</span>
            </h1>
            <p className="mt-2 text-slate-600">
              Suggestions, warm intros, comparable investors, meetings, and AI-assisted notes—one place.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <MetricBadge icon={Building2} label="Startups" value={stats.startupsCount} />
            <MetricBadge icon={Sparkles} label="Matches" value={stats.matchesCount} />
            <MetricBadge icon={Send} label="Outreaches" value={stats.outreachesCount} />
            <MetricBadge icon={Users} label="Active threads" value={stats.activeThreads} />
          </div>
        </div>

        {/* Tabs Shell */}
        <GlassSurface>
          <UnderGlow className="opacity-25" />
          <CardContent className="relative p-4 md:p-6">
            <Tabs defaultValue="suggestions" className="w-full">
              <GlassTabsList className="bg-white/55 text-muted-foreground mr-1 mb-1 ml-1 pt-1 pr-2 pb-16 pl-2 rounded-3xl h-9 items-center justify-center grid w-full grid-cols-2 gap-2 border-2 border-white/60 backdrop-blur-2xl shadow-lg md:grid-cols-6">
                <GlassTabsTrigger value="network" className="text-slate-700 px-3 py-1 text-sm font-medium rounded-2xl whitespace-nowrap ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-11 flex items-center justify-center data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg hover:bg-white/70 hover:text-slate-900 transition">
                  <Network className="mr-2 h-4 w-4" />
                  Network
                </GlassTabsTrigger>

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
                  <Target className="mr-2 h-4 w-4" />
                  Meetings
                </GlassTabsTrigger>

                <GlassTabsTrigger value="notes">
                  <Users className="mr-2 h-4 w-4" />
                  AI Notes
                </GlassTabsTrigger>
              </GlassTabsList>

              <div className="mt-6">
                {/* Network Graph */}
                <TabsContent value="network" className="m-0 space-y-6">
                  <GlassSurface>
                    <UnderGlow className="opacity-20 bg-gradient-to-r from-purple-400 via-blue-400 to-teal-400" />
                    <CardContent className="relative p-5 md:p-6">
                      <div className="flex items-center gap-2">
                        <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800">
                          Visualization
                        </Badge>
                        <span className="text-sm font-semibold text-slate-900">Investor Network Graph</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        Interactive network showing your startup connections, investor matches, and outreach activity.
                      </p>
                    </CardContent>
                  </GlassSurface>

                  <InvestorNetworkGraph
                    startups={startups}
                    matches={matches}
                    firms={firms}
                    contacts={contacts}
                    outreaches={outreaches} />

                </TabsContent>

                {/* Suggestions */}
                <TabsContent value="suggestions" className="m-0 space-y-6">
                  <GlassSurface>
                    <UnderGlow className="opacity-20 bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400" />
                    <CardContent className="relative p-5 md:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800">
                              Recommended
                            </Badge>
                            <span className="text-sm font-semibold text-slate-900">Investor Suggestions</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">
                            Ranked investors based on your startup profile, prior outreach signals, and match quality.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </GlassSurface>

                  <InvestorSuggestions
                    startups={startups}
                    matches={matches}
                    firms={firms}
                    contacts={contacts}
                    outreaches={outreaches} />

                </TabsContent>

                {/* Introductions */}
                <TabsContent value="introductions" className="m-0 space-y-6">
                  <GlassSurface>
                    <UnderGlow className="opacity-20 bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-400" />
                    <CardContent className="relative p-5 md:p-6">
                      <div className="flex items-center gap-2">
                        <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800">
                          Outreach
                        </Badge>
                        <span className="text-sm font-semibold text-slate-900">Introduction Composer</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        Generate high-signal intros that match the investor's thesis and your current fundraising stage.
                      </p>
                    </CardContent>
                  </GlassSurface>

                  <IntroductionComposer startups={startups} matches={matches} firms={firms} contacts={contacts} />
                </TabsContent>

                {/* Similar Companies */}
                <TabsContent value="similar" className="m-0 space-y-6">
                  <GlassSurface>
                    <UnderGlow className="opacity-20 bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400" />
                    <CardContent className="relative p-5 md:p-6">
                      <div className="flex items-center gap-2">
                        <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800">
                          Discovery
                        </Badge>
                        <span className="text-sm font-semibold text-slate-900">Similar Company Investors</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        Find investors that backed comparable companies, and reuse the pattern for your outreach.
                      </p>
                    </CardContent>
                  </GlassSurface>

                  <SimilarCompanyInvestors startups={startups} firms={firms} contacts={contacts} />
                </TabsContent>

                {/* Meetings */}
                <TabsContent value="meetings" className="m-0 space-y-6">
                  <GlassSurface>
                    <UnderGlow className="opacity-20 bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400" />
                    <CardContent className="relative p-5 md:p-6">
                      <div className="flex items-center gap-2">
                        <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800">
                          Live
                        </Badge>
                        <span className="text-sm font-semibold text-slate-900">Meetings & Calendar</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        Schedule investor calls and keep pipeline activity visible alongside your calendar view.
                      </p>
                    </CardContent>
                  </GlassSurface>

                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <GlassSurface>
                      <UnderGlow className="opacity-20 bg-gradient-to-r from-blue-400 to-cyan-400" />
                      <CardContent className="relative p-5 md:p-6">
                        <div className="mb-4 flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-blue-600" />
                          <p className="text-sm font-semibold text-slate-900">Meeting Scheduler</p>
                        </div>
                        <MeetingScheduler contacts={contacts} firms={firms} />
                      </CardContent>
                    </GlassSurface>

                    <GlassSurface>
                      <UnderGlow className="opacity-20 bg-gradient-to-r from-purple-400 to-pink-400" />
                      <CardContent className="relative p-5 md:p-6">
                        <div className="mb-4 flex items-center gap-2">
                          <Target className="h-4 w-4 text-purple-600" />
                          <p className="text-sm font-semibold text-slate-900">Calendar View</p>
                        </div>
                        <CalendarView />
                      </CardContent>
                    </GlassSurface>
                  </div>
                </TabsContent>

                {/* AI Notes */}
                <TabsContent value="notes" className="m-0 space-y-6">
                  <GlassSurface>
                    <UnderGlow className="opacity-20 bg-gradient-to-r from-emerald-400 via-green-400 to-lime-400" />
                    <CardContent className="relative p-5 md:p-6">
                      <div className="flex items-center gap-2">
                        <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800">
                          Assist
                        </Badge>
                        <span className="text-sm font-semibold text-slate-900">AI Note Taker</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        Capture meeting notes, extract action items, and standardize follow-ups for investor conversations.
                      </p>
                    </CardContent>
                  </GlassSurface>

                  <AINoteTaker />
                </TabsContent>
              </div>
            </Tabs>
          </CardContent>
        </GlassSurface>
      </div>
    </div>);

}