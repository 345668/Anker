import { createClient } from "@/lib/supabase/server"
import { PitchDeckContent } from "@/components/tesseract/pitch-deck-content"

export default async function PitchDeckPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <PitchDeckContent user={user!} />
}
