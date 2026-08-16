"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Home, Users, Sparkles, Menu, X, LogOut, Settings, Shield } from "lucide-react"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { useNavPersona } from "@/components/shell/nav-persona"
import { groupsForPersona, SUITES } from "@/lib/nav/taxonomy"
import type { Persona } from "@/lib/org/active"

/**
 * Mobile navigation for the top-nav shell (redesign): a fixed bottom tab bar for
 * the primary entries plus a full-screen sheet (the "Menu" tab) with the full
 * grouped taxonomy, persona switcher, and account. Both, per the design decision.
 * Hidden on md+ where the top bar + contextual rail take over.
 */

const PERSONA_LABEL: Record<Persona, string> = { founder: "Founder", vc: "Venture Capital", lp: "Limited Partner" }

export function AppMobileNav({ user, isAdmin = false }: { user: User; isAdmin?: boolean }) {
  const { active, entitled, setActive } = useNavPersona()
  const pathname = usePathname()
  const router = useRouter()
  const [sheet, setSheet] = useState(false)
  const groups = groupsForPersona(active)

  const on = (href: string) => (href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(href + "/"))
  const showRel = active === "founder" || active === "vc"

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <>
      {/* Bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-foreground/10 bg-background/95 backdrop-blur-md flex items-stretch h-14">
        <Tab href="/dashboard" label="Home" icon={<Home className="w-5 h-5" />} active={on("/dashboard")} />
        {showRel && <Tab href="/dashboard/crm" label="Relations" icon={<Users className="w-5 h-5" />} active={on("/dashboard/crm")} />}
        {showRel && <Tab href="/dashboard/assistant" label="AI" icon={<Sparkles className="w-5 h-5" />} active={on("/dashboard/assistant")} />}
        <button onClick={() => setSheet(true)} className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground">
          <Menu className="w-5 h-5" />
          <span className="text-[10px]">Menu</span>
        </button>
      </nav>

      {/* Full-screen sheet */}
      {sheet && (
        <div className="md:hidden fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center justify-between h-14 px-4 border-b border-foreground/10 shrink-0">
            <span className="text-sm font-medium">Menu</span>
            <button onClick={() => setSheet(false)} aria-label="Close menu" className="p-2 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {entitled.length > 1 && (
              <div className="mb-5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">View as</div>
                <div className="flex gap-2 flex-wrap">
                  {SUITES.filter((s) => entitled.includes(s.persona)).map((s) => (
                    <button key={s.persona} onClick={() => setActive(s.persona)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${s.persona === active ? "bg-foreground text-background border-foreground" : "border-foreground/20 text-muted-foreground"}`}>
                      {PERSONA_LABEL[s.persona]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {groups.map((g) => (
              <div key={g.heading} className="mb-6">
                <div className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground mb-2">{g.heading}</div>
                <div className="flex flex-col">
                  {g.items.map((it) => (
                    <Link key={it.href + it.label} href={it.href} onClick={() => setSheet(false)}
                      className="flex items-center gap-3 py-2.5 text-[15px] text-foreground border-b border-foreground/[0.06] last:border-0">
                      {it.icon && <it.icon className="w-4 h-4 text-muted-foreground shrink-0" />}
                      {it.label}
                      {it.badge && <span className="text-[8px] font-mono uppercase tracking-wider text-[#e5380f]">{it.badge}</span>}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-foreground/10 p-3 shrink-0 flex flex-col gap-1">
            <Link href="/dashboard/settings" onClick={() => setSheet(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted-foreground"><Settings className="w-4 h-4" /> Settings</Link>
            {isAdmin && <Link href="/dashboard/admin" onClick={() => setSheet(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted-foreground"><Shield className="w-4 h-4" /> Owner Console</Link>}
            <button onClick={signOut} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted-foreground text-left"><LogOut className="w-4 h-4" /> Sign out ({user.email})</button>
          </div>
        </div>
      )}
    </>
  )
}

function Tab({ href, label, icon, active }: { href: string; label: string; icon: React.ReactNode; active: boolean }) {
  return (
    <Link href={href} className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${active ? "text-[#e5380f]" : "text-muted-foreground hover:text-foreground"}`}>
      {icon}
      <span className="text-[10px]">{label}</span>
    </Link>
  )
}
