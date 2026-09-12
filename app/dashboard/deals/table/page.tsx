import { redirect } from "next/navigation"
import { requireWorkspace } from "@/lib/auth/workspace-context"

export default async function LegacyDealsPage() {
  const scope = await requireWorkspace()
  redirect(scope.persona === "founder" ? "/dashboard/fundraising/pipeline" : scope.persona === "vc" ? "/dashboard/portfolio" : "/lp")
}
