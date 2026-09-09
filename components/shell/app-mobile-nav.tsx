"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Users,
  Sparkles,
  Menu,
  LogOut,
  Settings,
  Shield,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useNavPersona } from "@/components/shell/nav-persona";
import { SUITES } from "@/lib/nav/taxonomy";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { HeaderTrays } from "./header-trays";
import { WorkspaceSections } from "./workspace-sections";
import type { Persona } from "@/lib/org/active";

/** Shared mobile navigation for both workspace layouts. */

const PERSONA_LABEL: Record<Persona, string> = {
  founder: "Founder",
  vc: "Venture Capital",
  lp: "Limited Partner",
};

export function AppMobileNav({
  user,
  isAdmin = false,
}: {
  user: User;
  isAdmin?: boolean;
}) {
  const { active, entitled, setActive } = useNavPersona();
  const pathname = usePathname();
  const router = useRouter();
  const [sheet, setSheet] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setSheet(false), [pathname]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setSheet(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  const on = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(href + "/");
  const showRel = active === "founder" || active === "vc";

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <Sheet open={sheet} onOpenChange={setSheet}>
      {/* Bottom tab bar */}
      <nav
        aria-label="Mobile workspace navigation"
        className="platform-mobile-tabs md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card flex items-stretch pb-[env(safe-area-inset-bottom)]"
      >
        <Tab
          href={active === "lp" ? "/lp" : "/dashboard"}
          label="Home"
          icon={<Home className="w-5 h-5" />}
          active={pathname === (active === "lp" ? "/lp" : "/dashboard")}
        />
        {showRel && (
          <Tab
            href="/dashboard/crm"
            label="Relationships"
            icon={<Users className="w-5 h-5" />}
            active={on("/dashboard/crm")}
          />
        )}
        {showRel && (
          <Tab
            href="/dashboard/assistant"
            label="AI"
            icon={<Sparkles className="w-5 h-5" />}
            active={on("/dashboard/assistant")}
          />
        )}
        <SheetTrigger asChild>
          <button
            type="button"
            ref={menuTriggerRef}
            aria-label="Open workspace navigation"
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground"
          >
            <Menu className="w-5 h-5" />
            <span className="text-xs">Menu</span>
          </button>
        </SheetTrigger>
      </nav>

      <SheetContent
        side="left"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          menuTriggerRef.current?.focus();
        }}
        className="platform-workspace platform-mobile-sheet flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <div className="border-b border-border px-5 py-5 pr-12">
          <SheetTitle>Workspace navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Choose a workspace page or manage your account.
          </SheetDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-5 flex items-center justify-between border-b border-border pb-3">
            <span className="text-sm text-muted-foreground">
              Updates & tasks
            </span>
            <HeaderTrays />
          </div>
          {entitled.length > 1 && (
            <div className="mb-5">
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                View as
              </div>
              <div className="flex gap-2 flex-wrap">
                {SUITES.filter((s) => entitled.includes(s.persona)).map((s) => (
                  <button
                    key={s.persona}
                    aria-pressed={s.persona === active}
                    onClick={() => setActive(s.persona)}
                    className={`text-xs px-3 py-1.5 min-h-11 rounded border transition-colors ${s.persona === active ? "bg-accent text-accent-foreground border-input" : "border-foreground/20 text-muted-foreground"}`}
                  >
                    {PERSONA_LABEL[s.persona]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div onClick={event => { if ((event.target as HTMLElement).closest("a")) setSheet(false) }}><WorkspaceSections /></div>
        </div>

        <div className="border-t border-foreground/10 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shrink-0 flex flex-col gap-1">
          <Link
            href="/dashboard/settings"
            onClick={() => setSheet(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted-foreground"
          >
            <Settings className="w-4 h-4" /> Settings
          </Link>
          {isAdmin && (
            <Link
              href="/dashboard/admin"
              onClick={() => setSheet(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted-foreground"
            >
              <Shield className="w-4 h-4" /> Owner Console
            </Link>
          )}
          <button
            onClick={signOut}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted-foreground text-left"
          >
            <LogOut className="w-4 h-4" />{" "}
            <span className="min-w-0 truncate">Sign out ({user.email})</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Tab({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${active ? "text-[var(--platform-link)]" : "text-muted-foreground hover:text-foreground"}`}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </Link>
  );
}
