"use client";

import useSWR from "swr";
import { Loader2, PhoneCall, Send, Clock } from "lucide-react";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

interface ReadyItem {
  crmEntryId: string;
  name: string;
  firm: string | null;
  title: string | null;
  stage: string | null;
  state: "awaiting_approval" | "sent_awaiting_reply";
  replyId?: string;
  draftId?: string;
  preview: string | null;
  signalAt: string | null;
}

const ago = (iso: string | null) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "1d ago" : d < 30 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
};

/**
 * The founder's "take the call" signal. Investors who signaled interest and
 * either need a scheduling email sent (awaiting_approval) or have one out and
 * are expected to book (sent_awaiting_reply). Rendered above the powerhouse on
 * /dashboard/outreach. Hidden entirely when the queue is empty.
 */
export function ReadyForCall() {
  const { data, isLoading } = useSWR<{ items: ReadyItem[]; counts: { awaiting_approval: number; sent_awaiting_reply: number } }>(
    "/api/outreach/ready-for-call",
    fetcher,
  );
  const items = data?.items ?? [];
  if (isLoading) {
    return (
      <div className="mx-6 mt-6 flex items-center gap-2 rounded-2xl border border-foreground/10 bg-card/40 px-5 py-4 text-sm text-muted-foreground lg:mx-10">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking who&apos;s ready for a call…
      </div>
    );
  }
  if (!items.length) return null;

  const c = data!.counts;

  return (
    <div className="mx-6 mt-6 rounded-2xl border border-[#e5380f]/25 bg-[#e5380f]/[0.04] p-5 lg:mx-10">
      <header className="mb-4 flex items-center gap-2">
        <PhoneCall className="h-4 w-4 text-[#e5380f]" />
        <h2 className="font-serif text-lg tracking-tight">Ready for a call</h2>
        <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {c.awaiting_approval} to send · {c.sent_awaiting_reply} awaiting a time
        </span>
      </header>

      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.crmEntryId} className="flex items-start gap-3 rounded-xl border border-foreground/10 bg-background/60 p-3.5">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#e5380f]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{i.name}</span>
                {i.firm && <span className="truncate text-xs text-muted-foreground">· {i.firm}</span>}
                <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{ago(i.signalAt)}</span>
              </div>
              {i.preview && <p className="mt-1 truncate text-xs text-muted-foreground">{i.preview}</p>}
              <div className="mt-2">
                {i.state === "awaiting_approval" ? (
                  <a
                    href="/dashboard/outreach#inbox"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#e5380f] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                  >
                    <Send className="h-3 w-3" /> Review &amp; send scheduling email
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-foreground/[0.06] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    <Clock className="h-3 w-3" /> Scheduling email sent — awaiting a time
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
