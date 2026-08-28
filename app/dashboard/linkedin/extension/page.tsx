/**
 * /dashboard/linkedin/extension — the LinkedOut Chrome extension hub.
 *
 * LinkedOut is entirely extension-driven (the extension is the only thing that
 * touches LinkedIn), so its install + token management lives inside the suite
 * rather than buried in Settings. Reuses the existing ExtensionTokensClient
 * (mint / revoke / install steps) and adds a live connection status derived
 * from the user's senders + token usage.
 */
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { sql } from "@/lib/db"
import { listSenders } from "@/lib/linkedin/senders"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { ExtensionTokensClient, type TokenSummary } from "@/components/settings/extension-tokens-client"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "LinkedOut Extension — Anker",
  description: "Install the Anker LinkedIn extension, manage tokens, and check connection status.",
}

function toIso(v: any): string | null {
  if (!v) return null
  try { return typeof v === "string" ? new Date(v).toISOString() : v.toISOString() } catch { return null }
}

export default async function LinkedOutExtensionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  let tokens: TokenSummary[] = []
  try {
    const rows: any[] = await sql`
      SELECT id, COALESCE(prefix, token_prefix) AS prefix, label, created_at, last_used_at, revoked_at
        FROM extension_tokens WHERE user_id = ${user.id}::uuid ORDER BY created_at DESC`
    tokens = rows.map((r) => ({
      id: String(r.id),
      prefix: String(r.prefix ?? "").slice(0, 12),
      label: r.label ? String(r.label) : null,
      createdAt: toIso(r.created_at),
      lastUsedAt: toIso(r.last_used_at),
      revokedAt: toIso(r.revoked_at),
    }))
  } catch { tokens = [] }

  const senders = await listSenders(user.id).catch(() => [])
  const activeTokens = tokens.filter((t) => !t.revokedAt)
  const lastUsed = activeTokens
    .map((t) => t.lastUsedAt)
    .filter(Boolean)
    .sort()
    .pop() as string | null | undefined
  const connected = activeTokens.length > 0 && !!lastUsed

  return (
    <PageShell>
      <PageHeader
        accent="#0a66c2"
        eyebrow="LinkedOut"
        title="Extension"
        description="LinkedOut runs entirely through the Anker Chrome extension — it executes approved actions in your own browser and syncs your inbox. Install it, mint a token, and keep this browser signed in to the sending account."
      />

      {/* Connection status */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatusCard
          label="Extension"
          value={connected ? "Connected" : activeTokens.length ? "Token minted" : "Not set up"}
          tone={connected ? "good" : activeTokens.length ? "warn" : "muted"}
          sub={lastUsed ? `Last seen ${new Date(lastUsed).toLocaleString()}` : "No calls yet"}
        />
        <StatusCard
          label="Active tokens"
          value={String(activeTokens.length)}
          tone={activeTokens.length ? "good" : "muted"}
          sub={activeTokens.length ? "Revoke unused ones below" : "Mint one below"}
        />
        <StatusCard
          label="Senders"
          value={String(senders.length)}
          tone={senders.length ? "good" : "muted"}
          sub={senders.length ? "Manage in LinkedOut → Senders" : "Add one in LinkedOut → Senders"}
        />
      </div>

      <ExtensionTokensClient initialTokens={tokens} userEmail={user.email ?? null} />
    </PageShell>
  )
}

function StatusCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "good" | "warn" | "muted" }) {
  const dot = tone === "good" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-muted-foreground/40"
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wide text-muted-foreground">
        <span className={`h-2 w-2 rounded-full ${dot}`} /> {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}
