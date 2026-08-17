"use client"

import { useState } from "react"
import { Loader2, ExternalLink, Check, CreditCard } from "lucide-react"
import type { BillingState } from "@/lib/billing/billing"

type Plan = { id: string; label: string; blurb: string; credits: number }

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  trialing: { label: "Trialing", cls: "bg-[#2f45e0]/10 text-[#2f45e0]" },
  past_due: { label: "Past due", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  canceled: { label: "Canceled", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  unpaid: { label: "Unpaid", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
}
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")

export function BillingClient({ configured, state, plans }: { configured: boolean; state: BillingState; plans: Plan[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function checkout(plan: string) {
    setBusy(plan); setErr(null)
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) })
      const d = await res.json()
      if (!res.ok || !d.url) { setErr(d.error ?? "Could not start checkout"); return }
      window.location.href = d.url
    } catch { setErr("Network error") } finally { setBusy(null) }
  }
  async function portal() {
    setBusy("portal"); setErr(null)
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" })
      const d = await res.json()
      if (!res.ok || !d.url) { setErr(d.error ?? "Could not open portal"); return }
      window.location.href = d.url
    } catch { setErr("Network error") } finally { setBusy(null) }
  }

  const sub = state.subscription
  const st = sub?.status ? STATUS_LABEL[sub.status] ?? { label: sub.status, cls: "bg-foreground/[0.06] text-muted-foreground" } : null
  const currentPlan = sub?.plan ?? null

  if (!configured) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-6 text-sm">
        <p className="font-medium text-foreground mb-2 flex items-center gap-2"><CreditCard className="w-4 h-4" /> Stripe not connected yet</p>
        <p className="text-muted-foreground mb-3">
          The billing code is live but no Stripe keys are set. To turn it on, add these to your environment
          (Vercel → Project → Settings → Environment Variables, or the Vercel Stripe integration):
        </p>
        <pre className="text-[11px] font-mono bg-foreground/[0.04] rounded-lg p-3 overflow-x-auto">{`STRIPE_SECRET_KEY=sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_STARTER=price_…
STRIPE_PRICE_PRO=price_…
STRIPE_PRICE_SCALE=price_…`}</pre>
        <p className="text-muted-foreground mt-3">Point the Stripe webhook at <span className="font-mono text-foreground">/api/billing/webhook</span> for the subscription + invoice.paid events.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {err && <div className="text-sm rounded-md border border-rose-500/30 bg-rose-500/[0.06] text-rose-600 dark:text-rose-400 px-3 py-2">{err}</div>}

      {/* Current subscription */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-foreground/10 border border-foreground/10 rounded-lg overflow-hidden">
        <Tile label="Plan" value={currentPlan ? (plans.find((p) => p.id === currentPlan)?.label ?? currentPlan) : "None"} />
        <Tile label="Status" value={st?.label ?? "No subscription"} badgeCls={st?.cls} />
        <Tile label="Renews" value={sub?.cancelAtPeriodEnd ? `Ends ${fmtDate(sub.currentPeriodEnd)}` : fmtDate(sub?.currentPeriodEnd ?? null)} />
        <Tile label="AI credits" value={state.creditBalance.toLocaleString()} />
      </div>

      {sub && (
        <button onClick={portal} disabled={busy === "portal"} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50">
          {busy === "portal" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />} Manage subscription
        </button>
      )}

      {/* Plans */}
      <div>
        <div className="flex items-center gap-2.5 mb-3 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2 h-2 bg-[#2f45e0]" aria-hidden /> {sub ? "Change plan" : "Choose a plan"}
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {plans.map((p) => {
            const isCurrent = currentPlan === p.id
            return (
              <div key={p.id} className={`rounded-xl border p-5 ${isCurrent ? "border-[#2f45e0]/50 bg-[#2f45e0]/[0.03]" : "border-foreground/10"}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-xl tracking-tight">{p.label}</h3>
                  {isCurrent && <span className="text-[10px] font-mono uppercase tracking-wider text-[#2f45e0] flex items-center gap-1"><Check className="w-3 h-3" /> Current</span>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
                <p className="mt-3 text-xs font-mono text-muted-foreground">{p.credits.toLocaleString()} AI credits / mo</p>
                <button
                  onClick={() => checkout(p.id)}
                  disabled={busy === p.id || isCurrent}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40"
                >
                  {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {isCurrent ? "Current plan" : sub ? "Switch" : "Subscribe"}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value, badgeCls }: { label: string; value: string; badgeCls?: string }) {
  return (
    <div className="bg-background p-3.5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      {badgeCls
        ? <div className="mt-1"><span className={`text-[11px] font-medium px-2 py-0.5 rounded ${badgeCls}`}>{value}</span></div>
        : <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>}
    </div>
  )
}
