"use client"

import Link from "next/link"
import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Save, Trash2, Loader2, AlertTriangle,
  CheckCircle2, Sparkles, Eye, FileText, Archive,
  ImageIcon, Upload, X, Link2, Calendar,
} from "lucide-react"

type Status = "draft" | "published" | "archived"
type BlogType =
  | "Insights" | "Trends" | "Analysis" | "Guides"
  | "News" | "Press" | "Investment" | "Announcements"

interface Article {
  id?: string
  /** URL slug — backfilled for legacy rows by the 2026-06-20 migration.
   *  Empty string here means "regenerate from headline on next save". */
  slug: string | null
  headline: string
  subheadline: string | null
  content: string | null
  author: string
  blog_type: BlogType
  tags: string[]
  status: Status
  image_url: string | null
  /** Local-input shape is yyyy-MM-ddTHH:mm (HTML datetime-local).
   *  We convert to ISO on save and back to local on load. */
  scheduled_for: string | null
  source_pdf_url: string | null
  published_at: string | null
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

const EMPTY: Article = {
  slug: "",
  headline: "",
  subheadline: "",
  content: "",
  author: "Anker",
  blog_type: "Insights",
  tags: [],
  status: "draft",
  image_url: "",
  scheduled_for: "",
  source_pdf_url: "",
  published_at: null,
}

interface Props {
  /** When supplied, the editor loads /api/admin/newsroom/[id] on mount.
   *  When absent, it shows a blank "new article" form. */
  articleId?: string
}

export function NewsroomEditor({ articleId }: Props) {
  const router = useRouter()
  const [a, setA] = useState<Article>(EMPTY)
  const [tagsInput, setTagsInput] = useState("")
  const [loading, startLoad] = useTransition()
  const [saving, setSaving] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [aiTopic, setAiTopic] = useState("")
  const [previewMode, setPreviewMode] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initialId = useRef(articleId)

  /** Convert "2026-06-30T14:30:00+02:00" → "2026-06-30T14:30" for the
   *  HTML datetime-local input. Returns "" when the field is null/invalid. */
  function isoToLocalInput(iso: string | null | undefined): string {
    if (!iso) return ""
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ""
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  /** Reverse of the above — datetime-local "2026-06-30T14:30" → ISO. */
  function localInputToIso(local: string): string | null {
    if (!local) return null
    const d = new Date(local)
    if (isNaN(d.getTime())) return null
    return d.toISOString()
  }

  useEffect(() => {
    if (!articleId) return
    setError(null)
    startLoad(async () => {
      try {
        const res = await fetch(`/api/admin/newsroom/${articleId}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? `Load failed (${res.status})`)
        const x = data.article as Article
        setA({
          ...x,
          slug: x.slug ?? "",
          subheadline: x.subheadline ?? "",
          content: x.content ?? "",
          image_url: x.image_url ?? "",
          scheduled_for: isoToLocalInput(x.scheduled_for),
          source_pdf_url: x.source_pdf_url ?? "",
          tags: x.tags ?? [],
        })
        setTagsInput((x.tags ?? []).join(", "))
      } catch (e: any) { setError(e?.message ?? "Load failed") }
    })
  }, [articleId])

  /**
   * Pickup path from /dashboard/admin/newsroom/sources — when the operator
   * clicks "Draft article" on a news card there, we stash the AI draft +
   * source attribution in sessionStorage and route here with
   * ?from-source=1. This effect drains the payload into the form on
   * mount so the editor opens already populated.
   */
  useEffect(() => {
    if (articleId) return
    if (typeof window === "undefined") return
    if (!window.location.search.includes("from-source=1")) return
    const raw = sessionStorage.getItem("newsroom:draft-from-source")
    if (!raw) return
    try {
      const payload = JSON.parse(raw)
      setA((p) => ({
        ...p,
        headline: payload.headline ?? p.headline,
        subheadline: payload.subheadline ?? p.subheadline,
        content: payload.content ?? p.content,
        source_pdf_url: payload.sourceUrl ?? p.source_pdf_url,
        // Use the source article's lead image as the newsroom hero
        // image. User can still swap or upload a different one from
        // the editor before publishing.
        image_url: payload.imageUrl ?? p.image_url,
        blog_type: "Analysis" as any,
      }))
      if (Array.isArray(payload.suggestedTags)) {
        setTagsInput(payload.suggestedTags.join(", "))
      }
      setSuccess(
        payload.imageUrl
          ? `Seeded from ${payload.sourceName ?? "external source"} (with lead image). Review, edit, then save.`
          : `Seeded from ${payload.sourceName ?? "external source"}. Review, edit, then save.`
      )
    } catch {}
    finally {
      sessionStorage.removeItem("newsroom:draft-from-source")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set<K extends keyof Article>(key: K, val: Article[K]) {
    setA((p) => ({ ...p, [key]: val }))
  }

  async function save(nextStatus?: Status): Promise<string | null> {
    if (!a.headline.trim()) { setError("Headline is required."); return null }
    setSaving(true); setError(null); setSuccess(null)
    try {
      const tags = tagsInput.split(",").map((s) => s.trim()).filter(Boolean)
      const body: any = {
        headline: a.headline.trim(),
        subheadline: a.subheadline ?? null,
        content: a.content ?? null,
        author: a.author?.trim() || "Anker",
        blogType: a.blog_type,
        tags,
        imageUrl: a.image_url || null,
        // Slug: if user typed something we send it (the server slugifies it
        // and dedupes). Empty string on an existing article means "regenerate
        // from the current headline".
        slug: a.slug ?? "",
        scheduledFor: localInputToIso(a.scheduled_for || ""),
        sourcePdfUrl: a.source_pdf_url || null,
      }
      if (nextStatus) body.status = nextStatus

      let res: Response
      if (articleId) {
        res = await fetch(`/api/admin/newsroom/${articleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      } else {
        body.status = nextStatus ?? a.status
        res = await fetch("/api/admin/newsroom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`)
      const saved = data.article as Article
      setA(saved)
      setTagsInput((saved.tags ?? []).join(", "))
      setSuccess(
        nextStatus === "published" ? "Published."
        : nextStatus === "archived" ? "Archived."
        : "Saved.",
      )
      // If this was a new article, take the user to the edit URL.
      if (!initialId.current && saved.id) {
        router.replace(`/dashboard/admin/newsroom/${saved.id}`)
      }
      return saved.id ?? null
    } catch (e: any) {
      setError(e?.message ?? "Save failed")
      return null
    } finally { setSaving(false) }
  }

  async function remove() {
    if (!articleId) return
    if (!confirm("Delete this article? Cannot be undone.")) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/admin/newsroom/${articleId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? `Delete failed (${res.status})`)
      }
      router.push("/dashboard/admin/newsroom")
    } catch (e: any) { setError(e?.message ?? "Delete failed") }
    finally { setSaving(false) }
  }

  /** Upload a hero image. Sends multipart/form-data to the admin endpoint
   *  which stores via Vercel Blob in prod (or public/newsroom-images/ locally)
   *  and returns the public URL. Sets image_url on success. */
  async function uploadImage(file: File) {
    setUploadingImage(true); setError(null); setSuccess(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/newsroom/upload-image", {
        method: "POST",
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Upload failed (${res.status})`)
      set("image_url", data.url as string)
      setSuccess(`Image uploaded (${(data.size / 1024).toFixed(0)} KB). Save the article to keep this URL.`)
    } catch (e: any) { setError(e?.message ?? "Image upload failed") }
    finally { setUploadingImage(false) }
  }

  async function aiDraft() {
    if (!aiTopic.trim()) { setError("Tell the AI what topic to draft."); return }
    setDrafting(true); setError(null)
    try {
      const res = await fetch("/api/admin/newsroom/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: aiTopic.trim(), blogType: a.blog_type }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `AI draft failed (${res.status})`)
      setA((p) => ({
        ...p,
        headline: data.headline ?? p.headline,
        subheadline: data.subheadline ?? p.subheadline,
        content: data.content ?? p.content,
      }))
      const merged = Array.from(new Set([...(a.tags ?? []), ...(data.suggestedTags ?? [])]))
      setTagsInput(merged.join(", "))
      setSuccess("AI draft loaded into the editor — review before saving.")
    } catch (e: any) { setError(e?.message ?? "AI draft failed") }
    finally { setDrafting(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/dashboard/admin/newsroom"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> All articles
        </Link>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {articleId ? `editing · ${a.status}` : "new article"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {articleId && a.status === "published" && (
            <Link
              href={`/newsroom/${a.slug || articleId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5"
            >
              <Eye className="w-4 h-4" /> View public
            </Link>
          )}
          <button
            type="button"
            onClick={() => setPreviewMode((p) => !p)}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5"
          >
            {previewMode ? <Pencil /> : <Eye className="w-4 h-4" />}
            {previewMode ? "Edit" : "Preview"}
          </button>
          <button
            type="button"
            onClick={() => save()}
            disabled={saving}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save draft
          </button>
          {a.status !== "published" ? (
            <button
              type="button"
              onClick={() => save("published")}
              disabled={saving}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Publish
            </button>
          ) : (
            <button
              type="button"
              onClick={() => save("draft")}
              disabled={saving}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Unpublish
            </button>
          )}
          {articleId && (
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className="p-2 rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-md text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="text-rose-700 dark:text-rose-400">{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-md text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span className="text-emerald-700 dark:text-emerald-400">{success}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Main form */}
        <div className="space-y-4">
          <Field label="Headline" required>
            <input
              type="text"
              value={a.headline}
              onChange={(e) => set("headline", e.target.value)}
              placeholder="Why founders raising in 2026 should rebuild their pipeline"
              className="w-full h-11 px-3 text-base font-display border border-foreground/15 rounded-md bg-background"
            />
          </Field>
          <Field label="Subheadline" hint="Shown under the title on the article page.">
            <input
              type="text"
              value={a.subheadline ?? ""}
              onChange={(e) => set("subheadline", e.target.value)}
              placeholder="One sentence that earns the click."
              className="w-full h-10 px-3 text-sm border border-foreground/15 rounded-md bg-background"
            />
          </Field>
          <Field label="Content (Markdown)" hint="H2 = ##, H3 = ###. The newsroom renders Markdown.">
            {previewMode ? (
              <div className="min-h-[400px] p-4 text-sm leading-relaxed border border-foreground/10 rounded-md bg-foreground/[0.02] whitespace-pre-wrap">
                {a.content ?? <span className="italic text-muted-foreground">No content yet.</span>}
              </div>
            ) : (
              <textarea
                value={a.content ?? ""}
                onChange={(e) => set("content", e.target.value)}
                rows={20}
                placeholder="## Why pipeline matters in 2026\n\nFounders…"
                className="w-full p-3 text-sm font-mono leading-relaxed border border-foreground/15 rounded-md bg-background"
              />
            )}
          </Field>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="border border-foreground/10 rounded-lg p-4 space-y-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> AI draft (local model)
            </div>
            <input
              type="text"
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              placeholder="Topic, e.g. 'how emerging GPs should think about reserves'"
              className="w-full h-9 px-3 text-xs border border-foreground/15 rounded-md bg-background"
            />
            <button
              type="button"
              onClick={aiDraft}
              disabled={drafting || !aiTopic.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
            >
              {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Draft with local AI
            </button>
            <p className="text-[10px] text-muted-foreground">
              Uses the deep tier (qwen2.5:14b by default).  Output replaces the headline / subheadline / content fields — review before publishing.
            </p>
          </div>

          <Field label="Author">
            <input
              type="text"
              value={a.author}
              onChange={(e) => set("author", e.target.value)}
              className="w-full h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background"
            />
          </Field>
          <Field label="Type">
            <select
              value={a.blog_type}
              onChange={(e) => set("blog_type", e.target.value as BlogType)}
              className="w-full h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background"
            >
              <option>Insights</option>
              <option>Trends</option>
              <option>Analysis</option>
              <option>Guides</option>
              <option>News</option>
              <option>Press</option>
              <option>Investment</option>
              <option>Announcements</option>
            </select>
          </Field>
          <Field label="Tags" hint="Comma-separated.">
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="fundraising, lps, pipeline"
              className="w-full h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background"
            />
          </Field>
          <Field label="Hero image" hint="Upload a JPG/PNG/WebP (≤5 MB) or paste a URL.">
            <div className="space-y-2">
              {a.image_url ? (
                <div className="relative border border-foreground/15 rounded-md overflow-hidden bg-foreground/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.image_url}
                    alt="Hero preview"
                    className="w-full h-32 object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.3" }}
                  />
                  <button
                    type="button"
                    onClick={() => set("image_url", "")}
                    className="absolute top-1 right-1 p-1 rounded bg-background/90 border border-foreground/15 hover:bg-background"
                    title="Remove image"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="border border-dashed border-foreground/20 rounded-md h-32 flex items-center justify-center text-muted-foreground text-xs">
                  <ImageIcon className="w-4 h-4 mr-1.5" /> No hero image
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
                >
                  {uploadingImage
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</>
                    : <><Upload className="w-3 h-3" /> Upload</>}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) uploadImage(f)
                    // Reset so re-selecting the same file fires onChange.
                    e.target.value = ""
                  }}
                />
              </div>
              <input
                type="url"
                value={a.image_url ?? ""}
                onChange={(e) => set("image_url", e.target.value)}
                placeholder="…or paste an https:// URL"
                className="w-full h-8 px-2 text-xs border border-foreground/15 rounded-md bg-background font-mono"
              />
            </div>
          </Field>
          <Field label="URL slug" hint="Auto-generated from headline. Leave blank to regenerate.">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] text-muted-foreground shrink-0">/newsroom/</span>
              <input
                type="text"
                value={a.slug ?? ""}
                onChange={(e) => set("slug", e.target.value)}
                placeholder="auto-from-headline"
                className="flex-1 h-9 px-2.5 text-sm border border-foreground/15 rounded-md bg-background font-mono"
              />
            </div>
          </Field>
          <Field label="Scheduled publish" hint="Optional — promotes draft to published at this time.">
            <input
              type="datetime-local"
              value={a.scheduled_for ?? ""}
              onChange={(e) => set("scheduled_for", e.target.value)}
              className="w-full h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background"
            />
          </Field>
          <Field label="Source PDF URL" hint="Optional — surfaced in the article sidebar.">
            <input
              type="url"
              value={a.source_pdf_url ?? ""}
              onChange={(e) => set("source_pdf_url", e.target.value)}
              placeholder="https://…/source.pdf"
              className="w-full h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background"
            />
          </Field>
          {articleId && (
            <div className="text-[10px] font-mono text-muted-foreground space-y-0.5 pt-2 border-t border-foreground/10">
              <div>id: <span className="select-all">{articleId}</span></div>
              {a.created_by && <div>by: {a.created_by}</div>}
              {a.published_at && <div>published: {new Date(a.published_at).toLocaleString()}</div>}
              {a.updated_at && <div>updated: {new Date(a.updated_at).toLocaleString()}</div>}
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading article…
        </div>
      )}
    </div>
  )
}

function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs">{label} {required && <span className="text-rose-600">*</span>}</span>
        {hint && <span className="text-[10px] font-mono text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

// Tiny inline icon — avoids adding another lucide import
function Pencil() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24"><path d="M12 20h9" strokeLinecap="round" strokeLinejoin="round"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" strokeLinecap="round" strokeLinejoin="round"/></svg>
}
