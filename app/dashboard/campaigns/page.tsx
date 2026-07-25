import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { CampaignsClient } from "@/components/campaign/campaigns-client"

export const dynamic = "force-dynamic"

/**
 * /dashboard/campaigns — founder campaign engine control room.
 *
 * Every public founder submission and its auto-generated investor outreach
 * campaign: assessment result, progressive-send progress bar, funnel analytics,
 * and the per-campaign exclusive investor CRM. Admin-only.
 */
export default async function CampaignsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  return <CampaignsClient />
}
