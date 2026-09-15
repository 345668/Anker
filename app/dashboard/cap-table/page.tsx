import { requireWorkspace } from "@/lib/auth/workspace-context"
import { CapTableContent } from "@/components/tesseract/cap-table-content"
import { requirePersona } from "@/lib/auth/persona-guard"

export const metadata = {
  title: "Cap Table | Anker",
  description: "Model dilution across rounds with founder, ESOP, and investor scenarios.",
}

export default async function CapTablePage() {
  await requirePersona(["founder"])
  const scope = await requireWorkspace()
  return <CapTableContent key={scope.orgId} orgId={scope.orgId} />
}
