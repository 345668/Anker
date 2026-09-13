import Link from "next/link"
import { redirect } from "next/navigation"
import { requireWorkspace } from "@/lib/auth/workspace-context"
import { sql } from "@/lib/db"

export const dynamic = "force-dynamic"
export default async function AnalyticsPage() {
  const scope = await requireWorkspace()
  if (scope.persona !== "founder") redirect(scope.persona === "vc" ? "/dashboard/portfolio" : "/lp")
  const rows = await sql`SELECT r.id, r.name, r.currency, r.target, count(e.id)::int AS investors,
      count(e.id) FILTER (WHERE e.stage = 'committed')::int AS committed,
      coalesce(sum(e.check_size) FILTER (WHERE e.stage = 'committed'), 0) AS committed_amount
    FROM fundraising_rounds r LEFT JOIN crm_entries e ON e.board_id = r.board_id AND e.user_id = r.user_id
    WHERE r.user_id = ${scope.userId} AND r.org_id = ${scope.orgId}
    GROUP BY r.id ORDER BY r.created_at DESC`
  return <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
    <header><p className="text-sm text-muted-foreground">{scope.name} / Analytics</p><h1 className="mt-3 font-serif text-4xl">Fundraising progress</h1>
      <p className="mt-3 text-muted-foreground">Your rounds in this workspace. Amounts remain in each round’s currency.</p></header>
    {!rows.length ? <p>No rounds yet. <Link className="underline" href="/dashboard/fundraising/pipeline">Create a fundraising round</Link> to track progress.</p> :
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Fundraising round totals</caption>
      <thead><tr>{["Round", "Investors", "Committed investors", "Committed", "Target"].map(h => <th key={h} className="border-b p-3">{h}</th>)}</tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td className="border-b p-3">{r.name}</td><td className="border-b p-3">{r.investors}</td><td className="border-b p-3">{r.committed}</td>
        <td className="border-b p-3">{r.currency} {Number(r.committed_amount).toLocaleString()}</td><td className="border-b p-3">{r.currency} {Number(r.target).toLocaleString()}</td></tr>)}</tbody></table></div>}
    <Link href="/dashboard/fundraising/pipeline" className="inline-block underline">Open fundraising pipeline</Link>
  </main>
}
