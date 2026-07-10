/**
 * /dashboard/outreach — the unified outreach engine surface.
 *
 * As of the May 2026 campaigns pass this route renders the campaigns +
 * members + template-library experience.  Investors get queued from the
 * CRM (bulk "Send selected to outreach"), land here organized by
 * campaign with their full profile, and the user picks a template +
 * drafts (with optional AI personalization) across the cohort.
 *
 * The earlier per-startup `outreaches` view (over the `outreaches`
 * table) is still rendered by `components/tesseract/outreach-content.tsx`
 * — no route points at it anymore.  It can be re-wired under
 * /dashboard/outreach/legacy if needed.
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { OutreachCampaigns } from "@/components/tesseract/outreach-campaigns"
import { BUILTIN_TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/outreach/builtin-templates"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Outreach — Anker",
  description: "Campaigns, member targeting, template library, AI drafts.",
}

export default async function OutreachPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  let campaignRows: any[] = []
  let userTemplateRows: any[] = []
  let countsRows: any[] = []
  try {
    campaignRows = await sql`
      SELECT * FROM outreach_campaigns
      WHERE user_id = ${user.id} AND archived = false
      ORDER BY updated_at DESC
    `
    countsRows = await sql`
      SELECT campaign_id, status, COUNT(*)::int AS n
      FROM outreach_campaign_members
      WHERE user_id = ${user.id}
      GROUP BY campaign_id, status
    `
  } catch {/* migration may not have run yet */}
  try {
    userTemplateRows = await sql`
      SELECT * FROM outreach_templates
      WHERE user_id = ${user.id} AND archived = false
      ORDER BY is_default DESC, updated_at DESC
    `
  } catch {/* migration may not have run yet */}

  const countMap: Record<string, { members: number; drafted: number; sent: number }> = {}
  for (const r of countsRows) {
    const id = String(r.campaign_id)
    const entry = countMap[id] ?? { members: 0, drafted: 0, sent: 0 }
    entry.members += Number(r.n) || 0
    if (r.status === "drafted") entry.drafted += Number(r.n) || 0
    if (r.status === "sent") entry.sent += Number(r.n) || 0
    countMap[id] = entry
  }

  const initialCampaigns = campaignRows.map((c: any) => ({
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    status: c.status,
    defaultChannel: c.default_channel,
    defaultTemplateId: c.default_template_id ?? null,
    ccEmails: Array.isArray(c.cc_emails) ? c.cc_emails : [],
    bccEmails: Array.isArray(c.bcc_emails) ? c.bcc_emails : [],
    counts: countMap[c.id] ?? { members: 0, drafted: 0, sent: 0 },
  }))

  const initialUserTemplates = userTemplateRows.map((r: any) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    channel: r.channel,
    subject: r.subject_template ?? undefined,
    body: r.body_template,
    variables: Array.isArray(r.variables) ? r.variables : [],
    builtin: false,
    isDefault: !!r.is_default,
    forkedFrom: r.forked_from ?? null,
  }))

  return (
    <OutreachCampaigns
      initialCampaigns={initialCampaigns}
      initialTemplates={{
        builtins: BUILTIN_TEMPLATES as any,
        user: initialUserTemplates,
        categories: TEMPLATE_CATEGORIES,
      }}
    />
  )
}
