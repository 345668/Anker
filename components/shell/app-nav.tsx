"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChevronDown, ArrowRight, Search, LogOut, Settings, Shield, MessageSquare } from "lucide-react"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { AnkerLogo } from "@/components/brand/anker-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { HeaderTrays } from "@/components/shell/header-trays"
import { useNavPersona } from "@/components/shell/nav-persona"
import { primaryLinksForPersona, suiteForPersona, SUITES } from "@/lib/nav/taxonomy"
import type { Persona } from "@/lib/org/active"

/**
 * App shell top navigation (redesign) — the website-style top bar that replaces
 * the sidebar. A persona-scoped Products mega-menu (full grouped destinations
 * from the shared taxonomy), a persona switcher in the brand lockup for
 * owners/multi-persona users, primary links, and the existing right cluster
 * (⌘K, theme, Tasks/Downloads trays, user menu).
 *
 * Rendered only when the `anker:nav=top` flag is on (see NavModeShell).
 */

const PERSONA_LABEL: Record<Persona, string> = { founder: "Founder", vc: "Venture Capital", lp: "Limited Partner" }
const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

export function AppNav({ user, isAdmin = false }: { user: User; isAdmin?: boolean }) {
  const { active, entitled, setActive } = useNavPersona()

  return (
    <header className="sticky top-0 z-40 border-b border-foreground/10 bg-background/85 backdrop-blur-md">
      <div className="flex items-center gap-3 h-14 px-4 lg:px-6">
        {/* Brand + persona switcher */}
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2.5 group" aria-label="Anker">
            <AnkerLogo className="h-7 w-auto transition-transform group-hover:scale-105" />
          </Link>
          <PersonaSwitcher entitled={entitled} active={active} onChange={setActive} />
        </div>

        {/* Primary nav */}
        <nav className="hidden md:flex items-center gap-1">
          {primaryLinksForPersona(active).map((l) => <TopLink key={l.href} href={l.href} label={l.label} />)}
          <ProductsMega active={active} />
        </nav>

        <div className="flex-1" />

        {/* Right cluster */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
          className="inline-flex items-center gap-2 rounded-md border border-foreground/15 bg-background px-3 py-1.5 text-sm text-muted-foreground hover:border-foreground/40 transition-colors"
          aria-label="Open command palette"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Navigate to…</span>
          <kbd className="ml-1 text-[10px] font-mono border border-foreground/15 rounded px-1.5 py-0.5">{isMac() ? "⌘" : "Ctrl"} K</kbd>
        </button>
        <div className="w-px h-5 bg-foreground/10 hidden sm:block" aria-hidden />
        <ThemeToggle className="inline-flex items-center justify-center p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/10 rounded-md transition-colors" />
        <HeaderTrays />
        <UserMenu user={user} isAdmin={isAdmin} />
      </div>
    </header>
  )
}

function TopLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname()
  // Exact match for the dashboard home; prefix match elsewhere.
  const activeRoute = href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(href + "/")
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors ${activeRoute ? "text-foreground bg-foreground/[0.06]" : "text-foreground/70 hover:text-foreground hover:bg-foreground/[0.04]"}`}
    >
      {label}
    </Link>
  )
}

/**
 * Persona-scoped Products mega-menu — a light overview of the suite's highlights
 * (the marketing SUITES items, so the app speaks the exact website language).
 * Depth lives in the contextual left rail, so this stays a quick launcher, not a
 * duplicate of the rail.
 */
function ProductsMega({ active }: { active: Persona }) {
  const [open, setOpen] = useState(false)
  const suite = suiteForPersona(active)
  if (!suite) return null

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="inline-flex items-center gap-1 px-3 py-2 text-sm text-foreground/70 hover:text-foreground rounded-md hover:bg-foreground/[0.04] transition-colors">
        Products <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`absolute left-0 top-full pt-2 transition-all duration-150 ${open ? "opacity-100 visible translate-y-0" : "opacity-0 invisible translate-y-1"}`}>
        <div className="w-[min(92vw,440px)] rounded-2xl border border-foreground/10 bg-background/98 backdrop-blur-xl shadow-2xl p-5">
          <div className="flex items-center gap-2 pb-3 mb-3 border-b border-foreground/10 text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
            <span className="w-2 h-2 bg-[#e5380f]" aria-hidden /> {suite.label}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {suite.items.map((it) => (
              <Link key={it.dashboardHref + it.name} href={it.dashboardHref} onClick={() => setOpen(false)}
                className="group/item block rounded-lg -mx-2 px-2 py-1.5 hover:bg-foreground/[0.05] transition-colors">
                <div className="text-[13px] font-medium text-foreground flex items-center gap-1">
                  {it.name}
                  <ArrowRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover/item:opacity-60 group-hover/item:translate-x-0 transition-all" />
                </div>
                <div className="text-[11px] text-muted-foreground leading-snug">{it.desc}</div>
              </Link>
            ))}
          </div>
          <p className="mt-3 pt-3 border-t border-foreground/10 text-[11px] text-muted-foreground">
            Everything else is in the sidebar and <kbd className="text-[10px] font-mono border border-foreground/15 rounded px-1 py-0.5">⌘K</kbd>.
          </p>
        </div>
      </div>
    </div>
  )
}

/** Brand-lockup persona switcher. Static label when only one persona is entitled. */
function PersonaSwitcher({ entitled, active, onChange }: { entitled: Persona[]; active: Persona; onChange: (p: Persona) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  if (entitled.length <= 1) {
    return <span className="hidden lg:inline text-[10px] font-mono uppercase tracking-wider text-muted-foreground whitespace-nowrap">{PERSONA_LABEL[active]}</span>
  }
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground rounded px-1.5 py-1 hover:bg-foreground/[0.06] transition-colors">
        {PERSONA_LABEL[active]} <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-48 rounded-xl border border-foreground/10 bg-background shadow-xl p-1.5 z-50">
          <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground px-2 py-1">View as</div>
          {SUITES.filter((s) => entitled.includes(s.persona)).map((s) => (
            <button key={s.persona} onClick={() => { onChange(s.persona); setOpen(false) }}
              className={`w-full text-left rounded-lg px-2 py-1.5 transition-colors ${s.persona === active ? "bg-foreground text-background" : "hover:bg-foreground/[0.05]"}`}>
              <div className="text-[13px] font-medium">{PERSONA_LABEL[s.persona]}</div>
              <div className={`text-[10px] ${s.persona === active ? "text-background/70" : "text-muted-foreground"}`}>{s.label}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function UserMenu({ user, isAdmin }: { user: User; isAdmin: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])
  const email = user.email ?? ""
  const firstName = (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ?? email.split("@")[0] ?? "Account"
  const initials = firstName.slice(0, 2).toUpperCase()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center shrink-0" title={`${firstName} · ${email}`}>
        <span className="font-mono text-[11px] font-medium">{initials}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-foreground/10 bg-background shadow-xl p-1.5 z-50">
          <div className="px-2.5 py-2 border-b border-foreground/10 mb-1">
            <p className="text-sm font-medium truncate">{firstName}</p>
            <p className="font-mono text-[10px] text-muted-foreground truncate">{email}</p>
          </div>
          <MenuLink href="/dashboard/settings" icon={<Settings className="w-4 h-4" />} label="Settings" onClick={() => setOpen(false)} />
          <MenuLink href="/dashboard/assistant" icon={<MessageSquare className="w-4 h-4" />} label="AI Assistant" onClick={() => setOpen(false)} />
          {isAdmin && <MenuLink href="/dashboard/admin" icon={<Shield className="w-4 h-4" />} label="Owner Console" onClick={() => setOpen(false)} />}
          <button onClick={signOut} className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition-colors">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function MenuLink({ href, icon, label, onClick }: { href: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition-colors">
      {icon} {label}
    </Link>
  )
}
