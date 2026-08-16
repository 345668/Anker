import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { NavModeShell } from "@/components/shell/nav-mode-shell"
import { CommandPalette } from "@/components/shell/command-palette"
import { isAdminUser } from "@/lib/auth/require-admin"
import { resolveActiveMembership } from "@/lib/org/active"
import { isOwner } from "@/lib/auth/admin"

// Dashboard touches a live DB (PGlite locally, Neon in prod) — never prerender.
export const dynamic = "force-dynamic"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/login")
  }

  // Admin status uses the same three-source check as the server-side guard:
  //   1) lib/auth/admin.ts ADMIN_EMAILS allowlist
  //   2) Supabase user_metadata.role === "admin"
  //   3) public.users.is_admin === true on Neon
  // Sidebar/nav rendering must match the server's gate or admins via #1/#3
  // see no Admin link even though /dashboard/admin/* would let them in.
  const { isAdmin } = await isAdminUser()

  // Persona-scoped navigation. Owners (and users with no membership yet) see
  // the full nav; otherwise the sidebar is filtered to the active workspace's
  // persona — founder / vc / lp. `null` persona also falls through to "all".
  const owner = isOwner(user.email)
  const { active } = await resolveActiveMembership(user.id)
  const persona = owner ? null : active?.persona ?? null

  // Chrome preference from the cookie NavModeShell mirrors, so the server renders
  // the right chrome on first paint (no sidebar→top flash). Default: sidebar.
  const initialMode = (await cookies()).get("anker_nav")?.value === "top" ? "top" : "sidebar"

  return (
    <>
      {/* Chrome (sidebar vs. website-style top nav) is chosen by the `anker:nav`
          flag; see NavModeShell. Default stays the sidebar. */}
      <NavModeShell user={user} isAdmin={isAdmin} persona={persona} initialMode={initialMode}>
        {children}
      </NavModeShell>

      {/* Global ⌘K command palette — persona-scoped, shared by both chromes. */}
      <CommandPalette persona={persona} />
    </>
  )
}
