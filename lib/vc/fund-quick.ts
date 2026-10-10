/** The short fund form on the Raise your fund card (docs/architecture/50 §9.3): creates the active fund profile, or fills only what was typed, never overwriting the rest. */
import { z } from "zod"
import { randomUUID } from "node:crypto"
import { sql } from "@/lib/db"
const csv = z
  .string()
  .trim()
  .max(400)
  .transform((s) =>
    s
      .split(/[,;\n]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 12),
  )
export const quickFundSchema = z
  .object({
    name: z.string().trim().min(1, "Give the fund a name.").max(200).optional(),
    gpName: z.string().trim().min(1).max(200).optional(),
    targetRaise: z.number().finite().positive("Enter the target raise as a number.").max(1e13).optional(),
    thesisDescription: z
      .string()
      .trim()
      .min(20, "Describe the thesis in a sentence or two (at least 20 characters).")
      .max(2000)
      .optional(),
    sectors: csv.optional(),
    geographicFocus: csv.optional(),
    headquartersLocation: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
export type QuickFund = z.infer<typeof quickFundSchema>
export class QuickFundError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message)
  }
}

export async function saveQuickFund(
  scope: { orgId: string; userId: string },
  input: QuickFund,
): Promise<{ id: string; created: boolean }> {
  const [cur] =
    (await sql`SELECT id FROM fund_profiles WHERE org_id = ${scope.orgId} AND is_active = true ORDER BY updated_at DESC NULLS LAST LIMIT 1`) as any[]
  if (!cur) {
    if (!input.name) throw new QuickFundError("Give the fund a name to create the profile.")
    const id = randomUUID()
    const sectors = input.sectors ?? []
    await sql`INSERT INTO fund_profiles (id, name, fund_name, gp_name, target_raise, thesis_description, sectors, primary_sectors, geographic_focus, headquarters_location, user_id, org_id, is_active, created_at, updated_at)
      VALUES (${id}, ${input.name}, ${input.name}, ${input.gpName ?? null}, ${input.targetRaise ?? null}, ${input.thesisDescription ?? null}, ${JSON.stringify(sectors)}::jsonb, ${JSON.stringify(sectors.slice(0, 3))}::jsonb,
        ${JSON.stringify(input.geographicFocus ?? [])}::jsonb, ${input.headquartersLocation ?? null}, ${scope.userId}, ${scope.orgId}, true, now(), now())`
    return { id, created: true }
  }
  // Fill what was typed; keep everything else exactly as it was.
  await sql`UPDATE fund_profiles SET
      name = coalesce(${input.name ?? null}, name), gp_name = coalesce(${input.gpName ?? null}, gp_name), target_raise = coalesce(${input.targetRaise ?? null}, target_raise),
      thesis_description = coalesce(${input.thesisDescription ?? null}, thesis_description),
      sectors = CASE WHEN ${input.sectors ? 1 : 0} = 1 THEN ${JSON.stringify(input.sectors ?? [])}::jsonb ELSE sectors END,
      primary_sectors = CASE WHEN ${input.sectors ? 1 : 0} = 1 THEN ${JSON.stringify((input.sectors ?? []).slice(0, 3))}::jsonb ELSE primary_sectors END,
      geographic_focus = CASE WHEN ${input.geographicFocus ? 1 : 0} = 1 THEN ${JSON.stringify(input.geographicFocus ?? [])}::jsonb ELSE geographic_focus END,
      headquarters_location = coalesce(${input.headquartersLocation ?? null}, headquarters_location), updated_at = now()
    WHERE id = ${cur.id} AND org_id = ${scope.orgId}`
  return { id: String(cur.id), created: false }
}
