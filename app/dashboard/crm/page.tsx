import { createClient } from "@/lib/supabase/server"
import { CRMContent } from "@/components/tesseract/crm-content"
import { getContacts, getInvestmentFirms } from "@/lib/db/platform-queries"

export default async function CRMPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch real contacts and firms from Neon database
  const [contacts, firms] = await Promise.all([
    getContacts(100),
    getInvestmentFirms(100)
  ])

  return <CRMContent user={user!} contacts={contacts} firms={firms} />
}
