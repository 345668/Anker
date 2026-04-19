import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { OutreachContent } from "@/components/tesseract/outreach-content"
import { sql } from "@/lib/db"

export default async function OutreachPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/login")
  }

  // Get user's startup
  let startup: { id: string; name: string; description: string | null; industry: string | null; stage: string | null } | null = null
  try {
    const startups = await sql`
      SELECT id, name, description, industry, stage FROM startups WHERE owner_id = ${user.id} LIMIT 1
    `
    startup = startups[0] || null
  } catch (e) {
    console.log('[v0] Error fetching startup:', e)
  }

  // Get outreaches with investor details
  let outreaches: Array<Record<string, unknown>> = []
  if (startup) {
    try {
      outreaches = await sql`
        SELECT 
          o.*,
          CONCAT(i.first_name, ' ', i.last_name) as investor_name,
          i.email as investor_email,
          i.title as investor_title,
          f.name as firm_name
        FROM outreaches o
        LEFT JOIN investors i ON o.investor_id = i.id
        LEFT JOIN investment_firms f ON o.firm_id = f.id
        WHERE o.startup_id = ${startup.id}
        ORDER BY o.created_at DESC
      `
    } catch (e) {
      console.log('[v0] Error fetching outreaches:', e)
    }
  }

  // Get email templates (handle case where table might not exist)
  let templates: { id: string; name: string; subject: string; body: string; is_default?: boolean }[] = []
  try {
    templates = await sql`
      SELECT * FROM email_templates WHERE user_id = ${user.id} OR is_default = true ORDER BY name ASC
    `
  } catch (e) {
    // Table might not exist yet
    console.log('[v0] email_templates table not found, using empty array')
  }

  return (
    <OutreachContent 
      user={user}
      startup={startup}
      outreaches={JSON.parse(JSON.stringify(outreaches))}
      templates={JSON.parse(JSON.stringify(templates))}
    />
  )
}
