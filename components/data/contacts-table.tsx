"use client"

import { DataTable, type Column } from "./data-table"
import { MetricTiles, type Metric } from "./metric-tiles"

export type ContactRow = {
  id: string
  first_name: string | null
  last_name: string | null
  title: string | null
  company: string | null
  email: string | null
  tags: string[] | null
  last_contacted_at: string | null
}

const name = (c: ContactRow) => [c.first_name, c.last_name].filter(Boolean).join(" ") || "—"

export function ContactsTable({ rows }: { rows: ContactRow[] }) {
  const withEmail = rows.filter((c) => c.email).length
  const contacted = rows.filter((c) => c.last_contacted_at).length
  const metrics: Metric[] = [
    { label: "Contacts", value: rows.length },
    { label: "With email", value: withEmail },
    { label: "Contacted", value: contacted },
    { label: "Companies", value: new Set(rows.map((c) => c.company).filter(Boolean)).size },
  ]
  const columns: Column<ContactRow>[] = [
    { key: "name", header: "Name", value: (c) => name(c), render: (c) => <span className="font-medium">{name(c)}</span> },
    { key: "title", header: "Title", value: (c) => c.title ?? "", render: (c) => c.title ?? "—" },
    { key: "company", header: "Company", value: (c) => c.company ?? "", render: (c) => c.company ?? "—" },
    { key: "email", header: "Email", value: (c) => c.email ?? "", render: (c) => c.email ? <span className="text-muted-foreground">{c.email}</span> : "—" },
    { key: "tags", header: "Tags", sortable: false, value: (c) => (c.tags ?? []).join(" "), render: (c) => (
      <span className="flex flex-wrap gap-1">
        {(c.tags ?? []).slice(0, 3).map((t) => <span key={t} className="text-[10px] font-mono uppercase tracking-wider border border-foreground/15 rounded px-1.5 py-0.5">{t}</span>)}
      </span>
    ) },
    { key: "last_contacted_at", header: "Last contacted", value: (c) => c.last_contacted_at ?? "", render: (c) => (c.last_contacted_at ? new Date(c.last_contacted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—") },
  ]
  return (
    <div className="space-y-6">
      <MetricTiles metrics={metrics} />
      <DataTable columns={columns} rows={rows} getRowId={(c) => c.id} exportName="contacts" searchPlaceholder="Search contacts…" emptyText="No contacts yet." />
    </div>
  )
}
