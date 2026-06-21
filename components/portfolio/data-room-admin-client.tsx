"use client"

/**
 * Data room admin — upload, organise, scope per-LP.
 *
 * Upload flow is two-step on purpose:
 *   1. File picker → POST /upload → returns Vercel Blob URL
 *   2. Form fills in title / category / LP scope, then POST /documents
 *      with the URL from step 1
 *
 * Keeping these split lets the operator change their mind about
 * title/category after the file is up without re-uploading; also keeps
 * the DB row creation tiny so the lifecycle is reversible.
 *
 * The LP-scope dropdown shows "Fund-wide" + one row per LP. LPs without
 * a contact email are flagged amber because they can't actually receive
 * notice emails — useful context for the operator who's about to scope
 * a per-LP doc to them.
 */

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Upload, Loader2, AlertTriangle, CheckCircle2, FileText,
  Trash2, Archive, ArchiveRestore, Globe2, User, Filter, Search,
  ExternalLink, X, Edit2, Save,
} from "lucide-react"
import type { FundFull } from "@/lib/portfolio/funds"
import type {
  DataRoomDocumentWithScope, DocumentCategory,
} from "@/lib/portfolio/data-room"

interface LpLite { id: string; name: string; status: string; has_contact_email: boolean }

interface Props {
  fund: FundFull
  initialDocuments: DataRoomDocumentWithScope[]
  lps: LpLite[]
}

const CATEGORY_OPTS: { value: DocumentCategory; label: string }[] = [
  { value: "subscription",     label: "Subscription" },
  { value: "quarterly_letter", label: "Quarterly letter" },
  { value: "capital_call",     label: "Capital call" },
  { value: "distribution",     label: "Distribution" },
  { value: "k1",               label: "K-1 / tax" },
  { value: "financials",       label: "Financials" },
  { value: "policy",           label: "Policy / LPA" },
  { value: "other",            label: "Other" },
]

export function DataRoomAdminClient({ fund, initialDocuments, lps }: Props) {
  const router = useRouter()
  const [docs, setDocs] = useState(initialDocuments)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [query, setQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | "all">("all")
  const [scopeFilter, setScopeFilter] = useState<string>("all")  // "all" | "fund-wide" | lpId
  const [includeArchived, setIncludeArchived] = useState(false)

  // Upload-in-progress staging
  const [stagedFile, setStagedFile] = useState<null | {
    url: string; fileName: string; contentType: string; byteSize: number
  }>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Form fields for the row being created from staged file
  const [draftTitle, setDraftTitle] = useState("")
  const [draftCategory, setDraftCategory] = useState<DocumentCategory>("other")
  const [draftScope, setDraftScope] = useState<string>("")  // "" = fund-wide, lpId = scoped
  const [draftDescription, setDraftDescription] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return docs.filter((d) => {
      if (!includeArchived && d.archived_at) return false
      if (categoryFilter !== "all" && d.category !== categoryFilter) return false
      if (scopeFilter === "fund-wide" && d.fund_lp_id) return false
      if (scopeFilter !== "all" && scopeFilter !== "fund-wide" && d.fund_lp_id !== scopeFilter) return false
      if (q) {
        const blob = `${d.title} ${d.description ?? ""} ${d.file_name ?? ""} ${d.lp_name ?? ""}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [docs, query, categoryFilter, scopeFilter, includeArchived])

  async function refreshAll() {
    const params = new URLSearchParams()
    if (includeArchived) params.set("includeArchived", "true")
    const r = await fetch(`/api/portfolio/funds/${fund.id}/documents?${params.toString()}`)
    if (r.ok) {
      const d = await r.json()
      setDocs(d.rows ?? [])
    }
  }

  async function upload(file: File) {
    setUploading(true); setError(null); setSuccess(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/portfolio/funds/${fund.id}/documents/upload`, {
        method: "POST",
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Upload failed (${res.status})`)
      setStagedFile({
        url: data.url,
        fileName: data.fileName,
        contentType: data.contentType,
        byteSize: data.byteSize,
      })
      // Pre-fill title from filename (strip extension)
      const base = data.fileName?.replace(/\.[^.]+$/, "") ?? "Untitled"
      setDraftTitle(base)
      setSuccess(`Uploaded ${(data.byteSize / 1024).toFixed(0)} KB. Fill in title + scope, then Save.`)
    } catch (e: any) { setError(e?.message ?? "Upload failed") }
    finally { setUploading(false) }
  }

  async function saveDoc() {
    if (!stagedFile) return
    if (!draftTitle.trim()) { setError("title required"); return }
    setSaving(true); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle.trim(),
          category: draftCategory,
          fundLpId: draftScope || null,
          description: draftDescription.trim() || null,
          fileUrl: stagedFile.url,
          fileName: stagedFile.fileName,
          contentType: stagedFile.contentType,
          byteSize: stagedFile.byteSize,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`)
      // Reset + prepend the new doc
      setDocs((p) => [data.document, ...p])
      setStagedFile(null)
      setDraftTitle(""); setDraftCategory("other"); setDraftScope(""); setDraftDescription("")
      setSuccess("Document saved.")
    } catch (e: any) { setError(e?.message ?? "Save failed") }
    finally { setSaving(false) }
  }

  function cancelStaged() {
    setStagedFile(null)
    setDraftTitle(""); setDraftCategory("other"); setDraftScope(""); setDraftDescription("")
  }

  async function archiveDoc(id: string, archived: boolean) {
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? `Update failed`)
      }
      await refreshAll()
    } catch (e: any) { setError(e?.message ?? "Update failed") }
  }

  async function deleteDoc(id: string, title: string) {
    if (!confirm(`Hard-delete "${title}"? Use Archive if you want to keep the audit trail.`)) return
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/documents/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? `Delete failed`)
      }
      setDocs((p) => p.filter((x) => x.id !== id))
    } catch (e: any) { setError(e?.message ?? "Delete failed") }
  }

  const byCategory = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const d of docs) {
      if (d.archived_at && !includeArchived) continue
      counts[d.category] = (counts[d.category] ?? 0) + 1
    }
    return counts
  }, [docs, includeArchived])

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/portfolio/fund" className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Fund & LPs
        </Link>
        <div className="mt-3 flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-3xl md:text-4xl tracking-tight">Data room</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {fund.name} · {docs.length} document{docs.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || !!stagedFile}
            className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {uploading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
              : <><Upload className="w-4 h-4" /> Upload document</>}
          </button>
          <input
            ref={fileInputRef} type="file" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload(f)
              e.target.value = ""
            }}
          />
        </div>
      </div>

      {error && <Banner tone="error" text={error} />}
      {success && <Banner tone="success" text={success} />}

      {/* Staged file panel */}
      {stagedFile && (
        <div className="border border-foreground/15 rounded-md p-5 bg-foreground/[0.02] space-y-4">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <FileText className="w-3 h-3" />
            Uploaded · {stagedFile.fileName} · {(stagedFile.byteSize / 1024).toFixed(0)} KB
            <button onClick={cancelStaged} className="ml-auto p-1 rounded hover:bg-foreground/10" title="Discard upload">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Title">
              <input type="text" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} className={input} autoFocus />
            </Field>
            <Field label="Category">
              <select value={draftCategory} onChange={(e) => setDraftCategory(e.target.value as DocumentCategory)} className={input}>
                {CATEGORY_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Scope" hint="Fund-wide = every LP sees it. Per-LP = only that LP.">
              <select value={draftScope} onChange={(e) => setDraftScope(e.target.value)} className={input}>
                <option value="">Fund-wide (all LPs)</option>
                {lps.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}{!l.has_contact_email ? " · no email" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description" className="md:col-span-2">
              <textarea value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} rows={2} className={`${input} resize-y`} placeholder="Optional context shown in the LP portal" />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={saveDoc} disabled={saving || !draftTitle.trim()}
              className="inline-flex items-center gap-1.5 h-9 px-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save document
            </button>
            <button type="button" onClick={cancelStaged}
              className="h-9 px-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5">
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, description, filename, LP…"
            className="w-full h-9 pl-8 pr-3 text-sm border border-foreground/15 rounded-md bg-background" />
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as any)}
          className="h-9 px-2.5 text-sm border border-foreground/15 rounded-md bg-background">
          <option value="all">All categories</option>
          {CATEGORY_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}{byCategory[o.value] ? ` (${byCategory[o.value]})` : ""}
            </option>
          ))}
        </select>
        <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)}
          className="h-9 px-2.5 text-sm border border-foreground/15 rounded-md bg-background">
          <option value="all">All scope</option>
          <option value="fund-wide">Fund-wide only</option>
          {lps.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          show archived
        </label>
        <span className="ml-auto text-xs text-muted-foreground font-mono">{filtered.length}/{docs.length}</span>
      </div>

      {/* Document list */}
      <div className="border border-foreground/10 rounded-md divide-y divide-foreground/10 bg-background">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <FileText className="w-6 h-6 mx-auto mb-2 opacity-40" />
            No documents match. Upload one to get started.
          </div>
        ) : filtered.map((d) => (
          <DocRow
            key={d.id}
            doc={d}
            onArchive={(archived) => archiveDoc(d.id, archived)}
            onDelete={() => deleteDoc(d.id, d.title)}
          />
        ))}
      </div>
    </div>
  )
}

const input = "w-full h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background"

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between">
        <label className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">{label}</label>
        {hint && <span className="text-[10px] font-mono text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Banner({ tone, text }: { tone: "error" | "success"; text: string }) {
  return tone === "error" ? (
    <div className="px-3 py-2 text-xs font-mono text-rose-600 border border-rose-500/30 bg-rose-500/5 rounded-md inline-flex items-center gap-2">
      <AlertTriangle className="w-3 h-3" /> {text}
    </div>
  ) : (
    <div className="px-3 py-2 text-xs font-mono text-emerald-700 border border-emerald-500/30 bg-emerald-500/5 rounded-md inline-flex items-center gap-2">
      <CheckCircle2 className="w-3 h-3" /> {text}
    </div>
  )
}

function DocRow({
  doc, onArchive, onDelete,
}: {
  doc: DataRoomDocumentWithScope
  onArchive: (archived: boolean) => Promise<void>
  onDelete: () => Promise<void>
}) {
  return (
    <div className={`flex items-center gap-4 px-5 py-3 group ${doc.archived_at ? "opacity-60" : "hover:bg-foreground/[0.02]"}`}>
      <div className="w-9 h-9 rounded-md bg-foreground/5 border border-foreground/10 flex items-center justify-center shrink-0">
        <FileText className="w-4 h-4 text-foreground/60" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <a href={doc.file_url} target="_blank" rel="noreferrer"
            className="font-medium text-foreground hover:underline truncate inline-flex items-center gap-1">
            {doc.title}
            <ExternalLink className="w-3 h-3 opacity-60" />
          </a>
          <CategoryChip category={doc.category} />
          {doc.fund_lp_id ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border border-blue-500/20 bg-blue-500/10 text-blue-700">
              <User className="w-2.5 h-2.5" />
              {doc.lp_name ?? "scoped"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border border-foreground/10 bg-foreground/5 text-muted-foreground">
              <Globe2 className="w-2.5 h-2.5" />
              Fund-wide
            </span>
          )}
          {doc.archived_at && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">archived</span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] font-mono text-muted-foreground truncate">
          {doc.file_name ?? "—"}
          {doc.byte_size != null && ` · ${(doc.byte_size / 1024).toFixed(0)} KB`}
          {" · "}{new Date(doc.created_at).toLocaleDateString()}
        </div>
        {doc.description && (
          <div className="mt-1 text-xs text-muted-foreground line-clamp-1">{doc.description}</div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onArchive(!doc.archived_at)}
          className="text-[11px] px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5 inline-flex items-center gap-1"
          title={doc.archived_at ? "Restore" : "Archive"}>
          {doc.archived_at ? <ArchiveRestore className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
        </button>
        <button onClick={onDelete}
          className="text-[11px] px-2 py-1 rounded border border-rose-500/30 text-rose-600 hover:bg-rose-500/5">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

function CategoryChip({ category }: { category: DocumentCategory }) {
  const meta = CATEGORY_OPTS.find((o) => o.value === category)
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border border-foreground/15 bg-background text-foreground/70">
      {meta?.label ?? category}
    </span>
  )
}
