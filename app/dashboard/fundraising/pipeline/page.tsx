import { redirect, notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { resolveActiveMembership } from "@/lib/org/active"
import { sql } from "@/lib/db"
import { listRaiseRounds } from "@/lib/fundraising/rounds"
import { RaisePipelineClient, type RaiseEntry } from "@/components/fundraising/raise-pipeline-client"
import { RoundControls } from "@/components/fundraising/round-controls"

export const dynamic = "force-dynamic"
export const metadata = { title: "Fundraising — Anker" }

export default async function RaisePipelinePage({ searchParams }: { searchParams: Promise<{ round?: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) redirect("/auth/login")
  const { active } = await resolveActiveMembership(user.id)
  if (!active) redirect("/onboarding")
  if (active.persona !== "founder") redirect(active.persona === "lp" ? "/lp" : "/dashboard")
  const params = await searchParams
  const rounds = await listRaiseRounds(user.id, active.orgId)
  const round = params.round ? rounds.find(r => r.id === params.round) : rounds[0]
  if (params.round && !round) notFound()
  const boards = await sql`SELECT b.id, b.name FROM crm_boards b WHERE b.user_id = ${user.id} AND b.archived = false
    AND NOT EXISTS (SELECT 1 FROM fundraising_rounds r WHERE r.user_id = ${user.id} AND r.board_id = b.id) ORDER BY b.name`
  const rows = round ? await sql`SELECT id, display_name, display_type, display_tier, stage, check_size, last_contacted_at
    FROM crm_entries WHERE user_id = ${user.id} AND board_id = ${round.boardId} ORDER BY display_name ASC` : []
  const entries: RaiseEntry[] = rows.map((r: any) => ({
    id: r.id, name: r.display_name, type: r.display_type ?? null, tier: r.display_tier ?? null,
    stage: r.stage ?? "queued", checkSize: r.check_size == null ? null : Number(r.check_size),
    lastContactedAt: r.last_contacted_at ? String(r.last_contacted_at) : null,
  }))
  return <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-7xl">
    {!round && <h1 className="text-3xl mb-6">Fundraising</h1>}
    <RoundControls rounds={rounds} selected={round} boards={boards as { id: string; name: string }[]} workspace={active.name} canEdit={active.orgRole !== "viewer"} />
    {round && <RaisePipelineClient key={round.id} entries={entries} round={round} canEdit={active.orgRole !== "viewer"} />}
  </div>
}
