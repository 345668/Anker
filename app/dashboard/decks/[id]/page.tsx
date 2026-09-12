import { requireWorkspace } from "@/lib/auth/workspace-context"
import { NativeStudio } from "@/components/decks/native-studio"
import { requirePersona } from "@/lib/auth/persona-guard"
export default async function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePersona(["founder", "vc"])
  const scope = await requireWorkspace()
  return <NativeStudio key={scope.orgId} orgId={scope.orgId} deckId={(await params).id} />
}
