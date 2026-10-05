/** /dashboard/actions — what the assistant proposed, for a person to approve, reject or undo (docs/architecture/43). */
import { ActionsInbox } from "@/components/actions/actions-inbox"

export const dynamic = "force-dynamic"
export const metadata = { title: "Actions — Anker" }

export default function ActionsPage() {
  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl">Actions</h1>
      <p className="mt-2 mb-6 max-w-2xl text-sm text-muted-foreground">When the assistant wants to change your records, it proposes the change here first. Nothing is applied until you approve it, and anything applied can be undone.</p>
      <ActionsInbox />
    </div>
  )
}
