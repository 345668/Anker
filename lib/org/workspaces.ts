import { randomUUID } from "node:crypto"
import { z } from "zod"
import { sql } from "@/lib/db"
import type { Membership } from "@/lib/org/active"

export type WorkspacePersona = "founder" | "vc" | "lp"
export type WorkspaceKind = "company" | "fund"

const profileSchema = z.object({
  website: z.string().trim().max(240).transform(value => value && !/^[a-z][a-z0-9+.-]*:/i.test(value) ? `https://${value}` : value).refine(value => {
    if (!value) return true
    try { return ["http:", "https:"].includes(new URL(value).protocol) } catch { return false }
  }, "Enter a full website address starting with https://").optional(),
  stage: z.string().trim().max(80).optional().or(z.literal("")),
  sectors: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
  summary: z.string().trim().max(2000).optional().or(z.literal("")),
  raiseTarget: z.string().trim().max(160).optional(),
  timeline: z.string().trim().max(300).optional(),
  instrument: z.string().trim().max(80).optional(),
  useOfFunds: z.string().trim().max(2000).optional(),
  fundSizeNote: z.string().trim().max(160).optional(),
  lpTypes: z.array(z.string().trim().max(80)).max(20).optional(),
  geography: z.string().trim().max(160).optional().or(z.literal("")),
  thesis: z.string().trim().max(2000).optional().or(z.literal("")),
  checkMin: z.string().trim().max(40).optional().or(z.literal("")),
  checkMax: z.string().trim().max(40).optional().or(z.literal("")),
  stageFocus: z.string().trim().max(120).optional().or(z.literal("")),
  vintageYear: z.coerce.number().int().min(1900).max(2200).optional().nullable(),
  targetSize: z.string().trim().refine(value => value === "" || (/^\d{1,12}(\.\d{1,2})?$/.test(value) && Number(value) >= 0), "Enter a fund size as a positive number with up to two decimal places").optional(),
})

export const workspaceInputSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required").max(120),
  kind: z.enum(["company", "fund"]),
  profile: profileSchema.default({}),
  revision: z.number().int().nonnegative().default(0),
  requestId: z.string().uuid().optional(),
  currency: z.enum(["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "SEK", "DKK", "NOK", "JPY"]).optional(),
})

export type WorkspaceInput = z.infer<typeof workspaceInputSchema>

export type WorkspaceRecord = Membership & {
  settings: { profile?: Record<string, unknown> } & Record<string, unknown>
  fundId: string | null
  ownerUserId: string | null
  currency?: string
  revision?: number
}

function cleanProfile(profile: WorkspaceInput["profile"]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(profile).filter(([, value]) => value !== "" && value != null && !(Array.isArray(value) && value.length === 0)))
}

function numericProfileValue(value: string | undefined | null): number | null {
  if (!value?.trim()) return null
  const parsed = Number(value.replaceAll(",", ""))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function workspaceFromRow(row: any): WorkspaceRecord {
  let settings: Record<string, unknown> = {}
  try { settings = row.settings && typeof row.settings === "object" ? row.settings : JSON.parse(row.settings ?? "{}") } catch { settings = {} }
  return {
    orgId: row.org_id,
    name: row.name,
    kind: row.kind,
    orgRole: row.org_role,
    persona: row.persona,
    canSendOutreach: !!row.can_send_outreach,
    // Do not serialize unrelated organization settings to members or browsers.
    settings: { profile: { ...(settings.profile as Record<string, unknown> ?? {}), ...(row.fund_id ? {
      vintageYear: row.vintage_year ?? null, targetSize: row.target_size?.toString() ?? "",
    } : {}) } },
    revision: Number(settings.workspaceRevision ?? 0),
    currency: row.currency ?? "USD",
    fundId: row.fund_id ?? null,
    ownerUserId: row.owner_user_id ?? null,
  }
}

export async function listUserWorkspaces(userId: string): Promise<WorkspaceRecord[]> {
  const rows = await sql`
    SELECT m.org_id, m.org_role, m.persona, m.can_send_outreach,
           o.name, o.kind, o.settings, o.fund_id, o.owner_user_id, f.vintage_year, f.target_size, f.currency
    FROM memberships m
    JOIN organizations o ON o.id = m.org_id
    LEFT JOIN funds f ON f.id = o.fund_id
    WHERE m.user_id = ${userId}
    ORDER BY m.created_at ASC
  `
  return rows.map(workspaceFromRow)
}

export async function getUserWorkspace(userId: string, orgId: string): Promise<WorkspaceRecord | null> {
  const rows = await sql`
    SELECT m.org_id, m.org_role, m.persona, m.can_send_outreach,
           o.name, o.kind, o.settings, o.fund_id, o.owner_user_id, f.vintage_year, f.target_size, f.currency
    FROM memberships m
    JOIN organizations o ON o.id = m.org_id
    LEFT JOIN funds f ON f.id = o.fund_id
    WHERE m.user_id = ${userId} AND m.org_id = ${orgId}
    LIMIT 1
  `
  return rows.length ? workspaceFromRow(rows[0]) : null
}

export async function createUserWorkspace(userId: string, input: WorkspaceInput): Promise<WorkspaceRecord> {
  const persona: Exclude<WorkspacePersona, "lp"> = input.kind === "fund" ? "vc" : "founder"
  const idSuffix = `${userId}:${input.requestId ?? randomUUID()}`
  const orgId = `workspace:${persona}:${idSuffix}`
  const membershipId = `membership:${idSuffix}`
  const fundId = input.kind === "fund" ? `fund:${idSuffix}` : null
  const slug = `anker-${persona}-${idSuffix}`
  const settings = JSON.stringify({ profile: cleanProfile(input.profile) })
  const vintageYear = input.profile.vintageYear ?? null
  const targetSize = numericProfileValue(input.profile.targetSize)

  await sql`
    WITH new_fund AS (
      INSERT INTO funds (id, slug, name, vintage_year, target_size, currency, status, metadata)
      SELECT ${fundId}, ${slug}, ${input.name}, ${vintageYear}, ${targetSize}, ${input.currency ?? "USD"}, 'fundraising', ${settings}::jsonb
      WHERE ${input.kind === "fund"}
      ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
      RETURNING id
    ), new_org AS (
      INSERT INTO organizations (id, kind, name, owner_user_id, created_by, fund_id, settings)
      VALUES (${orgId}, ${input.kind}, ${input.name}, ${userId}, ${userId}, (SELECT id FROM new_fund), ${settings}::jsonb)
      ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
      RETURNING id
    )
    INSERT INTO memberships (id, user_id, org_id, org_role, persona, can_send_outreach)
    SELECT ${membershipId}, ${userId}, id, 'workspace_owner', ${persona}, true FROM new_org
    ON CONFLICT (user_id, org_id) DO NOTHING
  `
  const workspace = await getUserWorkspace(userId, orgId)
  if (!workspace) throw new Error("Workspace could not be created")
  return workspace
}

export async function updateUserWorkspace(userId: string, orgId: string, input: WorkspaceInput): Promise<WorkspaceRecord> {
  const workspace = await getUserWorkspace(userId, orgId)
  if (!workspace) throw Object.assign(new Error("Workspace not found"), { code: "NOT_FOUND" })
  if (workspace.persona === "lp" || !["workspace_owner", "admin"].includes(workspace.orgRole)) {
    throw Object.assign(new Error("Only workspace owners and admins can edit this workspace"), { code: "FORBIDDEN" })
  }
  if (workspace.kind !== input.kind) throw Object.assign(new Error("Workspace type cannot be changed"), { code: "INVALID_KIND" })
  const vintageYear = input.profile.vintageYear ?? null
  const targetSize = numericProfileValue(input.profile.targetSize)
  const rows = await sql`
    WITH edited AS (
      UPDATE organizations o
      SET name = ${input.name}, settings = COALESCE(o.settings, '{}'::jsonb) ||
        jsonb_build_object('profile', COALESCE(o.settings->'profile', '{}'::jsonb) || ${JSON.stringify(input.profile)}::jsonb, 'workspaceRevision', ${input.revision}::int + 1)
      WHERE o.id = ${orgId} AND o.kind = ${input.kind}
        AND COALESCE((o.settings->>'workspaceRevision')::int, 0) = ${input.revision}
        AND EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = o.id AND m.user_id = ${userId}
          AND m.org_role IN ('workspace_owner', 'admin') AND m.persona IS DISTINCT FROM 'lp')
      RETURNING o.id, o.fund_id
    ), edited_fund AS (
      UPDATE funds f SET name = ${input.name},
        vintage_year = CASE WHEN ${input.profile.vintageYear !== undefined} THEN ${vintageYear}::int ELSE f.vintage_year END,
        target_size = CASE WHEN ${input.profile.targetSize !== undefined} THEN ${targetSize}::numeric ELSE f.target_size END,
        updated_at = now()
      FROM edited WHERE f.id = edited.fund_id RETURNING f.id
    ) SELECT id FROM edited
  `
  if (!rows.length) throw Object.assign(new Error("This workspace changed. Close and reopen the editor to load the latest details."), { code: "CONFLICT" })
  const updated = await getUserWorkspace(userId, orgId)
  if (!updated) throw new Error("Workspace could not be updated")
  return updated
}

export function parseWorkspaceInput(body: unknown): WorkspaceInput {
  return workspaceInputSchema.parse(body)
}
