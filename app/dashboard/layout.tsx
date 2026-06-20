import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardSidebar } from "@/components/tesseract/dashboard-sidebar"
import { isAdminUser } from "@/lib/auth/require-admin"

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

  return (
    <div className="min-h-screen bg-background flex">
      {/* Subtle grid lines - Optimus style */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-30">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={`h-${i}`}
            className="absolute h-px bg-foreground/10"
            style={{
              top: `${12.5 * (i + 1)}%`,
              left: 0,
              right: 0,
            }}
          />
        ))}
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={`v-${i}`}
            className="absolute w-px bg-foreground/10"
            style={{
              left: `${8.33 * (i + 1)}%`,
              top: 0,
              bottom: 0,
            }}
          />
        ))}
      </div>
      
      {/* Sidebar */}
      <DashboardSidebar user={user} isAdmin={isAdmin} />
      
      {/* Main content */}
      <main className="flex-1 ml-64 relative z-10">
        {children}
      </main>
    </div>
  )
}
