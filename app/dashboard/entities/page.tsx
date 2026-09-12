import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { resolveActiveMembership } from "@/lib/org/active"
import { listUserWorkspaces } from "@/lib/org/workspaces"
import { sql } from "@/lib/db"
import { EntitiesTable } from "@/components/data/entities-table"
import { WorkspaceSetupStatus } from "@/components/workspaces/setup-status"
import { WorkspaceManager } from "@/components/data/workspace-manager"

export const dynamic = "force-dynamic"
export const metadata = { title: "Workspaces — Anker" }

export default async function EntitiesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { isAdmin } = await isAdminUser()
  const asOf = new Date().toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })

  // Firm-level view for admins/owners = all funds & SPVs; everyone else sees
  // only their own workspaces (firewall-safe).
  let rows: any[] = []
  const [resolved, workspaces] = await Promise.all([resolveActiveMembership(user.id), listUserWorkspaces(user.id)])
  const activeOrgId = resolved.active?.orgId ?? null
  let fundsUnavailable = false
  if (isAdmin) {
    try {
      rows = await sql`
        SELECT id, name, vintage_year, target_size, currency, status,
               management_fee_pct, carry_pct, term_years, description
        FROM funds ORDER BY target_size DESC NULLS LAST
      `
    } catch {
      fundsUnavailable = true
    }
  }

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#e5380f]" />
          Your workspaces
        </div>
        <h1 className="text-3xl lg:text-4xl font-serif tracking-tight leading-[1.05]">Workspaces</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A dedicated home for each company and fund. Your role determines what you can manage. Personal contacts and investor updates currently stay with your account.
        </p>
      </div>
      <WorkspaceSetupStatus workspace={workspaces.find(workspace => workspace.orgId === activeOrgId) ?? null} />
      <WorkspaceManager initialWorkspaces={workspaces} activeOrgId={activeOrgId} />
      <aside className="mt-6 border border-border bg-card p-5">
        <h2 className="font-serif text-xl">Your LP investments</h2>
        <p className="mt-2 text-sm text-muted-foreground">Access to a fund’s reports, documents, and capital calls is granted by its manager.</p>
        <a href="/lp" className="mt-2 inline-flex min-h-11 items-center text-sm underline">Open LP portal</a>
      </aside>
      {isAdmin && <section className="mt-10" aria-label="Firm administration">
        <h2 className="mb-4 font-serif text-2xl">Funds &amp; SPVs · Administration</h2>
        {fundsUnavailable ? <p role="alert">Fund records are temporarily unavailable. Reload to try again.</p> : <EntitiesTable mode="funds" rows={rows} asOf={asOf} />}
      </section>}
    </div>
  )
}
