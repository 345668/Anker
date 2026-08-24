/**
 * GET   /api/admin/integration-keys — masked status of the DB-editable integration keys.
 * PATCH /api/admin/integration-keys — save/clear keys. Body: { NAME: "value", ... } ("" clears).
 *
 * Admin-gated. Values are envelope-encrypted at rest (lib/config/crypto); the GET never
 * returns full values (only set / source / last-4 hint). Only names in the allowlist are
 * accepted — core secrets can never be written here. Changes are audit-logged.
 */
import { NextResponse } from "next/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { logAudit } from "@/lib/audit/audit-log"
import { hasEncryptionKey } from "@/lib/config/crypto"
import {
  INTEGRATION_KEY_NAMES, isIntegrationKeyName, getIntegrationKey, keySource, saveIntegrationKeys,
} from "@/lib/config/integration-keys"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const mask = (v?: string | null) => (v && v.length > 4 ? `…${v.slice(-4)}` : v ? "••••" : null)

async function statusPayload() {
  const keys: Record<string, { set: boolean; source: "db" | "env" | null; hint: string | null }> = {}
  for (const name of INTEGRATION_KEY_NAMES) {
    const [val, source] = await Promise.all([getIntegrationKey(name), keySource(name)])
    keys[name] = { set: !!val, source, hint: mask(val) }
  }
  return { encryptionConfigured: hasEncryptionKey(), keys }
}

export async function GET() {
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json(await statusPayload())
}

export async function PATCH(req: Request) {
  const { isAdmin, userId, email } = await isAdminUser()
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!hasEncryptionKey()) {
    return NextResponse.json({ error: "CONFIG_ENC_KEY is not set — integration keys can't be stored encrypted. Set it before editing keys here." }, { status: 400 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  // Keep only allowlisted names; coerce to string. Anything else (incl. core secrets) is dropped.
  const updates: Record<string, string> = {}
  const changed: string[] = []
  for (const [k, v] of Object.entries(body)) {
    if (!isIntegrationKeyName(k)) continue
    updates[k] = typeof v === "string" ? v : ""
    changed.push(k)
  }
  if (!changed.length) return NextResponse.json({ error: "No editable integration keys in the request." }, { status: 400 })

  try {
    await saveIntegrationKeys(updates, userId ?? email ?? null)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Save failed." }, { status: 500 })
  }

  // Audit the change (names + set/clear only — never the values).
  await logAudit({
    actorId: userId, actorEmail: email, action: "admin.integration_keys.update",
    targetType: "system_settings", targetId: "integration_keys_v1",
    metadata: { changed: changed.map((k) => ({ key: k, action: updates[k] ? "set" : "clear" })) },
  })

  return NextResponse.json({ ok: true, ...(await statusPayload()) })
}
