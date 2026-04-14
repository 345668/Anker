import { createClient } from "@/lib/supabase/server"
import { InvestorsContent } from "@/components/tesseract/investors-content"

export default async function InvestorsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <InvestorsContent user={user!} />
}
