import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { RaisePipelineClient, type RaiseEntry } from "@/components/fundraising/raise-pipeline-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Raise pipeline — Anker" }

export default async function RaisePipelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const rows = await sql`
    SELECT id, display_name, display_type, display_tier, stage, check_size, last_contacted_at
    FROM crm_entries
    WHERE user_id = ${user.id}
    ORDER BY display_name ASC
  `
  const entries: RaiseEntry[] = rows.map((r: any) => ({
    id: r.id,
    name: r.display_name,
    type: r.display_type ?? null,
    tier: r.display_tier ?? null,
    stage: r.stage ?? "queued",
    checkSize: r.check_size != null ? Number(r.check_size) : null,
    lastContactedAt: r.last_contacted_at ? String(r.last_contacted_at) : null,
  }))

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <RaisePipelineClient entries={entries} />
    </div>
  )
}
