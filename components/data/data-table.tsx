"use client"

import { Fragment, useMemo, useRef, useState } from "react"
import { Search, ArrowUp, ArrowDown, ChevronsUpDown, ChevronRight, Download, Columns3, Check } from "lucide-react"

export type Column<T> = {
  key: string
  header: string
  /** cell renderer; defaults to String(value(row)) */
  render?: (row: T) => React.ReactNode
  /** raw value for sort / search / CSV; defaults to (row as any)[key] */
  value?: (row: T) => string | number | null | undefined
  numeric?: boolean
  sortable?: boolean
  defaultHidden?: boolean
  /** footer totals cell for this column */
  total?: (rows: T[]) => React.ReactNode
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  asOf,
  exportName = "export",
  searchPlaceholder = "Search…",
  renderExpanded,
  emptyText = "Nothing here yet.",
  initialSort,
}: {
  columns: Column<T>[]
  rows: T[]
  getRowId: (row: T) => string
  asOf?: string
  exportName?: string
  searchPlaceholder?: string
  renderExpanded?: (row: T) => React.ReactNode
  emptyText?: string
  initialSort?: { key: string; dir: "asc" | "desc" }
}) {
  const [q, setQ] = useState("")
  const [sortKey, setSortKey] = useState<string | null>(initialSort?.key ?? null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialSort?.dir ?? "asc")
  const [hidden, setHidden] = useState<Set<string>>(new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)))
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [colsOpen, setColsOpen] = useState(false)
  const colsRef = useRef<HTMLDivElement>(null)

  const val = (c: Column<T>, r: T): any => (c.value ? c.value(r) : (r as any)[c.key])
  const visible = columns.filter((c) => !hidden.has(c.key))
  const hasTotals = visible.some((c) => c.total)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) => columns.some((c) => String(val(c, r) ?? "").toLowerCase().includes(s)))
  }, [rows, q, columns])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const c = columns.find((x) => x.key === sortKey)
    if (!c) return filtered
    const dir = sortDir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = val(c, a), bv = val(c, b)
      if (av == null) return 1
      if (bv == null) return -1
      if (c.numeric) return (Number(av) - Number(bv)) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [filtered, sortKey, sortDir, columns])

  function toggleSort(c: Column<T>) {
    if (c.sortable === false) return
    if (sortKey === c.key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(c.key); setSortDir("asc") }
  }

  function exportCsv() {
    const head = visible.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(",")
    const body = sorted
      .map((r) => visible.map((c) => `"${String(val(c, r) ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob([head + "\n" + body], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${exportName}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="w-full">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-56 pl-8 pr-3 py-2 text-sm bg-background border border-foreground/15 rounded-md focus:border-foreground/40 outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex-1" />
        {asOf ? <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mr-1">As of {asOf}</span> : null}
        <div ref={colsRef} className="relative">
          <button onClick={() => setColsOpen((v) => !v)} className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-foreground/15 rounded-md hover:border-foreground/40" type="button">
            <Columns3 className="w-3.5 h-3.5" /> Columns
          </button>
          {colsOpen && (
            <div className="absolute right-0 top-full mt-1 z-40 w-52 rounded-md border border-foreground/15 bg-popover shadow-lg py-1.5">
              {columns.map((c) => {
                const on = !hidden.has(c.key)
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setHidden((h) => { const n = new Set(h); on ? n.add(c.key) : n.delete(c.key); return n })}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-foreground/[0.05] text-left"
                  >
                    <span className="grid place-items-center w-4 h-4 border border-foreground/25 rounded-sm">{on && <Check className="w-3 h-3" />}</span>
                    {c.header}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <button onClick={exportCsv} className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-foreground/15 rounded-md hover:border-foreground/40" type="button">
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>

      {/* table */}
      <div className="overflow-x-auto border border-foreground/10 rounded-lg">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-foreground/10">
              {renderExpanded ? <th className="w-9" /> : null}
              {visible.map((c) => {
                const sorted_ = sortKey === c.key
                return (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c)}
                    className={`px-3 py-2.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground whitespace-nowrap select-none ${c.numeric ? "text-right" : "text-left"} ${c.sortable === false ? "" : "cursor-pointer hover:text-foreground"}`}
                  >
                    <span className={`inline-flex items-center gap-1 ${c.numeric ? "flex-row-reverse" : ""}`}>
                      {c.header}
                      {c.sortable === false ? null : sorted_ ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={visible.length + (renderExpanded ? 1 : 0)} className="px-3 py-14 text-center text-muted-foreground">{emptyText}</td></tr>
            ) : (
              sorted.map((r) => {
                const id = getRowId(r)
                const isOpen = expanded.has(id)
                return (
                  <Fragment key={id}>
                    <tr className="border-b border-foreground/[0.06] hover:bg-foreground/[0.025]">
                      {renderExpanded ? (
                        <td className="pl-3 align-top">
                          <button onClick={() => setExpanded((e) => { const n = new Set(e); isOpen ? n.delete(id) : n.add(id); return n })} className="p-1 text-muted-foreground hover:text-foreground" aria-label={isOpen ? "Collapse" : "Expand"} type="button">
                            <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                          </button>
                        </td>
                      ) : null}
                      {visible.map((c) => (
                        <td key={c.key} className={`px-3 py-2.5 ${c.numeric ? "text-right tabular-nums" : ""}`}>
                          {c.render ? c.render(r) : String(val(c, r) ?? "—")}
                        </td>
                      ))}
                    </tr>
                    {renderExpanded && isOpen ? (
                      <tr className="border-b border-foreground/[0.06] bg-foreground/[0.015]">
                        <td />
                        <td colSpan={visible.length} className="px-3 py-3">{renderExpanded(r)}</td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
          {hasTotals && sorted.length > 0 ? (
            <tfoot>
              <tr className="border-t border-foreground/15 bg-foreground/[0.03] font-medium">
                {renderExpanded ? <td /> : null}
                {visible.map((c, i) => (
                  <td key={c.key} className={`px-3 py-2.5 ${c.numeric ? "text-right tabular-nums" : ""}`}>
                    {c.total ? c.total(sorted) : i === 0 ? `${sorted.length} rows` : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  )
}
