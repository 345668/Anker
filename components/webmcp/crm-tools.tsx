"use client"

/**
 * WebMCP tools for /dashboard/crm.
 *
 * Four tools that map cleanly to the CRM workspace state:
 *   - find_contact(name)       : sets the filter + jumps to the first match
 *   - open_drawer(id)          : opens the outreach studio drawer for that row
 *   - add_note(id, body)       : appends a note via PATCH /api/crm/entries/:id
 *   - move_stage(id, stage)    : updates the row's stage via PATCH
 *
 * The two callback props (setFilter, setStudioRow) match the existing
 * state setters on CrmWorkspace. add_note and move_stage delegate to
 * fetch() calls that the CRM already exposes, so we don't dupe logic.
 */
import { useCallback } from "react"
import { useWebMcp } from "@/lib/webmcp/use-web-mcp"

interface CrmRowMinimal {
  id: string
  display_name?: string | null
  display_email?: string | null
  display_linkedin?: string | null
  stage?: string | null
}

interface Props {
  entries: CrmRowMinimal[]
  setFilter: (q: string) => void
  setStudioRow: (row: CrmRowMinimal | null) => void
  updateEntry: (id: string, patch: Record<string, any>) => void
}

const STAGES = ["queued", "contacted", "engaged", "meeting", "diligence", "committed", "passed"] as const

export function useCrmWebMcp(props: Props): void {
  const { entries, setFilter, setStudioRow, updateEntry } = props
  const findByName = useCallback((name: string): CrmRowMinimal | null => {
    const n = name.trim().toLowerCase()
    if (!n) return null
    return entries.find((e) => (e.display_name || "").toLowerCase().includes(n)) ?? null
  }, [entries])

  useWebMcp(
    () => [
      {
        name: "find_contact",
        description: "Search the CRM by contact name and focus the first match. Applies the search filter so the grid shows only matching rows.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Full or partial contact name to search for." },
          },
          required: ["name"],
        },
        annotations: { readOnlyHint: true },
        execute: async ({ name }: { name: string }) => {
          setFilter(name)
          const row = findByName(name)
          if (!row) return `No CRM row matches \"${name}\". Filter applied — try a shorter name.`
          return `Filtered to \"${name}\". Found ${row.display_name} (id=${row.id}). Call open_drawer to inspect.`
        },
      },
      {
        name: "open_drawer",
        description: "Open the outreach studio drawer for a specific CRM row. Use the row's id (as returned by find_contact). This shows research, drafts, and send actions.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "CRM row id — UUID from find_contact." },
          },
          required: ["id"],
        },
        execute: async ({ id }: { id: string }) => {
          const row = entries.find((e) => e.id === id) ?? null
          if (!row) return `No CRM row with id ${id}.`
          setStudioRow(row)
          return `Opened drawer for ${row.display_name}.`
        },
      },
      {
        name: "add_note",
        description: "Append a note to a CRM row. Notes are timestamped and stored on the row's history. Keep bodies short (< 500 chars).",
        inputSchema: {
          type: "object",
          properties: {
            id:   { type: "string", description: "CRM row id — UUID." },
            body: { type: "string", description: "Free-text note body. Will be timestamped server-side." },
          },
          required: ["id", "body"],
        },
        annotations: { untrustedContentHint: true },
        execute: async ({ id, body }: { id: string; body: string }) => {
          if (!body?.trim()) return "Note body cannot be empty."
          const r = await fetch(`/api/crm/entries/${encodeURIComponent(id)}/notes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body }),
          })
          if (!r.ok) return `Add note failed (${r.status}).`
          return `Note added to ${id}.`
        },
      },
      {
        name: "move_stage",
        description: "Move a CRM row to a new pipeline stage. Valid stages: queued, contacted, engaged, meeting, diligence, committed, passed.",
        inputSchema: {
          type: "object",
          properties: {
            id:    { type: "string", description: "CRM row id — UUID." },
            stage: { type: "string", enum: STAGES as unknown as string[], description: "The new stage for the row." },
          },
          required: ["id", "stage"],
        },
        execute: async ({ id, stage }: { id: string; stage: string }) => {
          if (!STAGES.includes(stage as any)) return `Invalid stage: ${stage}.`
          updateEntry(id, { stage })
          const r = await fetch(`/api/crm/entries/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stage }),
          })
          if (!r.ok) return `Move stage failed (${r.status}).`
          return `${id} moved to ${stage}.`
        },
      },
    ],
    [entries, setFilter, setStudioRow, updateEntry, findByName],
  )
}
/** Backward-compat component wrapper. Prefer useCrmWebMcp(). */
export function CrmWebMcpTools(props: Props): null {
  useCrmWebMcp(props)
  return null
}
