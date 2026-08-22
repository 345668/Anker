import { redirect } from "next/navigation"
import { isAdminUser } from "@/lib/auth/require-admin"
import { isOwner } from "@/lib/auth/admin"
import { AdminShell } from "@/components/admin/admin-shell"
import { McpTokensPanel } from "@/components/admin/mcp-tokens-panel"

export const dynamic = "force-dynamic"
export const metadata = { title: "MCP Tokens — Anker" }

export default async function Page() {
  const { isAdmin, email } = await isAdminUser()
  if (!isAdmin || !isOwner(email)) redirect("/dashboard")
  return (
    <AdminShell
      eyebrow="Owner · MCP"
      title="MCP access tokens."
      description="Issue and revoke bearer tokens for the Anker MCP server (/api/mcp). Each token sets the user the tools act as, whether it is read-only, and an optional tool allowlist. The raw token is shown once — only its hash is stored."
      email={email}
    >
      <McpTokensPanel />
    </AdminShell>
  )
}
