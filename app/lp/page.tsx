import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import {
  getLpMembershipsForEmail, listDocumentsForLp,
} from "@/lib/portfolio/data-room"
import { LpDashboardClient } from "@/components/lp/lp-dashboard-client"

export const dynamic = "force-dynamic"

/**
 * /lp — Landing page for the LP portal.
 *
 * Renders:
 *   - Summary card per fund the user is an LP on (commitment / called /
 *     distributed / uncalled / DPI-like ratio)
 *   - Documents list (filter by category) scoped to docs the LP can see
 *
 * Both pieces are read-only.  When LPs need to act (submit a sub doc back,
 * acknowledge a capital call), that's a separate flow we'll add later.
 */
export default async function LpHome() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login?redirect=/lp")

  const memberships = await getLpMembershipsForEmail(user.email ?? "")
  // Layout already shows the "no LP access" stub when memberships is empty,
  // so by the time we get here we know there's at least one.
  const documents = await listDocumentsForLp(memberships, { limit: 200 })

  return (
    <LpDashboardClient
      memberships={memberships}
      initialDocuments={documents}
    />
  )
}
