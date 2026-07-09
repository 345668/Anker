"use client"

/**
 * Client-side UI for /dashboard/settings/extension-tokens.
 *
 * - Lists existing tokens (prefix-only, never plaintext).
 * - Mint form: label + click → server returns plaintext once → we display
 *   it in a one-time-visible box with Copy + a warning.
 * - Revoke button per row, with a confirm step.
 * - "Install the extension" panel with the four steps and a link to the
 *   latest GitHub Release for the packaged zip.
 *
 * All mint/revoke calls hit the existing server routes:
 *   POST   /api/extension/tokens        { label }        -> { id, token, prefix }
 *   DELETE /api/extension/tokens/:id                    -> { ok }
 */
import { useMemo, useState } from "react"
import { ExtensionTokensWebMcpTools } from "@/components/webmcp/extension-tokens-tools"

export interface TokenSummary {
  id: string
  prefix: string
  label: string | null
  createdAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
}

interface Props {
  initialTokens: TokenSummary[]
  userEmail: string | null
}

// Latest packaged release. Kept out of the .env because it's just a URL
// and having it in the code makes the docs page self-contained.
const STORE_URL = "https://chromewebstore.google.com/detail/anker-linkedin/acnchlkijdhbdghedndbdikpjjcmffcp"
const RELEASE_URL = "https://github.com/345668/Anker/releases?q=extension-v&expanded=true"

export function ExtensionTokensClient({ initialTokens, userEmail }: Props) {
  const [tokens, setTokens] = useState<TokenSummary[]>(initialTokens)
  const [label, setLabel] = useState("")
  const [minting, setMinting] = useState(false)
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeTokens = useMemo(() => tokens.filter((t) => !t.revokedAt), [tokens])

  async function mint() {
    setError(null); setMinting(true); setFreshToken(null)
    try {
      const r = await fetch("/api/extension/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || null }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      // Server returns { id, token, prefix, label, createdAt }
      setFreshToken(j.token)
      setTokens((prev) => [
        {
          id: String(j.id),
          prefix: String(j.prefix ?? "").slice(0, 12),
          label: label.trim() || null,
          createdAt: j.createdAt ?? new Date().toISOString(),
          lastUsedAt: null,
          revokedAt: null,
        },
        ...prev,
      ])
      setLabel("")
    } catch (e: any) {
      setError(e?.message || "Failed to mint token")
    } finally {
      setMinting(false)
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this token? Any installed extension using it will stop working immediately.")) return
    try {
      const r = await fetch(`/api/extension/tokens/${encodeURIComponent(id)}`, { method: "DELETE" })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setTokens((prev) => prev.map((t) => t.id === id ? { ...t, revokedAt: new Date().toISOString() } : t))
    } catch (e: any) {
      alert(e?.message || "Revoke failed")
    }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text) } catch {}
  }

  return (
    <div className="space-y-8">
      <ExtensionTokensWebMcpTools
        onMint={async (label) => {
          try {
            const r = await fetch("/api/extension/tokens", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ label }),
            })
            const j = await r.json().catch(() => ({}))
            if (!r.ok) return { ok: false, msg: j?.error || `HTTP ${r.status}` }
            return { ok: true, token: j.token, prefix: String(j.prefix || "").slice(0, 12) }
          } catch (e: any) { return { ok: false, msg: e?.message || "Network error" } }
        }}
        onRevoke={async (id) => {
          try {
            const r = await fetch(`/api/extension/tokens/${encodeURIComponent(id)}`, { method: "DELETE" })
            if (!r.ok) return { ok: false, msg: `HTTP ${r.status}` }
            return { ok: true }
          } catch (e: any) { return { ok: false, msg: e?.message || "Network error" } }
        }}
      />
      {/* Step 1: install */}
      <section className="rounded-xl border border-foreground/10 bg-background p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          1 · Install the extension
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Anker · LinkedIn is live on the Chrome Web Store — one click, auto-updates.
        </p>
        <a href={STORE_URL} target="_blank" rel="noopener noreferrer"
           className="mt-3 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90">
          Add to Chrome — free
        </a>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Manual install (Firefox, or pre-release builds)
          </summary>
          <ol className="mt-3 space-y-3 text-sm text-foreground/90">
            <li>
              Download the latest packaged build from{" "}
              <a href={RELEASE_URL} target="_blank" rel="noopener noreferrer"
                 className="font-semibold text-primary underline underline-offset-2">
                GitHub Releases
              </a>.
              Grab <code className="rounded bg-foreground/5 px-1.5 py-0.5">anker-linkedin-chrome-mv3-prod-*.zip</code>.
            </li>
            <li>Unzip it somewhere you won't accidentally delete.</li>
            <li>
              Open <code className="rounded bg-foreground/5 px-1.5 py-0.5">chrome://extensions</code>,
              toggle <b>Developer mode</b> on (top-right), click <b>Load unpacked</b>,
              and pick the unzipped folder.
            </li>
            <li>The Anker anchor icon should appear in your toolbar.</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Prefer Firefox? Grab the <code>firefox-mv2</code> zip from the same release.
          </p>
        </details>
      </section>

      {/* Step 2: mint token */}
      <section className="rounded-xl border border-foreground/10 bg-background p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          2 · Mint a bearer token
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Tokens authenticate the extension to your Anker server. Only the SHA-256 hash
          is stored — you'll see the plaintext once. If you lose it, mint a new one.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. work laptop)"
            className="flex-1 rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
          />
          <button
            onClick={mint}
            disabled={minting}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/85 disabled:opacity-60"
          >
            {minting ? "Minting…" : "Mint token"}
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {freshToken && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Copy this now — you won't see it again
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-black/5 px-3 py-2 font-mono text-xs text-foreground">
                {freshToken}
              </code>
              <button
                onClick={() => copy(freshToken)}
                className="rounded-lg border border-foreground/20 bg-background px-3 py-2 text-xs font-semibold hover:bg-foreground/5">
                Copy
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Paste it in the extension's <b>Setup</b> tab, along with your Anker base URL
              (<code>{typeof window !== "undefined" ? window.location.origin : "https://anker.de"}</code>).
              Then hit <b>Test connection</b> — you should see "Connected as {userEmail || "…"}".
            </p>
          </div>
        )}
      </section>

      {/* Step 3: existing tokens */}
      <section className="rounded-xl border border-foreground/10 bg-background p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          3 · Your tokens
        </h2>

        {tokens.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No tokens yet. Mint one above.
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-foreground/10">
            <table className="w-full text-sm">
              <thead className="bg-foreground/5 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Label</th>
                  <th className="px-3 py-2 text-left font-semibold">Prefix</th>
                  <th className="px-3 py-2 text-left font-semibold">Created</th>
                  <th className="px-3 py-2 text-left font-semibold">Last used</th>
                  <th className="px-3 py-2 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {tokens.map((t) => (
                  <tr key={t.id} className={t.revokedAt ? "opacity-50" : ""}>
                    <td className="px-3 py-2 font-medium">{t.label || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 font-mono text-xs">{t.prefix}…</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(t.createdAt)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(t.lastUsedAt) ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {t.revokedAt ? (
                        <span className="text-xs uppercase tracking-wider text-red-700">Revoked</span>
                      ) : (
                        <button onClick={() => revoke(t.id)}
                                className="text-xs font-semibold text-red-700 hover:underline">
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          {activeTokens.length} active · {tokens.length - activeTokens.length} revoked
        </p>
      </section>

      {/* Step 4: what to do next */}
      <section className="rounded-xl border border-foreground/10 bg-background p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          4 · Try it
        </h2>
        <ol className="mt-3 space-y-2 text-sm text-foreground/90">
          <li>Open any LinkedIn profile. A floating <b>Send to Anker</b> button appears top-right.</li>
          <li>Click it. The person is matched against your CRM or saved to your Network graph.</li>
          <li>Head to <a href="/dashboard/network" className="font-semibold text-primary underline underline-offset-2">/dashboard/network</a> to see the constellation.</li>
          <li>To bulk-sync your 1st-degree connections, use the extension popup's <b>My Connections</b> tab.</li>
        </ol>
      </section>
    </div>
  )
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
  } catch { return iso }
}
