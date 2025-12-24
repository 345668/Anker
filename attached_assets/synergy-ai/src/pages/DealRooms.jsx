import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Plus,
  Loader2,
  TrendingUp,
  Users,
  Calendar,
  Target,
  Flame,
  Snowflake,
  ThermometerSun,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* -------------------------------------------
   SynergyAI: Light "Liquid Glass" primitives
-------------------------------------------- */

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

function GlassCard({ className, children }) {
  return (
    <Card
      className={cn(
        "relative rounded-3xl border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30",
        "backdrop-blur-2xl shadow-lg hover:shadow-xl transition-shadow",
        className
      )}
    >
      {children}
    </Card>
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

const GlobalStyles = () => (
  <style>{`
    @keyframes synergyGradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes synergySweep {
      0% { transform: translateX(0) rotate(12deg); opacity: 0; }
      20% { opacity: 1; }
      100% { transform: translateX(220%) rotate(12deg); opacity: 0; }
    }
  `}</style>
);

/* -------------------------------------------
   Config
-------------------------------------------- */

const temperatureConfig = {
  hot: { icon: Flame, tint: "from-red-500/15 to-orange-400/10", label: "Hot", iconColor: "text-red-600" },
  warm: { icon: ThermometerSun, tint: "from-orange-500/15 to-amber-400/10", label: "Warm", iconColor: "text-orange-600" },
  cold: { icon: Snowflake, tint: "from-blue-500/15 to-cyan-400/10", label: "Cold", iconColor: "text-blue-600" },
  frozen: { icon: Snowflake, tint: "from-slate-400/15 to-slate-300/10", label: "Frozen", iconColor: "text-slate-500" },
};

const statusConfig = {
  preparing: { label: "Preparing", badge: "bg-white/55 text-slate-800 border-2 border-white/60" },
  active: { label: "Active", badge: "bg-emerald-100/70 text-emerald-700 border-2 border-white/60" },
  closing: { label: "Closing", badge: "bg-amber-100/70 text-amber-700 border-2 border-white/60" },
  closed: { label: "Closed", badge: "bg-indigo-100/70 text-indigo-700 border-2 border-white/60" },
  paused: { label: "Paused", badge: "bg-red-100/70 text-red-700 border-2 border-white/60" },
};

/* -------------------------------------------
   Page
-------------------------------------------- */

export default function DealRooms() {
  const [user, setUser] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    funding_round: "Seed",
    target_amount: "",
    target_close_date: "",
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const userData = await base44.auth.me();
      setUser(userData);
    };
    loadUser();
  }, []);

  const { data: dealRooms = [], isLoading } = useQuery({
    queryKey: ["dealRooms"],
    queryFn: () => base44.entities.DealRoom.list("-created_date", 100),
    enabled: !!user,
  });

  const { data: startups = [] } = useQuery({
    queryKey: ["myStartups", user?.id],
    queryFn: () => base44.entities.Startup.filter({ founder_id: user?.id }),
    enabled: !!user,
  });

  const createDealRoomMutation = useMutation({
    mutationFn: (data) => base44.entities.DealRoom.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(["dealRooms"]);
      setShowCreateDialog(false);
      setFormData({ name: "", funding_round: "Seed", target_amount: "", target_close_date: "" });
    },
  });

  const handleCreate = () => {
    if (startups.length === 0) return;
    createDealRoomMutation.mutate({
      ...formData,
      startup_id: startups[0].id,
      target_amount: parseFloat(formData.target_amount),
      status: "preparing",
      investor_ids: [],
      match_ids: [],
      outreach_ids: [],
      milestones: [],
      notes: [],
      raised_amount: 0,
    });
  };

  const hasStartups = startups.length > 0;

  const headerSubtitle = useMemo(() => {
    if (!hasStartups) return "Add a startup first to create and manage deal rooms.";
    return "Manage funding rounds and track progress with AI-native structure.";
  }, [hasStartups]);

  if (isLoading) {
    return (
      <div className="relative min-h-[55vh]">
        <GlobalStyles />
        <LiquidBackground />
        <div className="flex h-[55vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading deal rooms…</span>
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
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30 px-3 py-1 backdrop-blur-2xl text-xs font-semibold text-slate-700 shadow-lg">
              <span className="h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-blue-500" />
              Fundraising Workspace
            </div>

            <h1 className="mt-3 text-4xl font-bold text-slate-900">
              Deal{" "}
              <span className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
                Rooms
              </span>
            </h1>
            <p className="mt-1 text-slate-600">{headerSubtitle}</p>
          </div>

          <PrimaryRainbowButton
            onClick={() => setShowCreateDialog(true)}
            disabled={!hasStartups}
            title={!hasStartups ? "Create a startup first" : "Create a new deal room"}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Deal Room
          </PrimaryRainbowButton>
        </div>

        {/* Empty state */}
        {dealRooms.length === 0 ? (
          <div className="relative">
            <UnderGlow />
            <GlassCard className="border-2 border-white/60">
              <CardContent className="py-12">
                <div className="mx-auto flex max-w-xl flex-col items-center text-center">
                  <div className="relative mb-5">
                    <div className="pointer-events-none absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-purple-400/25 via-pink-400/15 to-blue-400/20 blur-2xl opacity-50" />
                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl border-2 border-white/60 bg-white/55 backdrop-blur-2xl shadow-lg">
                      <Target className="h-8 w-8 text-indigo-600" />
                    </div>
                  </div>

                  <h3 className="text-2xl font-bold text-slate-900">No deal rooms yet</h3>
                  <p className="mt-2 text-slate-600">
                    Create a deal room to organize investors, track outreach, and monitor progress against your target.
                  </p>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <PrimaryRainbowButton onClick={() => setShowCreateDialog(true)} disabled={!hasStartups}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Deal Room
                    </PrimaryRainbowButton>

                    <SecondaryGlassButton
                      onClick={() => window.location.assign("/import")}
                      disabled={!hasStartups}
                      title={!hasStartups ? "Create a startup first" : "Import investors / data"}
                    >
                      Import Data
                    </SecondaryGlassButton>
                  </div>

                  {!hasStartups && (
                    <div className="mt-4 rounded-2xl border-2 border-white/60 bg-amber-100/60 px-4 py-3 text-sm text-amber-900 backdrop-blur-2xl">
                      Add a startup to unlock deal rooms and fundraising workflows.
                    </div>
                  )}
                </div>
              </CardContent>
            </GlassCard>
          </div>
        ) : (
          /* Grid */
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {dealRooms.map((dealRoom) => {
              const temp = temperatureConfig[dealRoom.deal_temperature] || temperatureConfig.warm;
              const TempIcon = temp.icon;

              const target = Number(dealRoom.target_amount || 0);
              const raised = Number(dealRoom.raised_amount || 0);
              const progress = target > 0 ? Math.min(100, Math.round((raised / target) * 100)) : 0;

              const status = statusConfig[dealRoom.status] || statusConfig.preparing;

              return (
                <Link key={dealRoom.id} to={createPageUrl(`DealRoomDetails?id=${dealRoom.id}`)}>
                  <div className="relative group">
                    <UnderGlow className="opacity-25 group-hover:opacity-40 transition-opacity" />

                    <GlassCard className="cursor-pointer overflow-hidden">
                      <CardHeader className="pb-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <CardTitle className="text-slate-900 group-hover:text-indigo-700 transition-colors">
                              {dealRoom.name}
                            </CardTitle>

                            <CardDescription className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge className="rounded-full border-2 border-white/60 bg-white/55 text-slate-800 backdrop-blur-2xl">
                                {dealRoom.funding_round}
                              </Badge>
                              <Badge className={cn("rounded-full", status.badge)}>{status.label}</Badge>
                            </CardDescription>
                          </div>

                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                "flex items-center gap-2 rounded-full border-2 border-white/60 bg-white/55 px-3 py-1 backdrop-blur-2xl shadow-sm",
                                "bg-gradient-to-br",
                                temp.tint
                              )}
                            >
                              <TempIcon className={cn("h-4 w-4", temp.iconColor)} />
                              <span className="text-xs font-semibold text-slate-800">{temp.label}</span>
                            </div>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        {/* Funding Progress */}
                        <div className="rounded-3xl border-2 border-white/60 bg-white/45 p-4 backdrop-blur-2xl">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-slate-800">Funding Progress</span>
                            <span className="text-sm font-semibold text-slate-900">
                              ${(raised / 1_000_000).toFixed(1)}M / ${(target / 1_000_000).toFixed(1)}M
                            </span>
                          </div>

                          <Progress value={progress} className="mt-3 h-2" />
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-xs text-slate-500">{progress}% raised</span>
                            {dealRoom.success_probability ? (
                              <span className="inline-flex items-center gap-2 text-xs text-slate-600">
                                <TrendingUp className="h-3.5 w-3.5 text-indigo-600" />
                                <span>AI: {dealRoom.success_probability}% success</span>
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500">AI insights pending</span>
                            )}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-2xl border-2 border-white/60 bg-white/45 p-3 backdrop-blur-2xl">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-slate-500" />
                              <div>
                                <p className="text-xs text-slate-500">Investors</p>
                                <p className="text-sm font-bold text-slate-900">{dealRoom.investor_ids?.length || 0}</p>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl border-2 border-white/60 bg-white/45 p-3 backdrop-blur-2xl">
                            <div className="flex items-center gap-2">
                              <Target className="h-4 w-4 text-slate-500" />
                              <div>
                                <p className="text-xs text-slate-500">Matches</p>
                                <p className="text-sm font-bold text-slate-900">{dealRoom.match_ids?.length || 0}</p>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl border-2 border-white/60 bg-white/45 p-3 backdrop-blur-2xl">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-slate-500" />
                              <div>
                                <p className="text-xs text-slate-500">Close</p>
                                <p className="text-sm font-bold text-slate-900">
                                  {dealRoom.target_close_date
                                    ? new Date(dealRoom.target_close_date).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                      })
                                    : "TBD"}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Risk Indicators */}
                        {dealRoom.risk_factors?.length > 0 && (
                          <div className="flex items-center gap-2 rounded-2xl border-2 border-white/60 bg-amber-100/55 px-4 py-3 text-xs text-amber-900 backdrop-blur-2xl">
                            <AlertTriangle className="h-4 w-4 text-amber-700" />
                            <span>
                              {dealRoom.risk_factors.length} risk factor{dealRoom.risk_factors.length > 1 ? "s" : ""} identified
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </GlassCard>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent
            className={cn(
              "max-w-lg rounded-3xl border-2 border-white/60",
              "bg-gradient-to-br from-white/60 to-white/30 backdrop-blur-2xl shadow-xl"
            )}
          >
            <DialogHeader>
              <DialogTitle className="text-slate-900">Create Deal Room</DialogTitle>
              <DialogDescription className="text-slate-600">
                Set up a dedicated workspace to track your funding round.
              </DialogDescription>
            </DialogHeader>

            {!hasStartups && (
              <div className="rounded-2xl border-2 border-white/60 bg-amber-100/60 px-4 py-3 text-sm text-amber-900 backdrop-blur-2xl">
                Add a startup first. Deal rooms are created under your primary startup.
              </div>
            )}

            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-700">Deal Room Name</Label>
                <Input
                  placeholder="e.g., Seed Round Q1 2026"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 text-slate-800 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700">Funding Round</Label>
                <Select
                  value={formData.funding_round}
                  onValueChange={(v) => setFormData({ ...formData, funding_round: v })}
                >
                  <SelectTrigger className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 text-slate-800 focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="Pre-seed">Pre-seed</SelectItem>
                    <SelectItem value="Seed">Seed</SelectItem>
                    <SelectItem value="Series A">Series A</SelectItem>
                    <SelectItem value="Series B">Series B</SelectItem>
                    <SelectItem value="Series C+">Series C+</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700">Target Amount ($)</Label>
                <Input
                  type="number"
                  placeholder="1000000"
                  value={formData.target_amount}
                  onChange={(e) => setFormData({ ...formData, target_amount: e.target.value })}
                  className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 text-slate-800 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700">Target Close Date</Label>
                <Input
                  type="date"
                  value={formData.target_close_date}
                  onChange={(e) => setFormData({ ...formData, target_close_date: e.target.value })}
                  className="h-11 rounded-2xl border-2 border-white/60 bg-white/55 text-slate-800 placeholder:text-slate-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <SecondaryGlassButton onClick={() => setShowCreateDialog(false)}>Cancel</SecondaryGlassButton>

                <PrimaryRainbowButton
                  onClick={handleCreate}
                  disabled={!hasStartups || !formData.name || !formData.target_amount || createDealRoomMutation.isPending}
                  title={!hasStartups ? "Create a startup first" : "Create deal room"}
                >
                  {createDealRoomMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Create Deal Room
                </PrimaryRainbowButton>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}