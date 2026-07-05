/**
 * /dashboard/portfolio/fund/deals/[dealId] — the deal workroom.
 *
 * Scorecard · IC votes · term grid · AI memo · close action.
 */
import { redirect, notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { getFundBySlug } from "@/lib/portfolio/funds"
import {
  getDealById, getEvaluation, listVotes, tallyVotes, listTermGrids,
} from "@/lib/portfolio/deal-pipeline"
import { listFounders } from "@/lib/portfolio/deal-founders"
import { listDocuments } from "@/lib/portfolio/deal-documents"
import { evaluateGate } from "@/lib/portfolio/deal-stage-gates"
import { DealDetailClient } from "@/components/portfolio/deal-detail-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Deal — Anker" }

interface Props { params: Promise<{ dealId: string }> }

export default async function DealDetailPage({ params }: Props) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  const fund = await getFundBySlug("svs-fund-ii")
  if (!fund) redirect("/dashboard/portfolio/fund")

  const { dealId } = await params
  const deal = await getDealById(dealId)
  if (!deal || deal.fund_id !== fund.id) notFound()

  const [evaluation, votes, tally, terms, founders, documents] = await Promise.all([
    getEvaluation(dealId), listVotes(dealId), tallyVotes(dealId), listTermGrids(dealId),
    listFounders(dealId), listDocuments(dealId),
  ])
  const gate = evaluateGate(deal.stage, { deal, evaluation, tally, terms, founders, documents })

  return (
    <DealDetailClient
      fund={fund}
      initialDeal={deal}
      initialEvaluation={evaluation}
      initialVotes={votes}
      initialTally={tally}
      initialTerms={terms}
      initialFounders={founders}
      initialDocuments={documents}
      initialGate={gate}
    />
  )
}
