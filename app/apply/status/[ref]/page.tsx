"use client";

/** PUBLIC status page for a submission — reads /api/public/status/[ref]. */

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";

interface StatusResp {
  publicRef: string;
  startupName: string;
  status: string;
  detail: string;
  submittedAt: string | null;
}

export default function StatusPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = use(params);
  const [data, setData] = useState<StatusResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/public/status/${encodeURIComponent(ref)}`);
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) setError(json?.error || "Not found.");
        else setData(json);
      } catch {
        if (alive) setError("Could not load status.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [ref]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <main className="mx-auto max-w-xl px-5 pb-24 pt-28 sm:pt-32">
        <Link href="/apply" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> New application
        </Link>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <h1 className="text-xl font-semibold">We couldn&apos;t find that reference</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Check the code in your confirmation email, or{" "}
              <Link href="/apply" className="text-primary hover:underline">submit a new application</Link>.
            </p>
          </div>
        ) : data ? (
          <div className="rounded-2xl border border-border bg-card p-8">
            <p className="font-mono text-sm text-muted-foreground">{data.publicRef}</p>
            <h1 className="mt-1 text-2xl font-semibold">{data.startupName}</h1>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3.5 py-1.5 text-sm font-medium text-primary">
              <span className="h-2 w-2 rounded-full bg-primary" /> {data.status}
            </div>
            <p className="mt-4 text-muted-foreground">{data.detail}</p>
            {data.submittedAt && (
              <p className="mt-6 text-xs text-muted-foreground">
                Submitted {new Date(data.submittedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
              </p>
            )}
          </div>
        ) : null}
      </main>
      <FooterSection />
    </div>
  );
}
