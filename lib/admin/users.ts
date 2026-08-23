/**
 * Owner Console — Users & roles data layer (server-only).
 *
 * Prod identity is Supabase Auth, so the authoritative roster comes from the Auth Admin
 * API (auth.admin.listUsers via the service-role client). We enrich each account with the
 * app `users` row (is_admin / is_owner) and their `memberships` (org role + persona), so
 * the console shows who someone is across the platform in one view.
 *
 * Degrades gracefully: with no SUPABASE_SERVICE_ROLE_KEY we fall back to the `users` table
 * alone and flag it, rather than throwing — the page still renders.
 */
import "server-only"
import { sql } from "@/lib/db"
import { createAdminClient } from "@/lib/supabase/admin"
import { logAudit } from "@/lib/audit/audit-log"

export interface PlatformUserMembership {
  orgId: string
  orgName: string
  orgKind: string | null
  orgRole: string
  persona: string | null
  canSendOutreach: boolean
}

export interface PlatformUser {
  id: string
  email: string | null
  createdAt: string | null
  lastSignInAt: string | null
  /** Confirmed email? (Supabase). */
  confirmed: boolean
  isAdmin: boolean
  isOwner: boolean
  memberships: PlatformUserMembership[]
}

export interface PlatformUsersResult {
  users: PlatformUser[]
  /** True when the Supabase Auth roster was used; false = DB-only fallback. */
  authSource: boolean
  note?: string
}

/** List every platform account, merged across Supabase Auth + `users` + `memberships`. */
export async function listPlatformUsers(): Promise<PlatformUsersResult> {
  // App-level flags + memberships (always available).
  const [appRows, memRows] = await Promise.all([
    sql`SELECT id, email, is_admin, is_owner FROM users` as Promise<any[]>,
    sql`SELECT m.user_id, m.org_id, m.org_role, m.persona, m.can_send_outreach,
               o.name AS org_name, o.kind AS org_kind
        FROM memberships m LEFT JOIN organizations o ON o.id = m.org_id` as Promise<any[]>,
  ]).catch(() => [[], []] as [any[], any[]])

  const appById = new Map<string, any>();
  const appByEmail = new Map<string, any>();
  for (const r of appRows) { if (r.id) appById.set(String(r.id), r); if (r.email) appByEmail.set(String(r.email).toLowerCase(), r); }

  const memByUser = new Map<string, PlatformUserMembership[]>();
  for (const m of memRows) {
    const list = memByUser.get(String(m.user_id)) ?? [];
    list.push({ orgId: String(m.org_id), orgName: m.org_name ?? m.org_id, orgKind: m.org_kind ?? null, orgRole: m.org_role, persona: m.persona ?? null, canSendOutreach: !!m.can_send_outreach });
    memByUser.set(String(m.user_id), list);
  }

  // Authoritative roster from Supabase Auth (paginated).
  let authUsers: any[] | null = null;
  try {
    const admin = createAdminClient();
    authUsers = [];
    for (let page = 1; page <= 20; page++) { // hard cap 20k users
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      authUsers.push(...(data?.users ?? []));
      if (!data?.users?.length || data.users.length < 1000) break;
    }
  } catch {
    authUsers = null; // no service-role key or Auth unreachable → DB fallback
  }

  if (authUsers) {
    const users: PlatformUser[] = authUsers.map((u) => {
      const app = appById.get(u.id) ?? appByEmail.get(String(u.email ?? "").toLowerCase());
      return {
        id: u.id,
        email: u.email ?? null,
        createdAt: u.created_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        confirmed: !!(u.email_confirmed_at || u.confirmed_at),
        isAdmin: app?.is_admin === true || (u.user_metadata?.role === "admin"),
        isOwner: app?.is_owner === true,
        memberships: memByUser.get(u.id) ?? [],
      };
    }).sort(sortUsers);
    return { users, authSource: true };
  }

  // Fallback: the app `users` table alone.
  const users: PlatformUser[] = appRows.map((r) => ({
    id: String(r.id), email: r.email ?? null, createdAt: null, lastSignInAt: null,
    confirmed: true, isAdmin: r.is_admin === true, isOwner: r.is_owner === true,
    memberships: memByUser.get(String(r.id)) ?? [],
  })).sort(sortUsers);
  return { users, authSource: false, note: "Supabase Auth roster unavailable (SUPABASE_SERVICE_ROLE_KEY not set) — showing app database records only. Last-active and unconfirmed accounts won't appear." };
}

// Owners first, then admins, then by most-recent sign-in / email.
function sortUsers(a: PlatformUser, b: PlatformUser): number {
  if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
  if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
  const at = a.lastSignInAt ? Date.parse(a.lastSignInAt) : 0;
  const bt = b.lastSignInAt ? Date.parse(b.lastSignInAt) : 0;
  if (at !== bt) return bt - at;
  return (a.email ?? "").localeCompare(b.email ?? "");
}

export interface SetAdminResult { ok: boolean; error?: string }

/**
 * Grant or revoke platform-admin on an account (`users.is_admin`).
 * Guardrails: an actor can't demote themselves (no lockout), and an owner's admin
 * status is immutable here (owners are managed at the DB level). Writes to the audit log.
 */
export async function setUserAdmin(args: {
  actorId: string | null; actorEmail: string | null;
  targetUserId: string; makeAdmin: boolean;
}): Promise<SetAdminResult> {
  const { actorId, actorEmail, targetUserId, makeAdmin } = args;
  if (!targetUserId) return { ok: false, error: "Missing target user." };
  if (actorId && targetUserId === actorId && !makeAdmin) {
    return { ok: false, error: "You can't remove your own admin access." };
  }
  const rows = await sql`SELECT id, email, is_admin, is_owner FROM users WHERE id = ${targetUserId} LIMIT 1` as any[];
  const target = rows[0];
  if (!target) return { ok: false, error: "That account has no app record yet — it must sign in once before roles can be set." };
  if (target.is_owner === true) return { ok: false, error: "Owner accounts are managed at the database level and can't be changed here." };
  if (target.is_admin === makeAdmin) return { ok: true }; // no-op

  await sql`UPDATE users SET is_admin = ${makeAdmin} WHERE id = ${targetUserId}`;
  await logAudit({
    actorId, actorEmail,
    action: makeAdmin ? "admin.role.grant" : "admin.role.revoke",
    targetType: "user", targetId: targetUserId, targetLabel: target.email ?? targetUserId,
    metadata: { field: "is_admin", to: makeAdmin },
  });
  return { ok: true };
}
