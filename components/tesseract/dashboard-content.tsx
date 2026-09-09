"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowUpRight, ArrowRight, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "@/components/shell/workspace-home.module.css";

interface RecentDeal {
  id: string;
  name: string;
  stage: string;
  amount: number | null;
  firmName: string | null;
  updatedAt: string | null;
}
interface DashboardStats {
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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
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
  const metrics = [
    {
      label: "Active deals",
      value: stats.activeDeals.toLocaleString(),
      detail: "Open pipeline",
      href: pipelineHref,
    },
    {
      label: "Pipeline value",
      value: amount(stats.pipelineValue, stats.currency),
      detail: stats.currency ? `Recorded amounts · ${stats.currency}` : "Recorded amounts · currency unspecified",
      href: pipelineHref,
    },
    {
      label: "Deals won",
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
          <p className={styles.eyebrow}>ANKER / WORKSPACE</p>
          <h1>Your next move, in focus.</h1>
          <p className={styles.intro}>
            {name ? `Welcome back, ${name}.` : "Welcome back."} Review your
            pipeline, follow up on relationships, and keep work moving.
          </p>
        </div>
        <Button asChild className="min-h-11">
          <Link href="#workspace-tasks">
            Review tasks <ArrowRight className="h-4 w-4" />
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
              <h2 id="recent-deals-heading">Recent deals</h2>
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
                      <h3>{deal.name}</h3>
                      <p>{deal.firmName || "No firm linked"}</p>
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
