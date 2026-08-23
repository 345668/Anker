"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { PlatformUser } from "@/lib/admin/users"

function fmtDate(s: string | null): string {
  if (!s) return "—"
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toISOString().slice(0, 10)
}

function relative(s: string | null): string {
  if (!s) return "never"
  const d = new Date(s).getTime()
  if (Number.isNaN(d)) return "never"
  const days = Math.floor((Date.now() - d) / 86_400_000)
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

const Badge = ({ children, tone = "muted" }: { children: React.ReactNode; tone?: "owner" | "admin" | "persona" | "muted" }) => {
  const tones: Record<string, string> = {
    owner: "bg-foreground text-background",
    admin: "bg-foreground/10 text-foreground",
    persona: "bg-foreground/[0.06] text-muted-foreground",
    muted: "bg-foreground/[0.04] text-muted-foreground",
  }
  return <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${tones[tone]}`}>{children}</span>
}

export function UsersClient({
  initialUsers, currentUserId, authSource, note,
}: {
  initialUsers: PlatformUser[]
  currentUserId: string | null
  authSource: boolean
  note?: string
}) {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return initialUsers
    return initialUsers.filter((u) =>
      (u.email ?? "").toLowerCase().includes(term) ||
      u.memberships.some((m) => m.orgName.toLowerCase().includes(term)))
  }, [q, initialUsers])

  const counts = useMemo(() => ({
    total: initialUsers.length,
    admins: initialUsers.filter((u) => u.isAdmin).length,
    owners: initialUsers.filter((u) => u.isOwner).length,
  }), [initialUsers])

  async function toggleAdmin(u: PlatformUser) {
    setErr(null); setBusy(u.id)
    try {
      const res = await fetch("/api/admin/users/role", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: u.id, isAdmin: !u.isAdmin }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data?.error ?? "Update failed."); return }
      router.refresh()
    } catch (e: any) {
      setErr(e?.message ?? "Network error.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {!authSource && note && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-muted-foreground">
          {note}
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-sm text-red-600 dark:text-red-400">{err}</div>
      )}

      <div className="flex items-center justify-between gap-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by email or org…"
          className="w-full max-w-sm rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
        <div className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {counts.total} users · {counts.admins} admin · {counts.owners} owner
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-foreground/10">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-foreground/10 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium">Memberships</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Last active</th>
              <th className="px-4 py-3 text-right font-medium">Admin</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const isSelf = currentUserId != null && u.id === currentUserId
              const lockToggle = u.isOwner || (isSelf && u.isAdmin)
              return (
                <tr key={u.id} className="border-b border-foreground/[0.06] last:border-0 align-top">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{u.email ?? "(no email)"}</span>
                      {isSelf && <Badge>you</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {u.isOwner && <Badge tone="owner">owner</Badge>}
                      {u.isAdmin && !u.isOwner && <Badge tone="admin">admin</Badge>}
                      {!u.confirmed && <Badge>unconfirmed</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {u.memberships.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {u.memberships.map((m) => (
                          <div key={m.orgId} className="flex flex-wrap items-center gap-1.5">
                            <span className="text-foreground">{m.orgName}</span>
                            <Badge tone="persona">{m.orgRole}</Badge>
                            {m.persona && <Badge tone="persona">{m.persona}</Badge>}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(u.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{relative(u.lastSignInAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      disabled={lockToggle || busy === u.id}
                      onClick={() => toggleAdmin(u)}
                      title={u.isOwner ? "Owner accounts are managed at the database level." : isSelf && u.isAdmin ? "You can't remove your own admin access." : ""}
                      className={`rounded-md border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        u.isAdmin
                          ? "border-foreground/15 text-foreground hover:border-foreground/40"
                          : "border-foreground/15 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                      }`}
                    >
                      {busy === u.id ? "…" : u.isAdmin ? "Revoke admin" : "Grant admin"}
                    </button>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No users match “{q}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
