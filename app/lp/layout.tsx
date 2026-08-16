import { redirect } from "next/navigation"
import Link from "next/link"
import { LayoutDashboard } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { getLpMembershipsForUser } from "@/lib/portfolio/data-room"
import { isAdmin } from "@/lib/auth/admin"
import { LogoutButton } from "@/components/lp/lp-logout-button"
import { LpNav } from "@/components/lp/lp-nav"
import { AnkerLogo } from "@/components/brand/anker-logo"
import { ThemeToggle } from "@/components/theme-toggle"

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
  const { memberships, oversight } = await getLpMembershipsForUser(email)
  const staff = isAdmin(email)
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
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-4 flex items-center justify-between gap-3">
          <Link href="/lp" className="inline-flex items-center gap-3 min-w-0" aria-label="Anker LP Portal">
            <AnkerLogo className="h-6 w-auto shrink-0" />
            <span className="hidden sm:block w-px h-6 bg-foreground/15" aria-hidden />
            <div className="min-w-0">
              <div className="font-display text-sm tracking-tight leading-tight">Investor Room</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground truncate">
                {oversight ? `Owner oversight · ${memberships.length} LP${memberships.length === 1 ? "" : "s"}` : memberships.length === 1 ? memberships[0].fund_name : `${memberships.length} funds`}
              </div>
            </div>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            {staff && (
              <Link href="/dashboard" className="inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded-md border border-foreground/15 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors">
                <LayoutDashboard className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Dashboard</span>
              </Link>
            )}
            <span className="hidden md:inline text-xs font-mono text-muted-foreground">{email}</span>
            <ThemeToggle className="inline-flex items-center justify-center p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-md transition-colors" />
            <LogoutButton />
          </div>
        </div>
      </header>
      <LpNav oversight={oversight} />
      {children}
    </div>
  )
}
