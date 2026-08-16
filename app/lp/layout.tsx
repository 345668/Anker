import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getLpMembershipsForUser } from "@/lib/portfolio/data-room"
import { LogoutButton } from "@/components/lp/lp-logout-button"
import { LpNav } from "@/components/lp/lp-nav"

/**
 * /lp/* — LP portal layout.
 *
 * Auth model
 * ──────────
 * Any signed-in Supabase user whose email matches a contacts.email that's
 * attached to a fund_lps row gets in. We resolve memberships up-front and
 * 403 if none exist. Admin users with no LP membership ALSO get bounced —
 * the GP should look at the admin dashboard, not the LP portal.
 *
 * No separate "LP" user table. When an LP needs to access the portal, the
 * GP just makes sure the LP's contact has the email they'll log in with.
 * Magic-link login from /auth/login works as-is.
 */
export default async function LpLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login?redirect=/lp")

  const email = user.email ?? ""
  const { memberships } = await getLpMembershipsForUser(email)
  if (memberships.length === 0) {
    // Render a friendly stub instead of redirect — the user IS signed in,
    // they just don't have LP access. Pointing them to the dashboard is
    // useless because most LPs don't have founder/admin access either.
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="font-display text-2xl tracking-tight">LP portal</h1>
          <p className="text-sm text-muted-foreground">
            The email <span className="font-mono text-foreground">{email}</span> isn't
            attached to any LP on a fund we manage.
          </p>
          <p className="text-xs text-muted-foreground">
            If you expect access, contact the General Partner so they can attach your
            contact to your LP profile.
          </p>
          <div className="pt-4">
            <LogoutButton />
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-foreground/10 bg-background">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-4 flex items-center justify-between">
          <Link href="/lp" className="inline-flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-foreground text-background flex items-center justify-center text-xs font-mono font-bold">A</div>
            <div>
              <div className="font-display text-base tracking-tight">LP Portal</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {memberships.length === 1 ? memberships[0].fund_name : `${memberships.length} funds`}
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground">{email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <LpNav />
      {children}
    </div>
  )
}
