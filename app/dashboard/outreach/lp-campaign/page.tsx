/**
 * /dashboard/outreach/lp-campaign
 *
 * LP Outreach Campaign Studio — full 4-step pipeline:
 *   1. Upload  — paste CSV or upload XLSX (Curated Profiles sheet)
 *   2. Enrich  — AI enriches each LP with firm intel, mandate, hook
 *   3. Review  — interactive card view with filters, copy buttons
 *   4. Export  — download .xlsx workbook + .html review UI
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { LpCampaignContent } from "@/components/tesseract/lp-campaign-content"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "LP Campaign — Anker",
  description: "AI-powered LP outreach: enrich, draft, export.",
}

export default async function LpCampaignPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  return <LpCampaignContent user={user} />
}
