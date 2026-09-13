import { requireWorkspace } from "@/lib/auth/workspace-context"
import { NativeStudio } from "@/components/decks/native-studio"
import { requirePersona } from "@/lib/auth/persona-guard"
export const metadata = { title: "Deck Studio | Anker" }
export default async function DecksPage() {
  await requirePersona(["founder", "vc"])
  const scope = await requireWorkspace()
  return <NativeStudio key={scope.orgId} orgId={scope.orgId} />
}
