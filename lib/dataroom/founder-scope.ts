import { resolveActiveMembership } from "@/lib/org/active"

/**
 * The scoping key for a founder's raise room. Founders own one room per
 * workspace/company: we use the active company membership's org id, falling
 * back to the user id when the user has no membership yet (solo/early state).
 */
export async function resolveFounderCompanyId(userId: string): Promise<string> {
  try {
    const { active, all } = await resolveActiveMembership(userId)
    const company = active?.kind === "company" ? active : all.find((m) => m.kind === "company")
    if (company) return company.orgId
  } catch { /* fall through */ }
  return `user:${userId}`
}
