import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getMemberships } from "@/lib/org/active"
import { sql } from "@/lib/db"
import { EntitiesTable } from "@/components/data/entities-table"

export const dynamic = "force-dynamic"
export const metadata = { title: "Entities — Anker" }

export default async function EntitiesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { isAdmin } = await isAdminUser()
  const asOf = new Date().toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })

  // Firm-level view for admins/owners = all funds & SPVs; everyone else sees
  // only their own workspaces (firewall-safe).
  let mode: "funds" | "workspaces" = "workspaces"
  let rows: any[] = []
  if (isAdmin) {
    mode = "funds"
    try {
      rows = await sql`
        SELECT id, name, vintage_year, target_size, currency, status,
               management_fee_pct, carry_pct, term_years, description
        FROM funds ORDER BY target_size DESC NULLS LAST
      `
    } catch {
      rows = []
    }
  } else {
    rows = await getMemberships(user.id)
  }

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#e5380f]" />
          {mode === "funds" ? "Funds & SPVs" : "Your workspaces"}
        </div>
        <h1 className="text-3xl lg:text-4xl font-serif tracking-tight leading-[1.05]">Entities</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "funds"
            ? "All funds and SPVs across the firm — filter, sort, choose columns, and export."
            : "Workspaces you belong to. Switch the active one from the top bar."}
        </p>
      </div>
      <EntitiesTable mode={mode} rows={rows} asOf={asOf} />
    </div>
  )
}
