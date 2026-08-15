"use client"

import { Check, X, Info } from "lucide-react"

/**
 * Carta-style "Permissions granted" rollup — an "N of M" trigger that reveals a
 * checklist on hover (granted ✓ / withheld ✗). Used to summarize what an LP can
 * see at a glance, without reading each disclosure column.
 */
export function PermissionsTooltip({ items }: { items: { label: string; granted: boolean }[] }) {
  const granted = items.filter((i) => i.granted).length
  return (
    <span className="relative inline-flex items-center gap-1 group cursor-default">
      <span className="text-[11px] tabular-nums text-muted-foreground">{granted} of {items.length}</span>
      <Info className="w-3 h-3 text-muted-foreground" />
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-foreground/15 bg-popover p-3 shadow-xl opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0"
      >
        <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Permissions granted</span>
        <span className="block space-y-1.5">
          {items.map((i) => (
            <span key={i.label} className="flex items-center gap-2 text-[13px]">
              {i.granted
                ? <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                : <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
              <span className={i.granted ? "" : "text-muted-foreground line-through"}>{i.label}</span>
            </span>
          ))}
        </span>
      </span>
    </span>
  )
}
