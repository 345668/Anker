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
  const startups = await sql`
    SELECT id, name, description, industry, stage FROM startups WHERE founder_id = ${user.id} LIMIT 1
  `
  const startup = startups[0] || null

  // Get outreaches with investor details
  const outreaches = startup ? await sql`
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
  ` : []

  // Get email templates
  const templates = await sql`
    SELECT * FROM email_templates WHERE user_id = ${user.id} OR is_default = true ORDER BY name ASC
  `.catch(() => [])

  return (
    <OutreachContent 
      user={user}
      startup={startup}
      outreaches={JSON.parse(JSON.stringify(outreaches))}
      templates={JSON.parse(JSON.stringify(templates))}
    />
  )
}
