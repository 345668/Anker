"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  Search,
  LogOut,
  Settings,
  Shield,
  MessageSquare,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { AnkerLogo } from "@/components/brand/anker-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { HeaderTrays } from "./header-trays";
import { useNavPersona } from "./nav-persona";
import {
  primaryLinksForPersona,
  suiteForPersona,
  SUITES,
} from "@/lib/nav/taxonomy";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import type { Persona } from "@/lib/org/active";

const PERSONA_LABEL: Record<Persona, string> = {
  founder: "Founder",
  vc: "Venture Capital",
  lp: "Limited Partner",
};

/** Alternative workspace header; destinations remain persona-scoped. */
export function AppNav({
  user,
  isAdmin = false,
}: {
  user: User;
  isAdmin?: boolean;
}) {
  const { active, entitled, setActive } = useNavPersona();
  const pathname = usePathname();
  const router = useRouter();
  const [isMac, setIsMac] = useState(false);
  useEffect(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  const suite = suiteForPersona(active);
  const email = user.email ?? "";
  const name =
    user.user_metadata?.full_name || email.split("@")[0] || "Account";
  const on = (href: string) =>
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");
  async function signOut() {
    await createClient().auth.signOut();
    router.push("/auth/login");
  }
  return (
    <header className="platform-topbar sticky top-0 z-40 border-b border-border bg-card">
      <div className="flex min-h-16 items-center gap-2 px-4 lg:px-6">
        <Link
          href="/dashboard"
          className="flex min-h-11 shrink-0 items-center"
          aria-label="Anker workspace"
        >
          <AnkerLogo className="h-5 lg:h-7 w-auto" />
        </Link>
        <div className="hidden md:block">
          {entitled.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex min-h-11 items-center gap-1 px-2 text-xs text-muted-foreground"
                  aria-label="Choose workspace view"
                >
                  {PERSONA_LABEL[active]}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>View as</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={active}
                  onValueChange={(p) => setActive(p as Persona)}
                >
                  {SUITES.filter((s) => entitled.includes(s.persona)).map(
                    (s) => (
                      <DropdownMenuRadioItem
                        key={s.persona}
                        value={s.persona}
                        className="min-h-11"
                      >
                        {PERSONA_LABEL[s.persona]}
                      </DropdownMenuRadioItem>
                    ),
                  )}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="px-2 text-xs text-muted-foreground">
              {PERSONA_LABEL[active]}
            </span>
          )}
        </div>
        <nav
          aria-label="Primary workspace navigation"
          className="hidden xl:flex items-center gap-1"
        >
          {primaryLinksForPersona(active).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={on(l.href) ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded px-3 text-sm ${on(l.href) ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              {l.label}
            </Link>
          ))}
          {suite && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex min-h-11 items-center gap-1 rounded px-3 text-sm text-muted-foreground hover:bg-muted">
                  Products
                  <ChevronDown className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-80 max-h-[70dvh] overflow-y-auto"
              >
                <DropdownMenuLabel>{suite.label}</DropdownMenuLabel>
                {suite.items.map((item) => (
                  <DropdownMenuItem
                    asChild
                    key={item.dashboardHref + item.name}
                  >
                    <Link
                      href={item.dashboardHref}
                      className="flex min-h-14 flex-col items-start gap-1 py-3"
                    >
                      <span>{item.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {item.desc}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("open-command-palette"))
          }
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded border border-input px-3 text-sm text-muted-foreground hover:bg-accent"
          aria-label="Open command palette"
        >
          <Search className="h-4 w-4" />
          <kbd className="hidden 2xl:inline text-xs">
            {isMac ? "⌘" : "Ctrl"} K
          </kbd>
        </button>
        <ThemeToggle className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-muted-foreground hover:bg-accent" />
        <div className="hidden md:block">
          <HeaderTrays />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground"
              aria-label="Account menu"
            >
              <span className="text-xs font-medium">
                {String(name).slice(0, 2).toUpperCase()}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <span className="block truncate">{name}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings" className="min-h-11">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/assistant" className="min-h-11">
                <MessageSquare className="h-4 w-4" />
                AI assistant
              </Link>
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem asChild>
                <Link href="/dashboard/admin" className="min-h-11">
                  <Shield className="h-4 w-4" />
                  Owner Console
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="min-h-11">
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
