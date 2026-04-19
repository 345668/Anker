import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { OutreachContent } from "@/components/tesseract/outreach-content"
import { sql } from "@/lib/db"

// Safe database query helper that never throws
async function safeQuery<T>(queryFn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await queryFn()
  } catch {
    return fallback
  }
}

export default async function OutreachPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/login")
  }

  // Safe defaults - page will render even if all queries fail
  type StartupType = { id: string; name: string; description: string | null; industry: string | null; stage: string | null }
  type OutreachType = Record<string, unknown>
  type TemplateType = { id: string; name: string; subject: string; body: string; is_default?: boolean }

  let startup: StartupType | null = null
  let outreaches: OutreachType[] = []
  let templates: TemplateType[] = []

  // Try to fetch startup - owner_id first, then founder_id as fallback
  const startupResults = await safeQuery(
    () => sql`SELECT id, name, description, industry, stage FROM startups WHERE owner_id = ${user.id} LIMIT 1`,
    [] as StartupType[]
  )
  
  if (startupResults.length > 0) {
    startup = startupResults[0]
  } else {
    // Try founder_id as fallback (in case schema uses that)
    const fallbackResults = await safeQuery(
      () => sql`SELECT id, name, description, industry, stage FROM startups WHERE founder_id = ${user.id} LIMIT 1`,
      [] as StartupType[]
    )
    startup = fallbackResults[0] || null
  }

  // Fetch outreaches if startup exists
  if (startup?.id) {
    const rawOutreaches = await safeQuery(
      () => sql`
        SELECT 
          o.id, o.startup_id, o.investor_id, o.firm_id, o.stage, o.notes,
          o.created_at, o.updated_at, o.sent_at, o.opened_at, o.replied_at,
          i.first_name as investor_first_name,
          i.last_name as investor_last_name,
          i.email as investor_email,
          i.title as investor_title,
          f.name as firm_name
        FROM outreaches o
        LEFT JOIN investors i ON o.investor_id = i.id
        LEFT JOIN investment_firms f ON o.firm_id = f.id
        WHERE o.startup_id = ${startup.id}
        ORDER BY o.created_at DESC
        LIMIT 100
      `,
      [] as OutreachType[]
    )
    
    // Add computed investor_name field
    outreaches = rawOutreaches.map(o => ({
      ...o,
      investor_name: [o.investor_first_name, o.investor_last_name].filter(Boolean).join(' ') || 'Unknown'
    }))
  }

  // Fetch templates - table might not exist in production yet
  templates = await safeQuery(
    () => sql`SELECT id, name, subject, body, is_default FROM email_templates WHERE user_id = ${user.id} OR is_default = true ORDER BY name ASC`,
    [] as TemplateType[]
  )

  // Serialize data for client component (handles any non-serializable values)
  const serializedOutreaches = JSON.parse(JSON.stringify(outreaches))
  const serializedTemplates = JSON.parse(JSON.stringify(templates))

  return (
    <OutreachContent 
      user={user}
      startup={startup}
      outreaches={serializedOutreaches}
      templates={serializedTemplates}
    />
  )
}
