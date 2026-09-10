import { createClient } from "@/lib/supabase/server"
import { PitchDeckContent } from "@/components/tesseract/pitch-deck-content"
import { requirePersona } from "@/lib/auth/persona-guard"

export default async function PitchDeckPage() {
  await requirePersona(["founder"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <PitchDeckContent user={user!} />
}
