/**
 * /dashboard/settings/extension-tokens
 *
 * Server page that lists the signed-in user's Anker LinkedIn extension
 * tokens and shows install instructions. Delegates all interactive
 * mint/revoke to <ExtensionTokensClient>.
 *
 * We deliberately don't send the plaintext of any existing token back to
 * the client — only the prefix (e.g. `ank_9F2q…`) and metadata. If the
 * user needs a token they've lost, they mint a new one.
 */
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { sql } from "@/lib/db"
import { ExtensionTokensClient, type TokenSummary } from "@/components/settings/extension-tokens-client"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Extension tokens — Anker",
  description:
    "Manage bearer tokens for the Anker LinkedIn Chrome extension and get one-click install instructions.",
}

export default async function ExtensionTokensPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  // The v0 schema stores the display prefix in the column `prefix`. My
  // earlier bootstrap migration used `token_prefix`. If both existed a
  // migration ago, COALESCE lets us pick whichever is populated so this
  // page keeps working across schema drift.
  let tokens: TokenSummary[] = []
  try {
    const rows: any[] = await sql`
      SELECT id,
             COALESCE(prefix, token_prefix) AS prefix,
             label, created_at, last_used_at, revoked_at
        FROM extension_tokens
       WHERE user_id = ${user.id}::uuid
       ORDER BY created_at DESC`
    tokens = rows.map((r) => ({
      id: String(r.id),
      prefix: String(r.prefix ?? "").slice(0, 12),
      label: r.label ? String(r.label) : null,
      createdAt: toIso(r.created_at),
      lastUsedAt: toIso(r.last_used_at),
      revokedAt: toIso(r.revoked_at),
    }))
  } catch (e) {
    // Either the extension_tokens table doesn't exist yet, or one of the
    // columns is missing. Fall back to a simpler read that skips the drift
    // helper, then finally to an empty list.
    try {
      const rows: any[] = await sql`
        SELECT id, prefix, label, created_at, last_used_at, revoked_at
          FROM extension_tokens
         WHERE user_id = ${user.id}::uuid
         ORDER BY created_at DESC`
      tokens = rows.map((r) => ({
        id: String(r.id),
        prefix: String(r.prefix ?? "").slice(0, 12),
        label: r.label ? String(r.label) : null,
        createdAt: toIso(r.created_at),
        lastUsedAt: toIso(r.last_used_at),
        revokedAt: toIso(r.revoked_at),
      }))
    } catch {
      tokens = []
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Settings
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          LinkedIn Extension
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Install the Anker Chrome extension to capture LinkedIn profiles
          into your CRM, sync your 1st-degree connections into the Network
          graph, and get pre-drafted DMs in your LinkedIn inbox. Everything
          runs in your browser and only talks to your Anker server.
        </p>
      </header>

      <ExtensionTokensClient initialTokens={tokens} userEmail={user.email ?? null} />
    </div>
  )
}

function toIso(v: any): string | null {
  if (!v) return null
  try {
    return typeof v === "string" ? new Date(v).toISOString() : v.toISOString()
  } catch { return null }
}
