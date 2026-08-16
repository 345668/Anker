import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { getLoan, getLoanServicing, listPayments, listCovenants } from "@/lib/modules/loan-servicing"
import { LoanDetailClient } from "@/components/modules/loan-detail-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Loan — Anker" }

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePersona(["vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { id } = await params
  const loan = await getLoan(user.id, id)
  if (!loan) redirect("/dashboard/loan-operations")

  const [servicing, payments, covenants] = await Promise.all([
    getLoanServicing(loan), listPayments(id), listCovenants(id),
  ])

  return <LoanDetailClient initialLoan={loan} initialServicing={servicing} initialPayments={payments} initialCovenants={covenants} />
}
