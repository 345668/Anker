import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { CRMContent } from "@/components/tesseract/crm-content"
import { 
  getOutreachesWithDetails,
  getOutreachCountByStage,
  getInvestors,
} from "@/lib/db/platform-queries"
import { sql } from "@/lib/db"

export default async function CRMPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get the user's startup
  const startupResults = await sql`SELECT id FROM startups WHERE founder_id = ${user.id} LIMIT 1`
  const startupId = startupResults[0]?.id

  // Fetch outreaches and pipeline data
  const [outreaches, stageCounts, investors] = await Promise.all([
    startupId ? getOutreachesWithDetails(startupId, 200) : Promise.resolve([]),
    startupId ? getOutreachCountByStage(startupId) : Promise.resolve({}),
    getInvestors(50),
  ])

  return (
    <CRMContent 
      user={user} 
      outreaches={outreaches}
      stageCounts={stageCounts}
      investors={investors}
      startupId={startupId}
    />
  )
}
