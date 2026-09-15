import { isAiAvailable } from "@/lib/matching/v2/ai-enrichment"
import { FindInvestorsContent } from "@/components/tesseract/find-investors-content"
import { requirePersona } from "@/lib/auth/persona-guard"
import { redirect } from "next/navigation"
import { requireWorkspace, WorkspaceError } from "@/lib/auth/workspace-context"
import { getUserWorkspace } from "@/lib/org/workspaces"
import { companyMatchingDefaults } from "@/lib/org/company-profile"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Find Investors — Anker",
  description: "Upload your pitch deck, review the extracted round profile, then match against relevant investors.",
}

export default async function FindInvestorsPage() {
  await requirePersona(["founder"])
  const scope = await requireWorkspace().catch(error => {
    if (error instanceof WorkspaceError) redirect(error.status === 401 ? "/auth/login" : "/onboarding")
    throw error
  })
  if (scope.persona !== "founder") redirect("/dashboard/entities")
  const workspace = await getUserWorkspace(scope.userId, scope.orgId)
  return <FindInvestorsContent key={scope.orgId} aiAvailable={await isAiAvailable()} companyDefaults={workspace && workspace.persona === "founder" ? companyMatchingDefaults(workspace) : undefined} />
}
