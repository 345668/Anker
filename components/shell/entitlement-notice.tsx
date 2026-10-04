import Link from "next/link"
import type { Effective } from "@/lib/entitlements/model"

/** A thin banner for a paused or closing workspace, and for maintenance. Reading and exporting stay available. */
export function EntitlementBanner({ e }: { e: Effective }) {
  const text = e.maintenance ? "Anker is in maintenance for a short while. AI runs and sending are paused."
    : e.state === "paused" ? "This workspace is paused. You can sign in, read and export your data; AI runs, sending, applications and conversion are switched off."
    : e.state === "offboarding" ? "This workspace is being closed. You can sign in and export your data; AI runs and sending are switched off."
    : null
  if (!text) return null
  return <div role="status" className="sticky top-0 z-30 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-900 dark:text-amber-200">{text}</div>
}

/** Shown in place of a module the workspace's plan does not include. */
export function ModuleNotIncluded({ feature }: { feature: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl">Not part of your plan</h1>
      <p className="mt-2 text-sm text-muted-foreground">The {feature.replace("_", " ")} module is not included in this workspace's plan. Contact support to add it.</p>
      <Link href="/dashboard" className="mt-4 inline-block text-sm underline">Back to the overview</Link>
    </div>
  )
}
