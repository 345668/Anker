import { createClient } from "@/lib/supabase/server"
import { AnalyticsContent } from "@/components/tesseract/analytics-content"

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <AnalyticsContent user={user!} />
}
