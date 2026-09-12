import { sql } from "@/lib/db"
import { getUserWorkspace, parseWorkspaceInput } from "@/lib/org/workspaces"
import { WorkspaceError } from "@/lib/auth/workspace-context"

export type Persona = "founder" | "vc"

/** A reserved, user-derived room lets setup uploads precede membership creation. */
export async function onboardingCompanyId(userId: string) {
  const id = `onboarding:founder:${userId}`
  const [existing] = await sql`SELECT id FROM organizations WHERE id = ${id}`
  if (existing) {
    const workspace = await getUserWorkspace(userId, id)
    if (!workspace || workspace.persona !== "founder" || !["workspace_owner", "admin"].includes(workspace.orgRole)) {
      throw new WorkspaceError("You no longer have permission to upload to this setup workspace.", 403)
    }
  }
  return id
}

/** Onboarding and workspace management share the same business profile contract.
 * Personal introductions and free-form setup notes remain in the user's draft.
 * No company data is written onto the global users row. */
export function onboardingWorkspaceInput(persona: Persona, data: Record<string, any>) {
  return parseWorkspaceInput({
    name: persona === "founder" ? data.company : data.firm,
    kind: persona === "founder" ? "company" : "fund",
    profile: persona === "founder" ? {
      website: data.website, stage: data.stage, sectors: data.sectors,
      summary: data.oneliner, geography: data.geography,
      raiseTarget: data.target, timeline: data.timeline, instrument: data.instrument, useOfFunds: data.use,
    } : {
      website: data.website, sectors: data.theses, thesis: data.notes,
      geography: data.geo, stageFocus: data.stageFocus,
      checkMin: data.checkMin, checkMax: data.checkMax,
      vintageYear: data.vintage ? Number(data.vintage) : undefined,
      fundSizeNote: data.size, lpTypes: data.lpTypes,
    },
  })
}

/** One statement commits workspace + membership + completed draft together.
 * A stable identity allows safe recovery of older, partly provisioned setups.
 * Belonging to another company never means this company already exists. */
export async function completeOnboarding(userId: string, persona: Persona, revision: number, data: Record<string, any>) {
  const input = onboardingWorkspaceInput(persona, data)
  const orgId = `onboarding:${persona}:${userId}`
  const fundId = `onboarding-fund:${userId}`
  const [existing] = await sql`SELECT owner_user_id FROM organizations WHERE id = ${orgId}`
  if (existing && existing.owner_user_id !== userId) throw new WorkspaceError("This setup cannot claim an existing workspace. Open Manage workspaces for help.", 409)
  if (existing) {
    const access = await getUserWorkspace(userId, orgId)
    if (!access || access.persona !== persona || !["workspace_owner", "admin"].includes(access.orgRole)) {
      throw new WorkspaceError("Your workspace permissions have changed. Setup cannot restore removed access.", 403)
    }
  }
  const settings = JSON.stringify({ profile: input.profile, workspaceRevision: 0 })
  const result = await sql`
    WITH claimed AS (
      UPDATE onboarding_drafts SET completed = true, workspace_id = ${orgId}, updated_at = now()
      WHERE user_id = ${userId} AND persona = ${persona} AND revision = ${revision}
        AND (completed = false OR workspace_id IS NULL)
      RETURNING user_id
    ), seeded_fund AS (
      INSERT INTO funds (id, slug, name, currency, status, vintage_year)
      SELECT ${fundId}, ${`fund-${userId}`}, ${input.name}, 'USD', 'fundraising', ${input.profile.vintageYear ?? null}
      FROM claimed WHERE ${persona === "vc"}
      ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id RETURNING id
    ), seeded_org AS (
      INSERT INTO organizations (id, kind, name, owner_user_id, created_by, fund_id, settings)
      SELECT ${orgId}, ${input.kind}, ${input.name}, ${userId}, ${userId}, (SELECT id FROM seeded_fund), ${settings}::jsonb FROM claimed
      ON CONFLICT (id) DO UPDATE SET settings =
        EXCLUDED.settings || COALESCE(organizations.settings, '{}'::jsonb) ||
        jsonb_build_object('profile', EXCLUDED.settings->'profile' || COALESCE(organizations.settings->'profile', '{}'::jsonb))
      RETURNING id
    ), seeded_membership AS (
      INSERT INTO memberships (id, user_id, org_id, org_role, persona, can_send_outreach)
      SELECT ${`membership:${persona}:${userId}`}, ${userId}, id, 'workspace_owner', ${persona}, true FROM seeded_org
      ON CONFLICT (user_id, org_id) DO NOTHING RETURNING org_id
    ) SELECT id FROM seeded_org
  `
  if (!result.length) throw new WorkspaceError("This setup changed in another tab. Reload the saved setup before finishing.", 409)
  const workspace = await getUserWorkspace(userId, orgId)
  if (!workspace || workspace.persona !== persona) throw new WorkspaceError("Workspace membership needs repair. Your draft is saved.", 409)
  return workspace
}
