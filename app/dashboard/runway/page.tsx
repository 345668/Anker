import { requireWorkspace } from "@/lib/auth/workspace-context"
import { RunwayContent } from "@/components/tesseract/runway-content"
import { requirePersona } from "@/lib/auth/persona-guard"

export const metadata = {
  title: "Runway | Anker",
  description: "Plan your burn, model scenarios, and pinpoint when you'll need to raise.",
}

export default async function RunwayPage() {
  await requirePersona(["founder"])
  const scope = await requireWorkspace()
  return <RunwayContent key={scope.orgId} orgId={scope.orgId} />
}
