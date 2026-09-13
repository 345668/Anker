"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import type { User } from "@supabase/supabase-js"
import { PanelLeftClose, PanelLeftOpen, Settings, HelpCircle, LogOut } from "lucide-react"
import { AnkerLogo } from "@/components/brand/anker-logo"
import { WorkspaceSections } from "@/components/shell/workspace-sections"
import { useNavPersona } from "@/components/shell/nav-persona"
import { createClient } from "@/lib/supabase/client"
import type { Persona } from "@/lib/org/active"

const STAFF_LINKS = [
  ["Console overview", "/dashboard/admin"], ["Data operations", "/dashboard/imports"],
  ["Send center", "/dashboard/send-center"], ["Newsroom CMS", "/dashboard/content"],
  ["System health", "/dashboard/admin/system"], ["Provider settings", "/dashboard/settings/api-keys"],
  ["Users & roles", "/dashboard/admin/users"], ["Audit log", "/dashboard/admin/audit"], ["Billing", "/dashboard/admin/billing"],
]
export function DashboardSidebar({ user, isAdmin = false }: { user: User; isAdmin?: boolean; persona?: Persona | null }) {
  const [compact, setCompact] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { active, entitled, setActive } = useNavPersona()
  useEffect(() => { try { setCompact(localStorage.getItem("anker:sidebar") === "collapsed") } catch {} }, [])
  useEffect(() => { document.documentElement.style.setProperty("--sidebar-w", compact ? "4rem" : "16rem") }, [compact])
  function toggle() {
    setCompact(value => { const next = !value; try { localStorage.setItem("anker:sidebar", next ? "collapsed" : "expanded") } catch {} return next })
  }
  async function signOut() {
    const { error } = await createClient().auth.signOut()
    if (error) { setError("Could not sign out. Please try again."); return }
    window.location.assign("/auth/login")
  }
  return <aside className="platform-sidebar hidden md:flex fixed inset-y-0 left-0 z-40 flex-col border-r border-border bg-card" style={{ width: "var(--sidebar-w,16rem)" }}>
    <div className="min-h-16 flex items-center justify-center border-b border-border px-3"><Link href="/dashboard" aria-label="Anker workspace"><AnkerLogo variant="silver" className={compact ? "w-10" : "w-36"} /></Link></div>
    <nav aria-label="Workspace navigation" className="flex-1 min-h-0 overflow-y-auto p-2 py-5">
      <WorkspaceSections compact={compact} />
      {isAdmin && <details className="mt-5 border-t border-border pt-3"><summary className="min-h-11 px-3 flex items-center text-xs text-muted-foreground cursor-pointer" title="Administration">{compact ? "Ops" : "Administration · staff"}</summary><ul>{STAFF_LINKS.map(([label, href]) => <li key={href}><Link href={href} className="block text-xs min-h-11 p-3 text-muted-foreground hover:text-foreground" title={label}>{compact ? label.slice(0, 3) : label}</Link></li>)}</ul></details>}
    </nav>
    <div className="border-t border-border p-2 space-y-1">
      {!compact && entitled.length > 1 && <label className="grid gap-2 px-3 py-2 text-xs text-muted-foreground">Navigation preview<select value={active} onChange={e => setActive(e.target.value as Persona)} className="border border-input bg-background p-2 rounded"><option value="founder">Founder</option><option value="vc">Fund manager</option><option value="lp">LP</option></select><span>Menu only. Data follows the selected workspace.</span></label>}
      {!compact && <p className="px-3 py-2 text-xs text-muted-foreground truncate" title={user.email}>{user.email}</p>}
      <Link href="/dashboard/settings" aria-label="Settings" className="min-h-11 px-3 flex items-center gap-3 text-sm text-muted-foreground"><Settings size={16} />{!compact && "Settings"}</Link>
      <Link href="/dashboard/help" aria-label="Help" className="min-h-11 px-3 flex items-center gap-3 text-sm text-muted-foreground"><HelpCircle size={16} />{!compact && "Help"}</Link>
      <button onClick={signOut} aria-label="Sign out" className="min-h-11 px-3 flex items-center gap-3 text-sm text-muted-foreground"><LogOut size={16} />{!compact && "Sign out"}</button>
      {error && <p role="alert" className="text-xs text-[var(--platform-danger)] px-2">{error}</p>}
      <button onClick={toggle} aria-label={compact ? "Expand navigation" : "Collapse navigation"} className="min-h-11 px-3 flex items-center gap-3 text-xs text-muted-foreground">{compact ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} />Collapse navigation</>}</button>
    </div>
  </aside>
}
