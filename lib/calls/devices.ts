import { createHash, randomBytes } from "node:crypto"
import { sql } from "@/lib/db"
import { CallError, type CallScope } from "./access"

export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex")
export async function createDevice(scope: CallScope, name: string) {
  if (!scope.writable) throw new CallError("View-only workspace.", 403)
  if (!name.trim() || name.length > 80) throw new CallError("Enter a device name of up to 80 characters.")
  const token = `anker_call_${randomBytes(32).toString("base64url")}`
  const [device] = await sql`INSERT INTO call_sync_devices(user_id, org_id, name, token_hash)
    VALUES (${scope.userId}, ${scope.orgId}, ${name.trim()}, ${tokenHash(token)}) RETURNING id, name, expires_at`
  return { device, token }
}
export async function authenticateDevice(authorization: string | null): Promise<CallScope> {
  const token = authorization?.match(/^Bearer (anker_call_[A-Za-z0-9_-]{43})$/)?.[1]
  if (!token) throw new CallError("Invalid device credential.", 401)
  // Membership is revalidated on every request, including changes after pairing.
  const [row] = await sql`UPDATE call_sync_devices d SET last_seen_at = now() FROM memberships m, organizations o
    WHERE d.token_hash = ${tokenHash(token)} AND d.revoked_at IS NULL AND d.expires_at > now()
      AND m.user_id = d.user_id AND m.org_id = d.org_id AND m.org_role <> 'viewer'
      AND m.persona IN ('founder','vc','lp') AND o.id = d.org_id
    RETURNING d.user_id, d.org_id, m.persona, o.name`
  if (!row) throw new CallError("Device expired, revoked or workspace access changed. Reconnect from Anker.", 401)
  return { userId: row.user_id, orgId: row.org_id, persona: row.persona, workspace: row.name, writable: true }
}
