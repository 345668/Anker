"use client"

/**
 * ContactPicker — search-as-you-type contact picker with inline "create new".
 *
 * Used by the LP add/edit flows to wire fund_lps.lp_contact_id to a real
 * row in the contacts table.  Without this wiring, send-notice can't
 * resolve LP emails and every send is reported as 'skipped'.
 *
 * Behaviour
 * ─────────
 * - Mounted in two modes:
 *     attached (initialContactId set)   → renders the linked contact as a
 *                                         chip with email + an "unlink" X
 *     unattached (no id)                → renders the picker input
 * - Typing in the picker fires GET /api/portfolio/contacts?q=… (300ms
 *   debounce) and shows matches in a dropdown.
 * - Each result row: name + email + title in fine print. Click to select.
 * - "Create new contact" button at the bottom opens an inline mini-form
 *   (firstName / lastName / email / title) that POSTs and auto-selects.
 *
 * Controlled component — parent owns contactId + onChange. The picker
 * fetches contact-row metadata internally so the chip can show name +
 * email without the parent passing them.
 */

import { useEffect, useRef, useState } from "react"
import { Loader2, Search, X, UserPlus, Mail, Check } from "lucide-react"

interface ContactRow {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  title: string | null
}

interface Props {
  contactId: string | null
  onChange: (contactId: string | null, contact: ContactRow | null) => void
  /** Optional — pre-fill the create-new form with the LP name when no
   *  contact is yet attached. The LP add panel passes the typed lp_name
   *  so the picker offers "Create '{name}' as a contact" out of the box. */
  defaultName?: string
}

export function ContactPicker({ contactId, onChange, defaultName }: Props) {
  const [attached, setAttached] = useState<ContactRow | null>(null)
  const [loadingAttached, setLoadingAttached] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ContactRow[]>([])
  const [loadingResults, setLoadingResults] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createMode, setCreateMode] = useState(false)
  const [createDraft, setCreateDraft] = useState({
    firstName: "", lastName: "", email: "", title: "",
  })
  const [error, setError] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Resolve attached contact on mount / id change.
  useEffect(() => {
    if (!contactId) { setAttached(null); return }
    setLoadingAttached(true)
    // Cheapest way to get a single contact's display fields: the search
    // endpoint with q='' returns the most recent — but we need a specific
    // id.  Use the search endpoint filtered loosely; if not present, just
    // render the id as fallback.
    fetch(`/api/portfolio/contacts?q=&limit=50`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d) => {
        const hit = (d.rows ?? []).find((r: ContactRow) => r.id === contactId)
        setAttached(hit ?? { id: contactId, first_name: null, last_name: null, email: null, phone: null, title: null })
      })
      .catch(() => setAttached({ id: contactId, first_name: null, last_name: null, email: null, phone: null, title: null }))
      .finally(() => setLoadingAttached(false))
  }, [contactId])

  // Debounced search.
  useEffect(() => {
    if (!open || createMode) return
    setLoadingResults(true)
    const handle = setTimeout(() => {
      const url = `/api/portfolio/contacts?q=${encodeURIComponent(query)}&limit=20`
      fetch(url)
        .then((r) => r.ok ? r.json() : Promise.reject(r.status))
        .then((d) => setResults(d.rows ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoadingResults(false))
    }, 300)
    return () => clearTimeout(handle)
  }, [open, query, createMode])

  // Close on outside-click.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false); setCreateMode(false); setQuery("")
      }
    }
    window.addEventListener("mousedown", onClick)
    return () => window.removeEventListener("mousedown", onClick)
  }, [open])

  function select(c: ContactRow) {
    setAttached(c)
    onChange(c.id, c)
    setOpen(false); setCreateMode(false); setQuery("")
  }
  function unlink() {
    setAttached(null)
    onChange(null, null)
  }

  function openPicker() {
    // Seed the create-new form with the defaultName if the parent provides it.
    if (defaultName) {
      const parts = defaultName.trim().split(/\s+/)
      setCreateDraft((p) => ({
        ...p,
        firstName: parts[0] ?? p.firstName,
        lastName: parts.slice(1).join(" ") || p.lastName,
      }))
    }
    setOpen(true)
  }

  async function submitCreate() {
    setError(null)
    if (!createDraft.firstName.trim() && !createDraft.lastName.trim() && !createDraft.email.trim()) {
      setError("Give at least a name or an email.")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/portfolio/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createDraft),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Create failed (${res.status})`)
      select(data.contact)
      setCreateDraft({ firstName: "", lastName: "", email: "", title: "" })
    } catch (e: any) { setError(e?.message ?? "Create failed") }
    finally { setCreating(false) }
  }

  if (attached) {
    return (
      <div className="inline-flex items-center gap-2 px-2 py-1 border border-foreground/15 rounded-md bg-foreground/[0.02] text-xs max-w-full">
        {loadingAttached ? (
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        ) : (
          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
        )}
        <span className="font-medium truncate">
          {displayName(attached) || attached.id.slice(0, 8) + "…"}
        </span>
        {attached.email ? (
          <span className="text-muted-foreground font-mono text-[10px] truncate">
            <Mail className="w-2.5 h-2.5 inline mr-0.5" />
            {attached.email}
          </span>
        ) : (
          <span className="text-rose-500 text-[10px]">no email</span>
        )}
        <button
          type="button" onClick={unlink}
          className="ml-1 p-0.5 rounded hover:bg-foreground/10 shrink-0"
          title="Unlink contact"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="relative inline-block w-full max-w-xs">
      <button
        type="button"
        onClick={openPicker}
        className="inline-flex items-center gap-1.5 w-full h-7 px-2 text-xs border border-dashed border-foreground/20 rounded-md text-muted-foreground hover:border-foreground/40 hover:text-foreground"
      >
        <Search className="w-3 h-3" />
        Attach contact
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-72 z-20 bg-background border border-foreground/15 rounded-md shadow-lg overflow-hidden">
          {!createMode ? (
            <>
              <div className="p-2 border-b border-foreground/10">
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or email…"
                    className="w-full h-7 pl-7 pr-2 text-xs border border-foreground/15 rounded bg-background"
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {loadingResults ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> Searching…
                  </div>
                ) : results.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    {query ? `No contacts match "${query}".` : "No contacts yet."}
                  </div>
                ) : (
                  results.map((c) => (
                    <button
                      key={c.id} type="button"
                      onClick={() => select(c)}
                      className="w-full text-left px-2 py-1.5 hover:bg-foreground/5 border-t border-foreground/5 first:border-t-0 group"
                    >
                      <div className="flex items-center gap-1 text-xs">
                        <span className="font-medium truncate">
                          {displayName(c) || <span className="text-muted-foreground italic">(no name)</span>}
                        </span>
                        {c.title && <span className="text-[10px] text-muted-foreground truncate">· {c.title}</span>}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {c.email ? (
                          <><Mail className="w-2.5 h-2.5 inline mr-0.5" /> {c.email}</>
                        ) : (
                          <span className="text-rose-500">no email</span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => setCreateMode(true)}
                className="w-full text-left px-2 py-1.5 border-t border-foreground/10 bg-foreground/[0.02] hover:bg-foreground/5 text-xs inline-flex items-center gap-1.5 text-foreground"
              >
                <UserPlus className="w-3 h-3" />
                Create new contact…
              </button>
            </>
          ) : (
            <div className="p-2 space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">New contact</div>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text" value={createDraft.firstName}
                  onChange={(e) => setCreateDraft({ ...createDraft, firstName: e.target.value })}
                  placeholder="First name"
                  className="h-7 px-2 text-xs border border-foreground/15 rounded bg-background"
                />
                <input
                  type="text" value={createDraft.lastName}
                  onChange={(e) => setCreateDraft({ ...createDraft, lastName: e.target.value })}
                  placeholder="Last name"
                  className="h-7 px-2 text-xs border border-foreground/15 rounded bg-background"
                />
              </div>
              <input
                type="email" value={createDraft.email}
                onChange={(e) => setCreateDraft({ ...createDraft, email: e.target.value })}
                placeholder="email@example.com"
                className="w-full h-7 px-2 text-xs border border-foreground/15 rounded bg-background font-mono"
              />
              <input
                type="text" value={createDraft.title}
                onChange={(e) => setCreateDraft({ ...createDraft, title: e.target.value })}
                placeholder="Title (optional)"
                className="w-full h-7 px-2 text-xs border border-foreground/15 rounded bg-background"
              />
              {error && (
                <div className="text-[10px] text-rose-600 font-mono">{error}</div>
              )}
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button" onClick={submitCreate} disabled={creating}
                  className="inline-flex items-center gap-1 h-7 px-2.5 text-xs rounded bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                  Create & attach
                </button>
                <button
                  type="button" onClick={() => setCreateMode(false)}
                  className="h-7 px-2 text-xs rounded border border-foreground/15 hover:bg-foreground/5"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function displayName(c: ContactRow): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ").trim()
}
