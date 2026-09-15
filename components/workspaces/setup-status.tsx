import Link from "next/link"
import type { WorkspaceRecord } from "@/lib/org/workspaces"
import { missingCompanyDetails } from "@/lib/org/company-profile"

export function WorkspaceSetupStatus({ workspace }: { workspace: WorkspaceRecord | null }) {
  if (workspace && workspace.persona !== "founder") return null
  const missing = workspace ? missingCompanyDetails(workspace) : []
  return <section aria-label="Company workspace setup" className="mb-6 border border-border bg-card p-5 text-foreground sm:p-6">
    <p className="text-xs uppercase tracking-widest text-muted-foreground">Company workspace</p>
    <h2 className="mt-2 font-serif text-2xl">{workspace ? workspace.name : "Set up your company workspace"}</h2>
    <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{!workspace
      ? "Create a company context for your fundraising rounds, decks and planning. You can add another company or a fund later."
      : missing.length ? `Your workspace exists. Recommended company details still to add: ${missing.join(", ")}.`
      : "Your core company details are saved. Review the separate round and matching inputs before running a fundraising workflow."}</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <Link className="inline-flex min-h-11 items-center rounded border border-border px-4 text-sm underline underline-offset-4" href={workspace ? "/dashboard/entities" : "/onboarding"}>{workspace ? "Review company profile" : "Start or resume setup"}</Link>
      {workspace && <Link className="inline-flex min-h-11 items-center px-2 text-sm underline underline-offset-4" href="/dashboard/find-investors">Prepare investor matching</Link>}
    </div>
  </section>
}
