// Admin & Platform-Owner configuration.
//
// Two platform tiers (distinct from per-workspace org roles):
//   • owner  — top tier. Full platform oversight (admin console, aggregate
//              views, "Pitch us" submissions inbox) BUT firewalled from tenant
//              private records at the data-access layer (see docs §2.1).
//   • admin  — staff operators with /dashboard/admin/* access.
// owner ⊃ admin: every owner is also treated as an admin for menu/route gating.

export const OWNER_EMAILS = [
  "masindetphilippe@gmail.com",
  "vc@philippemasindet.com",
]

export const ADMIN_EMAILS = [
  "masindetphilippe@gmail.com",
  "vc@an-ker.de",
]

const norm = (email: string | undefined | null) => (email ?? "").trim().toLowerCase()

/** Platform Owner — top tier (superset of admin). */
export function isOwner(email: string | undefined | null): boolean {
  const e = norm(email)
  return !!e && OWNER_EMAILS.map((x) => x.toLowerCase()).includes(e)
}

/** Admin — includes owners, since owner ⊃ admin. */
export function isAdmin(email: string | undefined | null): boolean {
  const e = norm(email)
  if (!e) return false
  return ADMIN_EMAILS.map((x) => x.toLowerCase()).includes(e) || isOwner(e)
}
