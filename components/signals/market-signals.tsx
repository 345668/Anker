"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2, Radar, MapPin } from "lucide-react";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

interface Signal {
  id: string; investor_name: string | null; title: string; detail: string | null;
  sector: string | null; stage: string | null; location: string | null;
  signal_type: string | null; signal_at: string;
}

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "1d ago" : d < 30 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
};

export function MarketSignals() {
  const [sector, setSector] = useState<string | null>(null);
  const key = `/api/signals${sector ? `?sector=${encodeURIComponent(sector)}` : ""}`;
  const { data, isLoading } = useSWR<{ signals: Signal[]; sectors: string[]; sector: string | null }>(key, fetcher);
  const sectors = data?.sectors ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <span className="mb-2 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          <span className="h-px w-8 bg-[#e5380f]" /> Market Signals
        </span>
        <h1 className="font-serif text-3xl tracking-tight">Who&apos;s active in your space</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Investors deploying in your sector, ranked by activity. Time your outreach to who&apos;s moving now.
        </p>
      </header>

      {/* Sector filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Chip active={!sector} onClick={() => setSector(null)}>All</Chip>
        {sectors.slice(0, 14).map((s) => (
          <Chip key={s} active={sector === s} onClick={() => setSector(s)}>{s}</Chip>
        ))}
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      {!isLoading && !data?.signals?.length && (
        <div className="rounded-2xl border border-dashed border-foreground/15 py-12 text-center text-sm text-muted-foreground">
          <Radar className="mx-auto mb-2 h-5 w-5" /> No signals yet for this filter.
        </div>
      )}

      <div className="space-y-2.5">
        {(data?.signals ?? []).map((s) => (
          <div key={s.id} className="flex items-start gap-3 rounded-xl border border-foreground/10 bg-card/40 p-4">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#e5380f]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{s.title}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{ago(s.signal_at)}</span>
              </div>
              {s.detail && <p className="mt-1 truncate text-xs text-muted-foreground">{s.detail}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {s.sector && <Tag>{s.sector}</Tag>}
                {s.stage && <Tag>{s.stage}</Tag>}
                {s.location && <Tag><MapPin className="mr-0.5 inline h-2.5 w-2.5" />{s.location}</Tag>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${active ? "border-[#e5380f] bg-[#e5380f]/10 text-[#e5380f]" : "border-foreground/15 text-muted-foreground hover:border-foreground/30"}`}>
      {children}
    </button>
  );
}
function Tag({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center rounded-md bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{children}</span>;
}
