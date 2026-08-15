import { verifySpvPortalToken, getSpvPortalData } from "@/lib/modules/spv-portal"
import { AnkerLogo } from "@/components/brand/anker-logo"

export const dynamic = "force-dynamic"
export const metadata = { title: "Your SPV position — Anker", robots: { index: false, follow: false } }

const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v).toLocaleString()}`)
const fmtD = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")
const STAGE: Record<string, string> = { forming: "Forming", open: "Open", closed: "Closed", wound_down: "Wound down" }
const SUBSTATUS: Record<string, string> = { invited: "Invited", committed: "Committed", signed: "Signed", funded: "Funded", declined: "Declined" }

export default async function SpvPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ref = await verifySpvPortalToken(token)
  const data = ref ? await getSpvPortalData(ref) : null

  if (!data) {
    return (
      <Shell>
        <div className="rounded-xl border border-foreground/10 p-8 text-center">
          <h1 className="font-display text-xl tracking-tight">This link isn’t valid</h1>
          <p className="mt-2 text-sm text-muted-foreground">It may have expired or been revoked. Ask the SPV lead for a fresh link.</p>
        </div>
      </Shell>
    )
  }

  const { spv, investor } = data
  const pct = spv.target > 0 ? Math.min(100, (spv.committed / spv.target) * 100) : 0

  return (
    <Shell>
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#2f45e0]" /> SPV investor portal
        </div>
        <h1 className="font-display text-3xl tracking-tight">{spv.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {spv.dealName ? `${spv.dealName} · ` : ""}Stage: {STAGE[spv.stage] ?? spv.stage} · Close {fmtD(spv.closeDate)}
        </p>
      </div>

      {/* Your position */}
      <section className="rounded-xl border border-foreground/10 p-6 mb-6">
        <h2 className="font-display text-lg tracking-tight mb-4">Your position</h2>
        <div className="grid sm:grid-cols-3 gap-5">
          <Stat label="Investor" value={investor.name} />
          <Stat label="Your commitment" value={money(investor.amount)} />
          <Stat label="Status" value={SUBSTATUS[investor.status] ?? investor.status} />
          <Stat label="Ownership" value={investor.ownershipPct != null ? `${(investor.ownershipPct * 100).toFixed(2)}%` : "—"} hint={investor.ownershipPct == null ? "Set once your subscription is committed" : "of committed capital"} />
          <Stat label="Subscribed" value={fmtD(investor.subscribedAt)} />
        </div>
      </section>

      {/* SPV summary */}
      <section className="rounded-xl border border-foreground/10 p-6">
        <h2 className="font-display text-lg tracking-tight mb-4">Vehicle</h2>
        <div className="grid sm:grid-cols-3 gap-5 mb-5">
          <Stat label="Target" value={money(spv.target)} />
          <Stat label="Committed" value={money(spv.committed)} />
          <Stat label="% subscribed" value={spv.target > 0 ? `${pct.toFixed(0)}%` : "—"} />
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
          <div className="h-full" style={{ width: `${pct}%`, background: "#2f45e0" }} />
        </div>
      </section>

      <p className="mt-6 text-xs text-muted-foreground">
        This is a private, view-only summary of your position. Figures are indicative and not a capital account statement.
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-foreground/10">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <AnkerLogo className="h-7 w-auto" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Investor portal</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">{children}</main>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-display tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  )
}
