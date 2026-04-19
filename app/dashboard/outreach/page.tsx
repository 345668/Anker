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

  // Initialize with safe defaults
  let startup: { id: string; name: string; description: string | null; industry: string | null; stage: string | null } | null = null
  let outreaches: Array<Record<string, unknown>> = []
  let templates: { id: string; name: string; subject: string; body: string; is_default?: boolean }[] = []

  try {
    // Get user's startup
    const startups = await sql`
      SELECT id, name, description, industry, stage FROM startups WHERE owner_id = ${user.id} LIMIT 1
    `
    startup = startups[0] || null

    // Get outreaches with investor details (only basic columns that exist)
    if (startup) {
      try {
        outreaches = await sql`
          SELECT 
            o.id, o.startup_id, o.investor_id, o.firm_id, o.stage, o.notes,
            o.created_at, o.updated_at, o.sent_at, o.opened_at, o.replied_at,
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
        // Fallback to simpler query if columns don't exist
        try {
          outreaches = await sql`
            SELECT o.*, 
              CONCAT(i.first_name, ' ', i.last_name) as investor_name,
              i.email as investor_email
            FROM outreaches o
            LEFT JOIN investors i ON o.investor_id = i.id
            WHERE o.startup_id = ${startup.id}
            ORDER BY o.created_at DESC
          `
        } catch {
          outreaches = []
        }
      }
    }

    // Get email templates (handle case where table might not exist)
    try {
      templates = await sql`
        SELECT * FROM email_templates WHERE user_id = ${user.id} OR is_default = true ORDER BY name ASC
      `
    } catch {
      // Table doesn't exist yet - that's okay
      templates = []
    }
  } catch (e) {
    // If any query fails, continue with empty data
    console.error('[v0] Outreach page database error:', e)
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
