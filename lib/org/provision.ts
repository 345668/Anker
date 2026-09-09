import { sql } from "@/lib/db"

/**
 * Persist onboarding progress into the existing `users` table (the app's real
 * profile store) and, on completion, seed a workspace (organizations +
 * memberships) for the per-workspace persona model.
 *
 * Progressive & idempotent: each step only fills the fields it has (COALESCE),
 * so re-submits and partial steps never wipe earlier data. Completion is acknowledged only after profile and workspace persistence.
 */

export type Persona = "founder" | "vc"

type Fields = {
  first_name: string | null
  last_name: string | null
  job_title: string | null
  linkedin_url: string | null
  company_name: string | null
  firm_role: string | null
  check_size_min: string | null
  check_size_max: string | null
  industries: string | null // JSON string or null
  preferred_stages: string | null // JSON string or null
  investment_focus: string | null // JSON string or null
  stage: string | null
  location: string | null
  bio: string | null
}

function mapFields(persona: Persona, d: Record<string, any>): Fields {
  const name = String(d?.name ?? "").trim()
  const parts = name.split(/\s+/).filter(Boolean)
  const first = parts[0] ?? null
  const last = parts.length > 1 ? parts.slice(1).join(" ") : null
  const arr = (v: any) => (Array.isArray(v) && v.length ? JSON.stringify(v) : null)

  if (persona === "vc") {
    return {
      first_name: first,
      last_name: last,
      job_title: d.title ?? null,
      linkedin_url: d.linkedin ?? null,
      company_name: d.firm ?? null,
      firm_role: d.title ?? null,
      check_size_min: d.checkMin ?? null,
      check_size_max: d.checkMax ?? null,
      industries: arr(d.theses),
      preferred_stages: d.stageFocus ? JSON.stringify([d.stageFocus]) : null,
      investment_focus: d.geo || d.notes ? JSON.stringify({ geo: d.geo ?? null, notes: d.notes ?? null }) : null,
      stage: d.stageFocus ?? null,
      location: d.geo ?? null,
      bio: d.notes ?? null,
    }
  }
  return {
    first_name: first,
    last_name: last,
    job_title: d.title ?? null,
    linkedin_url: d.linkedin ?? null,
    company_name: d.company ?? null,
    firm_role: null,
    check_size_min: null,
    check_size_max: null,
    industries: arr(d.sectors),
    preferred_stages: null,
    investment_focus: null,
    stage: d.stage ?? null,
    location: null,
    bio: d.oneliner ?? null,
  }
}

export async function saveOnboarding(args: {
  userId: string
  email: string | null
  persona: Persona
  data?: Record<string, any>
  completed?: boolean
}): Promise<void> {
  const { userId, email, persona } = args
  const f = mapFields(persona, args.data ?? {})
  if (args.completed) await seedWorkspace(userId, persona, f)
  const completedTs = args.completed ? new Date().toISOString() : null

  // UPDATE existing row (match by id or email), else INSERT.
  const updated = await sql`
    UPDATE users SET
      email             = COALESCE(email, ${email}),
      user_type         = ${persona},
      active_role       = ${persona},
      first_name        = COALESCE(${f.first_name}, first_name),
      last_name         = COALESCE(${f.last_name}, last_name),
      job_title         = COALESCE(${f.job_title}, job_title),
      linkedin_url      = COALESCE(${f.linkedin_url}, linkedin_url),
      company_name      = COALESCE(${f.company_name}, company_name),
      firm_role         = COALESCE(${f.firm_role}, firm_role),
      check_size_min    = COALESCE(${f.check_size_min}, check_size_min),
      check_size_max    = COALESCE(${f.check_size_max}, check_size_max),
      industries        = COALESCE(${f.industries}::jsonb, industries),
      preferred_stages  = COALESCE(${f.preferred_stages}::jsonb, preferred_stages),
      investment_focus  = COALESCE(${f.investment_focus}::jsonb, investment_focus),
      stage             = COALESCE(${f.stage}, stage),
      location          = COALESCE(${f.location}, location),
      bio               = COALESCE(${f.bio}, bio),
      onboarding_completed = COALESCE(${completedTs}, onboarding_completed),
      updated_at        = now()
    WHERE id = ${userId}
    RETURNING id
  `

  if (!updated.length) {
    await sql`
      INSERT INTO users (
        id, email, user_type, active_role, first_name, last_name, job_title, linkedin_url,
        company_name, firm_role, check_size_min, check_size_max,
        industries, preferred_stages, investment_focus, stage, location, bio,
        onboarding_completed, created_at, updated_at
      ) VALUES (
        ${userId}, ${email}, ${persona}, ${persona}, ${f.first_name}, ${f.last_name}, ${f.job_title}, ${f.linkedin_url},
        ${f.company_name}, ${f.firm_role}, ${f.check_size_min}, ${f.check_size_max},
        ${f.industries}::jsonb, ${f.preferred_stages}::jsonb, ${f.investment_focus}::jsonb, ${f.stage}, ${f.location}, ${f.bio},
        ${completedTs}, now(), now()
      )
      ON CONFLICT (id) DO NOTHING
    `
  }


}

/** Stable IDs and one SQL statement make concurrent retries safe. */
async function seedWorkspace(userId: string, persona: Persona, f: Fields): Promise<void> {
  const existing = await sql`SELECT id FROM memberships WHERE user_id = ${userId} AND persona = ${persona} LIMIT 1`
  if (existing.length) return
  const kind = persona === "vc" ? "fund" : "company"
  const name = f.company_name || (persona === "vc" ? "My fund" : "My company")
  const orgId = `onboarding:${persona}:${userId}`
  const fundId = `onboarding-fund:${userId}`
  await sql`
    WITH seeded_fund AS (
      INSERT INTO funds (id, slug, name, currency, status)
      SELECT ${fundId}, ${`fund-${userId}`}, ${name}, 'USD', 'fundraising' WHERE ${persona === "vc"}
      ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id RETURNING id
    ), seeded_org AS (
      INSERT INTO organizations (id, kind, name, owner_user_id, created_by, fund_id)
      VALUES (${orgId}, ${kind}, ${name}, ${userId}, ${userId}, (SELECT id FROM seeded_fund))
      ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id RETURNING id
    )
    INSERT INTO memberships (id, user_id, org_id, org_role, persona, can_send_outreach)
    SELECT ${`membership:${persona}:${userId}`}, ${userId}, id, 'workspace_owner', ${persona}, true FROM seeded_org
    ON CONFLICT (user_id, org_id) DO NOTHING
  `
  // Decks uploaded before membership existed remain visible in the new founder room.
  if (persona === "founder") await sql`
    UPDATE data_room_documents SET company_id = ${orgId}
    WHERE room_type = 'founder' AND company_id = ${`user:${userId}`} AND uploaded_by = ${userId}
  `
}
