import { createClient } from "@/lib/supabase/server"
import { DealsContent } from "@/components/tesseract/deals-content"

export default async function DealsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <DealsContent user={user!} />
}
