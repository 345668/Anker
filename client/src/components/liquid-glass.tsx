import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectTrigger } from "@/components/ui/select";
import type { ComponentPropsWithoutRef } from "react";

export function LiquidBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50/30 to-blue-50/30 dark:from-slate-900 dark:via-purple-900/20 dark:to-blue-900/20" />
      <div className="absolute inset-0 opacity-[0.06] dark:opacity-[0.04] [background-image:linear-gradient(to_right,rgba(15,23,42,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.35)_1px,transparent_1px)] [background-size:64px_64px]" />
      <div className="absolute -top-28 left-1/4 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-purple-400/30 to-pink-400/25 blur-3xl dark:from-purple-500/20 dark:to-pink-500/15" />
      <div className="absolute top-1/4 right-1/4 h-[480px] w-[480px] rounded-full bg-gradient-to-br from-orange-400/20 to-yellow-400/18 blur-3xl dark:from-orange-500/15 dark:to-yellow-500/10" />
      <div className="absolute -bottom-28 left-1/3 h-[560px] w-[560px] rounded-full bg-gradient-to-br from-green-400/18 to-blue-400/18 blur-3xl dark:from-green-500/12 dark:to-blue-500/12" />
    </div>
  );
}

export function AnimatedGrid() {
  return (
    <div
      className="absolute inset-0 opacity-[0.22] dark:opacity-[0.15] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_70%)]"
      aria-hidden="true"
    >
      <div className="h-full w-full bg-[linear-gradient(to_right,rgba(15,23,42,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.07)_1px,transparent_1px)] bg-[size:56px_56px] animate-[gridDrift_18s_linear_infinite]" />
    </div>
  );
}

interface GlassSurfaceProps extends ComponentPropsWithoutRef<typeof Card> {
  children: React.ReactNode;
  className?: string;
}

export function GlassSurface({ className, children, ...props }: GlassSurfaceProps) {
  return (
    <Card
      className={cn(
        "relative overflow-visible rounded-3xl",
        "border-2 border-white/60 dark:border-white/20",
        "bg-gradient-to-br from-white/55 to-white/30 dark:from-slate-800/55 dark:to-slate-900/30",
        "backdrop-blur-2xl",
        "shadow-lg",
        className
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.65),transparent_55%)] dark:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.08),transparent_55%)] opacity-60" />
      {children}
    </Card>
  );
}

interface UnderGlowProps {
  className?: string;
}

export function UnderGlow({ className }: UnderGlowProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute -inset-4 -z-10 rounded-[2.25rem] blur-3xl opacity-30",
        "bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 dark:from-purple-500/50 dark:via-pink-500/50 dark:to-blue-500/50",
        className
      )}
      aria-hidden="true"
    />
  );
}

interface PillProps {
  children: React.ReactNode;
  className?: string;
}

export function Pill({ children, className }: PillProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 backdrop-blur-2xl shadow-lg",
        className
      )}
    >
      <span className="h-2 w-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
      {children}
    </div>
  );
}

interface RainbowButtonProps extends ButtonProps {
  children: React.ReactNode;
}

export function RainbowButton({ className, children, ...props }: RainbowButtonProps) {
  return (
    <Button
      className={cn(
        "group relative h-11 overflow-hidden rounded-full px-6 font-semibold text-white",
        "shadow-lg transition-shadow",
        className
      )}
      {...props}
    >
      <span className="absolute inset-0 bg-[linear-gradient(90deg,#7c3aed,#ec4899,#fb923c,#facc15,#22c55e,#3b82f6,#7c3aed)] bg-[length:220%_100%] animate-[rainbow_7s_linear_infinite]" />
      <span className="absolute -inset-y-8 -left-1/3 w-1/3 rotate-12 bg-white/25 blur-md opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:translate-x-[220%]" />
      <span className="relative flex items-center justify-center">{children}</span>
    </Button>
  );
}

interface SecondaryGlassButtonProps extends ButtonProps {
  children: React.ReactNode;
}

export function SecondaryGlassButton({ className, children, ...props }: SecondaryGlassButtonProps) {
  return (
    <Button
      variant="outline"
      className={cn(
        "h-11 rounded-full px-5",
        "border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 backdrop-blur-2xl",
        "text-slate-800 dark:text-slate-200",
        "shadow-lg",
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
}

interface GlassInputProps extends ComponentPropsWithoutRef<typeof Input> {
  className?: string;
}

export function GlassInput({ className, ...props }: GlassInputProps) {
  return (
    <Input
      className={cn(
        "h-11 rounded-2xl",
        "border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 backdrop-blur-2xl",
        "placeholder:text-slate-500 dark:placeholder:text-slate-400",
        "text-slate-800 dark:text-slate-100",
        "shadow-lg focus-visible:ring-0",
        className
      )}
      {...props}
    />
  );
}

interface GlassSelectTriggerProps extends ComponentPropsWithoutRef<typeof SelectTrigger> {
  className?: string;
}

export function GlassSelectTrigger({ className, children, ...props }: GlassSelectTriggerProps) {
  return (
    <SelectTrigger
      className={cn(
        "h-11 rounded-2xl",
        "border-2 border-white/60 dark:border-white/20 bg-white/55 dark:bg-slate-800/55 backdrop-blur-2xl",
        "text-slate-800 dark:text-slate-100",
        "shadow-lg focus:ring-0",
        className
      )}
      {...props}
    >
      {children}
    </SelectTrigger>
  );
}

interface GlassTabsListProps extends ComponentPropsWithoutRef<typeof TabsList> {
  className?: string;
}

export function GlassTabsList({ className, children, ...props }: GlassTabsListProps) {
  return (
    <TabsList
      className={cn(
        "rounded-3xl border-2 border-white/60 dark:border-white/20 bg-gradient-to-br from-white/55 to-white/30 dark:from-slate-800/55 dark:to-slate-900/30",
        "backdrop-blur-2xl shadow-lg p-2",
        className
      )}
      {...props}
    >
      {children}
    </TabsList>
  );
}

interface GlassTabsTriggerProps extends ComponentPropsWithoutRef<typeof TabsTrigger> {
  className?: string;
}

export function GlassTabsTrigger({ className, children, ...props }: GlassTabsTriggerProps) {
  return (
    <TabsTrigger
      className={cn(
        "h-10 rounded-2xl px-4 transition",
        "text-slate-600 dark:text-slate-300 data-[state=active]:bg-white/70 dark:data-[state=active]:bg-slate-700/70 data-[state=active]:shadow-sm data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100",
        className
      )}
      {...props}
    >
      {children}
    </TabsTrigger>
  );
}

interface MetricTileProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  className?: string;
}

export function MetricTile({ icon: Icon, label, value, className }: MetricTileProps) {
  return (
    <div className={cn("relative", className)}>
      <UnderGlow className="opacity-30 blur-2xl" />
      <GlassSurface className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-white/60 dark:bg-slate-700/60 border-2 border-white/60 dark:border-white/20 backdrop-blur-2xl flex items-center justify-center">
            <Icon className="h-5 w-5 text-slate-700 dark:text-slate-200" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          </div>
        </div>
      </GlassSurface>
    </div>
  );
}

export const GlassMetric = MetricTile;

export const LiquidGlassStyles = () => (
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
    @keyframes rainbow {
      0% { background-position: 0% 50%; }
      100% { background-position: 220% 50%; }
    }
    @keyframes gridDrift {
      from { transform: translateY(0px); }
      to { transform: translateY(56px); }
    }
  `}</style>
);
