import Link from "next/link"
import { requirePersonaWorkspace } from "@/lib/auth/persona-route"
import { definitionFor } from "@/lib/crm/definitions"
import { listDeals, stageCounts } from "@/lib/crm/deals"
import { DealPipeline } from "@/components/crm/deal-pipeline"

/**
 * /founder/crm — the founder CRM on the entity model.
 * Doc: docs/architecture/25-per-persona-crm.md phase 3, doc 02 for the route.
 *
 * Reads crm_deals / crm_people / crm_companies rather than crm_entries, and takes
 * its pipeline, labels and funnel from the founder definition. /dashboard/crm still
 * serves VC from crm_entries until phase 5.
 */
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Investors — Anker",
  description: "Your investor pipeline: firms, contacts and rounds, with the history behind each one.",
}

export default async function FounderCrmPage() {
  const scope = await requirePersonaWorkspace("founder")
  const definition = definitionFor("founder")
  const scopeKey = `org:${scope.orgId}`

  const [deals, funnel] = await Promise.all([
    listDeals(scopeKey),
    stageCounts(scopeKey, "founder"),
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
          {" "}
          <Link className="underline" href="/dashboard/crm">Boards, saved views and bulk actions</Link>
          {" "}are still on the previous page.
        </p>
        {scope.switchedFromActive && (
          <p className="mt-2 rounded border border-foreground/15 bg-foreground/[0.03] px-3 py-2 text-sm">
            Showing your founder workspace <strong>{scope.name}</strong>, which is not the workspace you had active.
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
