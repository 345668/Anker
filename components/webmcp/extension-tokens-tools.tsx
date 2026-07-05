"use client"

/**
 * WebMCP tools for /dashboard/settings/extension-tokens.
 *
 *   - mint_token(label)      : mint a new bearer token, returns the
 *                              plaintext (once).
 *   - revoke_token(id)       : revoke a token by id.
 *
 * mint_token surfaces the plaintext in the tool output so the agent
 * can hand it back to the user in one turn. We add an untrustedContentHint
 * — the token is a secret, and a downstream agent shouldn't act on it
 * as if it were general context.
 */
import { useWebMcp } from "@/lib/webmcp/use-web-mcp"

interface Props {
  onMint: (label?: string | null) => Promise<{ ok: boolean; token?: string; prefix?: string; msg?: string }>
  onRevoke: (id: string) => Promise<{ ok: boolean; msg?: string }>
}

export function useExtensionTokensWebMcp(props: Props): void {
  const { onMint, onRevoke } = props
  useWebMcp(
    () => [
      {
        name: "mint_token",
        description: "Mint a new Anker LinkedIn extension bearer token. Returns the plaintext exactly once. Copy immediately into the extension Setup screen.",
        inputSchema: {
          type: "object",
          properties: {
            label: { type: "string", description: "Human-readable label (e.g. 'work laptop'). Max 64 chars." },
          },
        },
        annotations: { untrustedContentHint: true },
        execute: async ({ label }: { label?: string }) => {
          const r = await onMint(label ?? null)
          if (!r.ok || !r.token) return `Mint failed: ${r.msg || "unknown error"}.`
          return `Token minted (prefix ${r.prefix}). Copy the plaintext now — it will not be shown again: ${r.token}`
        },
      },
      {
        name: "revoke_token",
        description: "Revoke an existing extension token by id. Any extension using this token will immediately fail auth. Get the id from the token list on this page.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Token id (UUID) from the tokens list." },
          },
          required: ["id"],
        },
        execute: async ({ id }: { id: string }) => {
          if (!id) return "id is required."
          const r = await onRevoke(id)
          if (!r.ok) return `Revoke failed: ${r.msg || "unknown error"}.`
          return `Token ${id} revoked.`
        },
      },
    ],
    [onMint, onRevoke],
  )
}
/** Backward-compat component wrapper. Prefer useExtensionTokensWebMcp(). */
export function ExtensionTokensWebMcpTools(props: Props): null {
  useExtensionTokensWebMcp(props)
  return null
}
