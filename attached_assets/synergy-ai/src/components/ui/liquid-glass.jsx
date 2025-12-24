import React from "react";
import { cn } from "@/lib/utils";

export function LiquidGlassCard({
  children,
  className = "",
  gradient = "from-purple-500 via-pink-500 to-blue-500",
}) {
  return (
    <div className={cn("relative group", className)}>
      <div
        className={cn(
          "absolute inset-0 rounded-3xl blur-2xl opacity-25 transition-all duration-700 group-hover:opacity-40 group-hover:blur-3xl",
          `bg-gradient-to-br ${gradient}`
        )}
      />
      <div className="relative rounded-3xl border-2 border-white/60 bg-gradient-to-br from-white/55 to-white/30 backdrop-blur-2xl shadow-lg transition-all duration-500 hover:shadow-xl overflow-hidden">
        <div className="absolute inset-px rounded-3xl bg-gradient-to-br from-white/60 via-white/40 to-white/30 pointer-events-none" />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

export function GlassHeader({
  title,
  subtitle,
  icon: Icon,
  right,
  className = "",
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="h-5 w-5 text-indigo-600" /> : null}
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>
        </div>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      {right ? <div className="flex-shrink-0">{right}</div> : null}
    </div>
  );
}

export function GlassBody({ children, className = "" }) {
  return <div className={cn("p-6 md:p-8", className)}>{children}</div>;
}

export function GlassInset({
  children,
  className = "",
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border-2 border-white/60 bg-white/40 backdrop-blur-2xl p-4 shadow-inner",
        className
      )}
    >
      {children}
    </div>
  );
}

export function GlassKpi({
  label,
  value,
  sub,
  tone = "slate",
}) {
  const tones = {
    slate: "from-slate-50/80 to-white/40",
    emerald: "from-emerald-50/80 to-white/40",
    amber: "from-amber-50/80 to-white/40",
    rose: "from-rose-50/80 to-white/40",
    indigo: "from-indigo-50/80 to-white/40",
  };

  return (
    <div
      className={cn(
        "rounded-3xl border-2 border-white/60 bg-gradient-to-br backdrop-blur-2xl shadow-lg p-5",
        tones[tone] ?? tones.slate
      )}
    >
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <div className="mt-2 text-3xl font-bold text-slate-900">{value}</div>
      {sub ? <p className="mt-2 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}