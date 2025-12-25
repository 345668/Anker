import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Loader2 } from "lucide-react";
import EngagementAnalytics from "@/components/crm/EngagementAnalytics";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------
   Background + shared visual primitives
-------------------------------------------------------- */

function LiquidBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30" />

      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.06]
        [background-image:linear-gradient(to_right,rgba(15,23,42,0.35)_1px,transparent_1px),
        linear-gradient(to_bottom,rgba(15,23,42,0.35)_1px,transparent_1px)]
        [background-size:64px_64px]"
      />

      {/* Gradient blobs */}
      <div className="absolute -top-32 left-1/4 w-[560px] h-[560px] rounded-full bg-gradient-to-br from-purple-400/30 to-pink-400/25 blur-3xl" />
      <div className="absolute top-1/3 right-1/4 w-[480px] h-[480px] rounded-full bg-gradient-to-br from-orange-400/20 to-yellow-400/20 blur-3xl" />
      <div className="absolute -bottom-32 left-1/3 w-[560px] h-[560px] rounded-full bg-gradient-to-br from-green-400/20 to-blue-400/20 blur-3xl" />
    </div>
  );
}

function GlassPanel({ children, className }) {
  return (
    <div
      className={cn(
        "relative rounded-3xl border-2 border-white/60",
        "bg-gradient-to-br from-white/55 to-white/30",
        "backdrop-blur-2xl shadow-lg",
        className
      )}
    >
      {children}
    </div>
  );
}

function UnderGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 rounded-[28px]
      bg-gradient-to-br from-purple-400/30 via-pink-400/20 to-blue-400/25
      blur-3xl opacity-30"
    />
  );
}

function RainbowIcon({ icon: Icon }) {
  return (
    <div className="relative w-12 h-12 rounded-2xl
      bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)]
      bg-[length:220%_220%] animate-[gradient_10s_ease_infinite]
      shadow-md">
      <div className="absolute inset-0 rounded-2xl bg-white/10" />
      <div className="absolute inset-0 flex items-center justify-center">
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   Page
-------------------------------------------------------- */

export default function OutreachAnalytics() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: outreaches = [], isLoading } = useQuery({
    queryKey: ["outreaches"],
    queryFn: () => base44.entities.Outreach.list("-created_date", 500),
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="relative min-h-[60vh]">
        <LiquidBackground />
        <div className="flex h-[60vh] items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading outreach analytics…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-8">
      <LiquidBackground />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900">
            Outreach{" "}
            <span className="bg-[linear-gradient(90deg,#7C3AED,#EC4899,#F97316,#FACC15,#22C55E,#3B82F6)]
              bg-clip-text text-transparent">
              Analytics
            </span>
          </h1>
          <p className="mt-2 text-slate-600 max-w-2xl">
            AI-powered insights into investor engagement, response quality,
            and outreach performance over time.
          </p>
        </div>

        {/* KPI pill */}
        <GlassPanel className="px-4 py-3 w-full md:w-auto">
          <div className="flex items-center gap-3">
            <RainbowIcon icon={BarChart3} />
            <div>
              <p className="text-xs text-slate-500">Outreaches analyzed</p>
              <p className="text-lg font-bold text-slate-900">
                {outreaches.length}
              </p>
            </div>
          </div>
        </GlassPanel>
      </div>

      {/* Analytics Surface */}
      <div className="relative">
        <UnderGlow />
        <GlassPanel className="p-4 md:p-6">
          <EngagementAnalytics outreaches={outreaches} />
        </GlassPanel>
      </div>
    </div>
  );
}