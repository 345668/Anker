import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { resolveActiveMembership } from "@/lib/org/active"
export const dynamic = "force-dynamic"
export default async function DeprecatedPipelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { active } = await resolveActiveMembership(user.id)
  if (!active?.persona) redirect("/onboarding")
  redirect(active.persona === "lp" ? "/lp" : active.persona === "vc" ? "/dashboard/portfolio/fund/deals" : "/dashboard/fundraising/pipeline")
}
