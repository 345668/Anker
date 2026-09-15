import { LegacyWorkspaceRecords } from "@/components/workspaces/legacy-records"
import { requirePersona } from "@/lib/auth/persona-guard"
export default async function LegacyRecordsPage() {
  await requirePersona(["founder","vc"])
  return <LegacyWorkspaceRecords />
}
