"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import {
  flatDestinations,
  personaVisible,
  type CommandDest,
} from "@/lib/nav/taxonomy";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Persona } from "@/lib/org/active";

type Dest = CommandDest;

/**
 * Deep links + actions the main nav doesn't surface but power users want from
 * ⌘K (record views, "new" flows, account). Persona-scoped; everything else comes
 * from the shared taxonomy via flatDestinations, so the palette never drifts.
 */
const EXTRAS: (Dest & { personas?: Persona[] })[] = [
  {
    label: "Contacts — table",
    href: "/dashboard/crm/table",
    group: "Relationships",
    personas: ["founder", "vc"],
  },
  {
    label: "Deals — table",
    href: "/dashboard/deals/table",
    group: "Source & match",
    personas: ["vc"],
  },
  {
    label: "Investment firms — table",
    href: "/dashboard/investors/table",
    group: "Source & match",
    personas: ["vc"],
  },
  {
    label: "Entities (Funds & SPVs)",
    href: "/dashboard/entities",
    group: "Fund OS",
    personas: ["vc"],
  },
  {
    label: "Investments",
    href: "/dashboard/portfolio/fund/investments",
    group: "Fund OS",
    personas: ["vc"],
  },
  {
    label: "Partners (LPs)",
    href: "/dashboard/portfolio/fund/partners",
    group: "Fund OS",
    personas: ["vc"],
  },
  {
    label: "Capital calls — table",
    href: "/dashboard/portfolio/fund/calls/table",
    group: "Fund OS",
    personas: ["vc"],
  },
  {
    label: "Initiate capital call",
    href: "/dashboard/portfolio/fund/calls/new",
    group: "Fund OS",
    personas: ["vc"],
  },
  {
    label: "Distributions — table",
    href: "/dashboard/portfolio/fund/distributions/table",
    group: "Fund OS",
    personas: ["vc"],
  },
  {
    label: "Initiate distribution",
    href: "/dashboard/portfolio/fund/distributions/new",
    group: "Fund OS",
    personas: ["vc"],
  },
];

const ACCOUNT: Dest[] = [
  { label: "Settings", href: "/dashboard/settings", group: "Account" },
  // API Keys is Owner-Console-only (Anker staff), so it's not in the customer palette.
  {
    label: "Extension",
    href: "/dashboard/settings/extension-tokens",
    group: "Account",
    desc: "LinkedIn extension · tokens",
  },
  {
    label: "Help",
    href: "/dashboard/help",
    group: "Account",
    desc: "Support & docs",
  },
];

export function CommandPalette({
  persona = null,
}: {
  persona?: Persona | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const listId = useId();
  const selectedRef = useRef<HTMLButtonElement>(null);
  function rememberOpener() {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }

  // Persona-scoped destinations, sourced from the shared taxonomy so ⌘K always
  // matches the nav. Home first, then nav, then power-user deep links + account.
  const DESTS: Dest[] = useMemo(
    () => [
      { label: "Home", href: "/dashboard", group: "Overview" },
      ...flatDestinations(persona),
      ...EXTRAS.filter((e) => personaVisible(e.personas, persona)),
      ...ACCOUNT,
    ],
    [persona],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!open) rememberOpener();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onOpen() {
      rememberOpener();
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpen as EventListener);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(
        "open-command-palette",
        onOpen as EventListener,
      );
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return DESTS;
    return DESTS.filter((d) =>
      `${d.label} ${d.group} ${d.desc ?? ""}`.toLowerCase().includes(s),
    );
  }, [q, DESTS]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [idx, q]);

  function go(d: Dest) {
    setOpen(false);
    router.push(d.href);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="platform-workspace top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          opener.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">Search workspace</DialogTitle>
        <DialogDescription className="sr-only">
          Find a page. Use the arrow keys to choose a result and Enter to open
          it.
        </DialogDescription>
        <div className="flex items-center gap-3 px-4 border-b border-foreground/10">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            role="combobox"
            aria-label="Search workspace pages"
            aria-autocomplete="list"
            aria-expanded={true}
            aria-controls={listId}
            aria-activedescendant={
              results[idx] ? `${listId}-${idx}` : undefined
            }
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.max(0, Math.min(i + 1, results.length - 1)));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter" && results[idx]) {
                e.preventDefault();
                go(results[idx]);
              }
            }}
            placeholder="Search pages, tools, and settings…"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="min-h-11 px-2 text-xs text-muted-foreground"
            aria-label="Close search"
          >
            Esc
          </button>
        </div>
        <div
          id={listId}
          role="listbox"
          aria-label="Workspace pages"
          className="max-h-[52dvh] overflow-y-auto py-1.5"
        >
          {results.length === 0 ? (
            <div
              role="presentation"
              className="px-4 py-8 text-center text-sm text-muted-foreground"
            >
              No pages found. Try a different search.
            </div>
          ) : (
            results.map((d, i) => (
              <button
                key={`${d.group}|${d.href}|${i}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === idx}
                tabIndex={-1}
                ref={i === idx ? selectedRef : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(d)}
                onMouseEnter={() => setIdx(i)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${i === idx ? "bg-accent text-accent-foreground" : ""}`}
              >
                <span>{d.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    {d.group}
                  </span>
                  {i === idx && (
                    <CornerDownLeft className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
