"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowUpRight, ArrowRight, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "@/components/shell/workspace-home.module.css";
import { formatMoney } from "@/lib/platform/money";

interface RecentDeal {
  id: string;
  name: string;
  stage: string;
  amount: number | null;
  firmName: string | null;
  updatedAt: string | null;
}
interface DashboardStats {
  persona?: "founder" | "vc" | "lp" | null;
  workspaceName?: string | null;
  roundName?: string | null;
  target?: number | null;
  totalFirms: number;
  totalDeals: number;
  totalContacts: number;
  totalInvestors: number;
  activeDeals: number;
  closedDeals: number;
  pipelineValue: number;
  closedValue: number;
  recentDeals: RecentDeal[];
  pipelineHref?: string;
  pipelineAvailable?: boolean;
  currency?: string | null;
  scope?: string;
}

function amount(value: number, currency?: string | null): string {
  return formatMoney(value, currency);
}
function stage(value: string): string {
  if (value === "closed_won" || value === "won") return "Won";
  if (value === "closed_lost" || value === "lost") return "Lost";
  return value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}
function updated(value: string | null): string {
  if (!value || Number.isNaN(Date.parse(value))) return "Date unavailable";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function DashboardContent({
  user,
  stats,
  children,
}: {
  user: User;
  stats: DashboardStats;
  children?: ReactNode;
}) {
  const name = user.user_metadata?.first_name || user.email?.split("@")[0];
  const pipelineHref = stats.pipelineHref ?? "/dashboard/fundraising/pipeline";
  const founder = stats.persona === "founder";
  const fund = stats.persona === "vc";
  const metrics = [
    {
      label: founder ? "Active investor conversations" : "Active deals",
      value: stats.activeDeals.toLocaleString(),
      detail: "Open pipeline",
      href: pipelineHref,
    },
    {
      label: "Estimated pipeline",
      value: amount(stats.pipelineValue, stats.currency),
      detail: stats.currency ? `Recorded amounts · ${stats.currency}` : "Recorded amounts · currency unspecified",
      href: pipelineHref,
    },
    {
      label: founder ? "Investor commitments" : "Closed deals",
      value: stats.closedDeals.toLocaleString(),
      detail: `${amount(stats.closedValue, stats.currency)} recorded value`,
      href: pipelineHref,
    },
    {
      label: "Contacts",
      value: stats.totalContacts.toLocaleString(),
      detail: "Relationship records",
      href: "/dashboard/crm",
    },
  ].filter((m) => stats.pipelineAvailable !== false || m.label === "Contacts");
  return (
    <div className={styles.home}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{stats.workspaceName || "ANKER WORKSPACE"} / {founder ? "FOUNDER OVERVIEW" : fund ? "FUND OVERVIEW" : "OVERVIEW"}</p>
          <h1>{founder ? "Move your raise forward." : fund ? "Your fund, in focus." : "Your next move, in focus."}</h1>
          <p className={styles.intro}>
            {name ? `Welcome back, ${name}.` : "Welcome back."}{" "}
            {founder ? "Review investor conversations, follow-ups and the next steps toward your round." : fund ? "Review investment decisions, portfolio work and investor responsibilities." : "Choose a workspace to focus your work."}
          </p>
        </div>
        <Button asChild className="min-h-11">
          <Link href={stats.pipelineAvailable === false ? founder ? "/dashboard/fundraising/pipeline" : "/onboarding" : pipelineHref}>
            {stats.pipelineAvailable === false ? "Complete setup" : founder ? "Open fundraising round" : "Review deal pipeline"} <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </header>

      <section aria-label="Platform overview" className={styles.overview}>
        <div className={styles.metrics}>
          {metrics.map((m) => (
            <Link key={m.label} href={m.href} className={styles.metric}>
              <span className={styles.metricLabel}>
                {m.label}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </span>
              <strong>{m.value}</strong>
              <span className={styles.metricDetail}>{m.detail}</span>
            </Link>
          ))}
        </div>
        <p className={styles.scope}>
          {stats.scope ?? "Your relationship records and pipeline."}
          {founder && stats.target != null && <> Target: {amount(stats.target, stats.currency)}. {stats.target > 0 ? `${Math.round(stats.closedValue / stats.target * 100)}% recorded as committed.` : "Set a target in your round."}</>}
        </p>
      </section>

      <div className={styles.body}>
        {children}
        {stats.pipelineAvailable !== false && <section
          className={styles.activity}
          aria-labelledby="recent-deals-heading"
        >
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>PIPELINE</p>
              <h2 id="recent-deals-heading">{founder ? "Recent investor conversations" : "Recent deals"}</h2>
            </div>
            <Link href={pipelineHref} className={styles.textLink}>
              View pipeline <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {stats.recentDeals.length ? (
            <ul className={styles.deals}>
              {stats.recentDeals.map((deal) => (
                <li key={deal.id}>
                  <div className={styles.dealIdentity}>
                    <span className={styles.dealIcon}>
                      <Briefcase className="h-4 w-4" />
                    </span>
                    <div>
                      <h3><Link href={fund ? `/dashboard/portfolio/fund/deals/${encodeURIComponent(deal.id)}` : pipelineHref}>{deal.name}</Link></h3>
                      {deal.firmName && <p>{deal.firmName}</p>}
                    </div>
                  </div>
                  <span className={styles.stage}>{stage(deal.stage)}</span>
                  <div className={styles.dealValue}>
                    <strong>
                      {deal.amount == null
                        ? "Amount not set"
                        : amount(Number(deal.amount), stats.currency)}
                    </strong>
                    <span>Updated {updated(deal.updatedAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.empty}>
              <Briefcase className="h-6 w-6" />
              <h3>No deals to review yet</h3>
              <p>
                Add your first opportunity to start tracking the conversation.
              </p>
              <Link href={pipelineHref} className={styles.textLink}>
                Open pipeline <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </section>}
      </div>
    </div>
  );
}
