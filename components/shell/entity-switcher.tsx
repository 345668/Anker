"use client";

import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Building2, Wallet, Check, ChevronsUpDown, Plus } from "lucide-react";

type Membership = {
  orgId: string;
  name: string;
  kind: "company" | "fund";
  persona: string | null;
};

/** Carta-style entity switcher for the app top bar. Self-fetches memberships. */
export function EntitySwitcher() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Membership[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/org/active")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.memberships ?? []);
        setActiveId(d.activeOrgId ?? null);
      })
      .catch(() => {});
  }, []);

  const active = items.find((m) => m.orgId === activeId) ?? items[0] ?? null;

  async function pick(orgId: string) {
    if (orgId === activeId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/org/active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (!response.ok) throw new Error("Workspace switch failed");
      // hard reload so server components re-render under the new active org
      window.location.reload();
    } catch {
      setError("Could not switch workspace. Please try again.");
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  if (!active) return null;
  const Icon = active.kind === "fund" ? Wallet : Building2;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          aria-label={`Switch workspace: ${active.name}`}
          className="inline-flex min-h-11 max-w-full md:max-w-[260px] items-center gap-2 rounded border border-input bg-background px-3 text-sm hover:bg-accent"
        >
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">
            {busy ? "Switching…" : active.name}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Workspaces
        </DropdownMenuLabel>
        {error && (
          <p
            role="alert"
            className="px-2 py-2 text-sm text-[var(--platform-danger)]"
          >
            {error}
          </p>
        )}
        <DropdownMenuRadioGroup value={active.orgId} onValueChange={pick}>
          {items.map((m) => (
            <DropdownMenuRadioItem
              key={m.orgId}
              value={m.orgId}
              disabled={busy}
              className="min-h-12"
            >
              <span className="min-w-0">
                <span className="block truncate">{m.name}</span>
                <span className="block text-xs text-muted-foreground capitalize">
                  {m.kind}
                  {m.persona ? ` · ${m.persona}` : ""}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/onboarding" className="min-h-11">
            <Plus className="h-4 w-4" /> Create a workspace
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
