import Link from "next/link"
import { requirePersonaWorkspace } from "@/lib/auth/persona-route"
import { definitionFor } from "@/lib/crm/definitions"
import { listDeals, stageCounts } from "@/lib/crm/deals"
import { DealPipeline } from "@/components/crm/deal-pipeline"

/**
 * /vc/crm — the VC CRM on the entity model.
 * Doc: docs/architecture/25-per-persona-crm.md phase 5, doc 02 for the route.
 *
 * This is the same page as /founder/crm with a different definition: no branch
 * anywhere reads the persona, the words and the pipeline come from `vcCrm`. That
 * reuse is the whole return on the definition layer — an LP page in phase 6 is the
 * same again.
 *
 * Scope boundary (doc 25 §2): this tracks capital coming IN — LPs through a fund
 * close. A VC's inbound startup deal flow lives in fund operations
 * (`portfolio_companies`, the fund `deals` routes) with its own IC votes, memos and
 * documents, and is deliberately not duplicated here. The header links there so the
 * distinction is visible rather than merely documented.
 */
export const dynamic = "force-dynamic"

export const metadata = {
  title: "LPs — Anker",
  description: "Your LP pipeline: institutions, allocators and commitments, with the history behind each one.",
}

export default async function VcCrmPage() {
  const scope = await requirePersonaWorkspace("vc")
  const definition = definitionFor("vc")
  const scopeKey = `org:${scope.orgId}`

  const [deals, funnel] = await Promise.all([
    listDeals(scopeKey),
    stageCounts(scopeKey, "vc"),
  ])

  return (
    <div className="px-6 py-6">
      <header className="mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{definition.person.many}</h1>
          <p className="text-sm text-muted-foreground">
            {scope.name} · {scope.canWrite ? "Members can edit." : "Your access is read only."}
          </p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {deals.length.toLocaleString()} {deals.length === 1 ? definition.deal.one.toLowerCase() : definition.deal.many.toLowerCase()} in the pipeline.
          {" "}Deal flow into the fund lives in{" "}
          <Link className="underline" href="/dashboard/portfolio/fund/deals">Fund operations</Link>.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          <Link className="underline" href="/dashboard/crm">Boards, saved views and bulk actions</Link>
          {" "}are still on the previous page.
        </p>
        {scope.switchedFromActive && (
          <p className="mt-2 rounded border border-foreground/15 bg-foreground/[0.03] px-3 py-2 text-sm">
            Showing your fund workspace <strong>{scope.name}</strong>, which is not the workspace you had active.
          </p>
        )}
      </header>

      <DealPipeline
        definition={definition}
        initialDeals={deals}
        funnel={funnel}
        canWrite={scope.canWrite}
      />
    </div>
  )
}
