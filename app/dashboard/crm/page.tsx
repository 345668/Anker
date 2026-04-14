import { createClient } from "@/lib/supabase/server"
import { CRMContent } from "@/components/tesseract/crm-content"

export default async function CRMPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <CRMContent user={user!} />
}
