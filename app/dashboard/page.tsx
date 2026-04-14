import { createClient } from "@/lib/supabase/server"
import { DashboardContent } from "@/components/tesseract/dashboard-content"

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // User is guaranteed to exist due to layout auth check
  return <DashboardContent user={user!} />
}
