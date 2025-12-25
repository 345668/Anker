import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ArrowLeft, Loader2, Edit } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import DealOverview from "@/components/dealroom/DealOverview.jsx";
import DealInvestors from "@/components/dealroom/DealInvestors.jsx";
import DealPitchAnalysis from "@/components/dealroom/DealPitchAnalysis.jsx";
import DealOutreach from "@/components/dealroom/DealOutreach.jsx";
import DealMilestones from "@/components/dealroom/DealMilestones.jsx";
import DealNotes from "@/components/dealroom/DealNotes.jsx";
import DealAIInsights from "@/components/dealroom/DealAIInsights.jsx";
import AutoUpdateMonitor from "@/components/dealroom/AutoUpdateMonitor.jsx";
import DocumentSummarizer from "@/components/dealroom/DocumentSummarizer.jsx";
import DueDiligence from "@/components/dealroom/DueDiligence.jsx";
import DealRoomAnalytics from "@/components/dealroom/DealRoomAnalytics.jsx";
import InvestorReporting from "@/components/dealroom/InvestorReporting.jsx";
import FinancialDataRoom from "@/components/dealroom/FinancialDataRoom.jsx";
import AIDocumentAssistant from "@/components/dealroom/AIDocumentAssistant.jsx";

import { cn } from "@/lib/utils";

/* -------------------------------------------------------
  SynergyAI: Light "Liquid Glass" primitives (self-contained)
-------------------------------------------------------- */

function GlobalStyles() {
  return (
    <style>{`
      @keyframes synergyGradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @keyframes synergySweep {
        0% { transform: translateX(-60%) rotate(12deg); opacity: 0; }
        25% { opacity: 1; }
        100% { transform: translateX(240%) rotate(12deg); opacity: 0; }
      }
    `}</style>
  );
}

function LiquidBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,rgba(15,23,42,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.35)_1px,transparent_1px)] [background-size:64px_64px]" />
      <div className="absolute -top-28 left-1/4 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-purple-400/30 to-pink-400/25 blur-3xl" />
      <div className="absolute top-1/4 right-1/4 h-[480px] w-[480px] rounded-full bg-gradient-to-br from-orange-400/20 to-yellow-400/18 blur-3xl" />
      <div className="absolute -bottom-28 left-1/3 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-green-400/18 to-blue-400/18 blur-3xl" />
    </div>
  );
}

function UnderGlow({ className }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 rounded-[28px]",
        "bg-gradient-to-br from-purple-400/30 via-pink-400/20 to-blue-400/25 blur-3xl opacity-35",
        className
      )}
    />
  );
}

function GlassPanel({ className, children }) {
  return (
    <div
      className={cn(
        "relative rounded-3xl border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30",
        "backdrop-blur-2xl shadow-lg",
        className
      )}
    >
      {children}
    </div>
  );
}

function PrimaryRainbowButton({ className, children, ...props }) {
  return (
    <Button
      className={cn(
        "relative overflow-hidden rounded-full px-6 h-11 text-white shadow-lg",
        "bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)]",
        "bg-[length:220%_220%] animate-[synergyGradient_10s_ease_infinite]",
        "hover:shadow-xl",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-100 transition-opacity">
        <span className="absolute -left-1/3 top-0 h-full w-1/2 rotate-12 bg-white/25 blur-xl animate-[synergySweep_1.2s_ease_forwards]" />
      </span>
      <span className="relative z-10 inline-flex items-center">{children}</span>
    </Button>
  );
}

function SecondaryGlassButton({ className, ...props }) {
  return (
    <Button
      variant="outline"
      className={cn(
        "h-11 rounded-full border-2 border-white/60 bg-white/55 text-slate-800 backdrop-blur-2xl",
        "hover:bg-white/70",
        className
      )}
      {...props}
    />
  );
}

function SegmentedTabs({ className, ...props }) {
  return (
    <TabsList
      className={cn(
        "w-full rounded-3xl border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30",
        "backdrop-blur-2xl shadow-lg p-1",
        className
      )}
      {...props}
    />
  );
}

function SegmentedTabTrigger({ className, ...props }) {
  return (
    <TabsTrigger
      className={cn(
        "rounded-2xl px-3 py-2 text-sm text-slate-600",
        "data-[state=active]:bg-white/70 data-[state=active]:text-slate-900 data-[state=active]:shadow-sm",
        "data-[state=inactive]:bg-transparent",
        className
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------
  Page
-------------------------------------------------------- */

export default function DealRoomDetails() {
  const [dealRoomId, setDealRoomId] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDealRoomId(params.get("id"));
  }, []);

  const { data: dealRoom, isLoading } = useQuery({
    queryKey: ["dealRoom", dealRoomId],
    queryFn: async () => {
      const results = await base44.entities.DealRoom.filter({ id: dealRoomId });
      return results[0];
    },
    enabled: !!dealRoomId,
  });

  const { data: startup } = useQuery({
    queryKey: ["startup", dealRoom?.startup_id],
    queryFn: async () => {
      const results = await base44.entities.Startup.filter({ id: dealRoom.startup_id });
      return results[0];
    },
    enabled: !!dealRoom?.startup_id,
  });

  const { data: matches = [] } = useQuery({
    queryKey: ["dealMatches", dealRoom?.match_ids],
    queryFn: () => base44.entities.Match.list("-match_score", 100),
    enabled: !!dealRoom?.match_ids,
    select: (data) => data.filter((m) => dealRoom?.match_ids?.includes(m.id)),
  });

  const { data: outreaches = [] } = useQuery({
    queryKey: ["dealOutreaches", dealRoom?.outreach_ids],
    queryFn: () => base44.entities.Outreach.list("-created_date", 200),
    enabled: !!dealRoom?.outreach_ids,
    select: (data) => data.filter((o) => dealRoom?.outreach_ids?.includes(o.id)),
  });

  const { data: firms = [] } = useQuery({
    queryKey: ["firms"],
    queryFn: () => base44.entities.InvestorFirm.list("-created_date", 500),
    enabled: !!dealRoom,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => base44.entities.Contact.list("-created_date", 500),
    enabled: !!dealRoom,
  });

  const { data: interactions = [] } = useQuery({
    queryKey: ["interactions", dealRoom?.id],
    queryFn: async () => {
      const allInteractions = await base44.entities.InteractionLog.list("-created_date", 500);
      return allInteractions.filter(
        (i) =>
          dealRoom.outreach_ids?.includes(i.outreach_id) ||
          dealRoom.match_ids?.some((matchId) => {
            const match = matches.find((m) => m.id === matchId);
            return match?.contact_id === i.contact_id || match?.firm_id === i.firm_id;
          })
      );
    },
    enabled: !!dealRoom && matches.length > 0,
  });

  const subtitle = useMemo(() => {
    const round = dealRoom?.funding_round ? `${dealRoom.funding_round} Round` : "Funding Round";
    const company = startup?.company_name ? `for ${startup.company_name}` : "";
    return `${round} ${company}`.trim();
  }, [dealRoom?.funding_round, startup?.company_name]);

  if (isLoading || !dealRoom) {
    return (
      <div className="relative min-h-[55vh]">
        <GlobalStyles />
        <LiquidBackground />
        <div className="flex h-[55vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading deal room…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <GlobalStyles />
      <LiquidBackground />

      <div className="space-y-6">
        {/* Header */}
        <div className="relative">
          <UnderGlow className="opacity-25" />

          <GlassPanel className="p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex items-center gap-3">
                <SecondaryGlassButton
                  size="icon"
                  className="h-11 w-11 rounded-full"
                  asChild
                  aria-label="Back to Deal Rooms"
                >
                  <Link to={createPageUrl("DealRooms")}>
                    <ArrowLeft className="h-5 w-5" />
                  </Link>
                </SecondaryGlassButton>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-3xl md:text-4xl font-bold text-slate-900">
                      {dealRoom.name}
                    </h1>

                    <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800 backdrop-blur-2xl">
                      Deal Room
                    </Badge>

                    {dealRoom.status && (
                      <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800 backdrop-blur-2xl capitalize">
                        {dealRoom.status}
                      </Badge>
                    )}
                  </div>

                  <p className="mt-1 text-slate-600">{subtitle}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row md:ml-auto">
                <SecondaryGlassButton size="sm" className="rounded-full">
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </SecondaryGlassButton>

                <PrimaryRainbowButton
                  onClick={() => queryClient.invalidateQueries(["dealRoom", dealRoomId])}
                >
                  <span className="inline-flex items-center">
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                      <span className="h-2 w-2 rounded-full bg-white" />
                    </span>
                    Refresh Insights
                  </span>
                </PrimaryRainbowButton>
              </div>
            </div>

            {/* Quick stats row */}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border-2 border-white/60 bg-white/45 p-3 backdrop-blur-2xl">
                <p className="text-xs text-slate-500">Matches</p>
                <p className="text-lg font-bold text-slate-900">{matches.length}</p>
              </div>
              <div className="rounded-2xl border-2 border-white/60 bg-white/45 p-3 backdrop-blur-2xl">
                <p className="text-xs text-slate-500">Outreaches</p>
                <p className="text-lg font-bold text-slate-900">{outreaches.length}</p>
              </div>
              <div className="rounded-2xl border-2 border-white/60 bg-white/45 p-3 backdrop-blur-2xl">
                <p className="text-xs text-slate-500">Interactions</p>
                <p className="text-lg font-bold text-slate-900">{interactions.length}</p>
              </div>
            </div>
          </GlassPanel>
        </div>

        {/* Auto Update Monitor - runs in background */}
        <AutoUpdateMonitor dealRoom={dealRoom} interactions={interactions} />

        {/* AI Insights surface */}
        <div className="relative">
          <UnderGlow className="opacity-20" />
          <GlassPanel className="p-4 md:p-6">
            <DealAIInsights dealRoom={dealRoom} startup={startup} matches={matches} outreaches={outreaches} firms={firms} />
          </GlassPanel>
        </div>

        {/* Tabs + Content */}
        <Tabs defaultValue="overview" className="w-full">
          <SegmentedTabs className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12 gap-1">
            <SegmentedTabTrigger value="overview">Overview</SegmentedTabTrigger>
            <SegmentedTabTrigger value="investors">Investors</SegmentedTabTrigger>
            <SegmentedTabTrigger value="pitch">Pitch</SegmentedTabTrigger>
            <SegmentedTabTrigger value="ai-docs">AI Docs</SegmentedTabTrigger>
            <SegmentedTabTrigger value="outreach">Outreach</SegmentedTabTrigger>
            <SegmentedTabTrigger value="milestones">Milestones</SegmentedTabTrigger>
            <SegmentedTabTrigger value="notes">Notes</SegmentedTabTrigger>
            <SegmentedTabTrigger value="financials">Financials</SegmentedTabTrigger>
            <SegmentedTabTrigger value="documents">Documents</SegmentedTabTrigger>
            <SegmentedTabTrigger value="diligence">Due Diligence</SegmentedTabTrigger>
            <SegmentedTabTrigger value="analytics">Analytics</SegmentedTabTrigger>
            <SegmentedTabTrigger value="reports">Reports</SegmentedTabTrigger>
          </SegmentedTabs>

          <TabsContent value="overview" className="mt-6">
            <div className="relative">
              <UnderGlow className="opacity-20" />
              <GlassPanel className="p-4 md:p-6">
                <DealOverview dealRoom={dealRoom} startup={startup} matches={matches} outreaches={outreaches} />
              </GlassPanel>
            </div>
          </TabsContent>

          <TabsContent value="investors" className="mt-6">
            <div className="relative">
              <UnderGlow className="opacity-20" />
              <GlassPanel className="p-4 md:p-6">
                <DealInvestors dealRoom={dealRoom} matches={matches} firms={firms} contacts={contacts} />
              </GlassPanel>
            </div>
          </TabsContent>

          <TabsContent value="pitch" className="mt-6">
            <div className="relative">
              <UnderGlow className="opacity-20" />
              <GlassPanel className="p-4 md:p-6">
                <DealPitchAnalysis startup={startup} dealRoom={dealRoom} />
              </GlassPanel>
            </div>
          </TabsContent>

          <TabsContent value="ai-docs" className="mt-6">
            <div className="relative">
              <UnderGlow className="opacity-20" />
              <GlassPanel className="p-4 md:p-6">
                <AIDocumentAssistant
                  dealRoom={dealRoom}
                  documents={dealRoom.documents || []}
                  onDocumentsUpdate={() => queryClient.invalidateQueries(["dealRoom", dealRoomId])}
                />
              </GlassPanel>
            </div>
          </TabsContent>

          <TabsContent value="outreach" className="mt-6">
            <div className="relative">
              <UnderGlow className="opacity-20" />
              <GlassPanel className="p-4 md:p-6">
                <DealOutreach dealRoom={dealRoom} outreaches={outreaches} firms={firms} contacts={contacts} />
              </GlassPanel>
            </div>
          </TabsContent>

          <TabsContent value="milestones" className="mt-6">
            <div className="relative">
              <UnderGlow className="opacity-20" />
              <GlassPanel className="p-4 md:p-6">
                <DealMilestones dealRoom={dealRoom} />
              </GlassPanel>
            </div>
          </TabsContent>

          <TabsContent value="notes" className="mt-6">
            <div className="relative">
              <UnderGlow className="opacity-20" />
              <GlassPanel className="p-4 md:p-6">
                <DealNotes dealRoom={dealRoom} />
              </GlassPanel>
            </div>
          </TabsContent>

          <TabsContent value="financials" className="mt-6">
            <div className="relative">
              <UnderGlow className="opacity-20" />
              <GlassPanel className="p-4 md:p-6">
                <FinancialDataRoom dealRoom={dealRoom} startup={startup} />
              </GlassPanel>
            </div>
          </TabsContent>

          <TabsContent value="documents" className="mt-6">
            <div className="relative">
              <UnderGlow className="opacity-20" />
              <GlassPanel className="p-4 md:p-6">
                <DocumentSummarizer dealRoom={dealRoom} />
              </GlassPanel>
            </div>
          </TabsContent>

          <TabsContent value="diligence" className="mt-6">
            <div className="relative">
              <UnderGlow className="opacity-20" />
              <GlassPanel className="p-4 md:p-6">
                <DueDiligence dealRoom={dealRoom} startup={startup} />
              </GlassPanel>
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <div className="relative">
              <UnderGlow className="opacity-20" />
              <GlassPanel className="p-4 md:p-6">
                <DealRoomAnalytics dealRoom={dealRoom} matches={matches} outreaches={outreaches} interactions={interactions} />
              </GlassPanel>
            </div>
          </TabsContent>

          <TabsContent value="reports" className="mt-6">
            <div className="relative">
              <UnderGlow className="opacity-20" />
              <GlassPanel className="p-4 md:p-6">
                <InvestorReporting dealRoom={dealRoom} startup={startup} matches={matches} firms={firms} />
              </GlassPanel>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}