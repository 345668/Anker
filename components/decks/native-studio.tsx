"use client"
import { useEffect, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { swrFetcher } from "@/lib/http/client"
import type { StudioDeck, StudioSlide, STUDIO_TEMPLATES } from "@/lib/decks/studio-model"

const button = "rounded-lg border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
async function download(url: string, fallback: string) {
  const response = await fetch(url)
  if (!response.ok) { const body = await response.json(); throw new Error(body.error || "Download failed.") }
  const blob = await response.blob(), objectUrl = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = objectUrl
  a.download = response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || fallback
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
export function NativeStudio({ deckId, orgId }: { deckId?: string; orgId: string }) {
  const router = useRouter()
  const { data, error, mutate } = useSWR<{ decks: StudioDeck[]; templates: typeof STUDIO_TEMPLATES; context: { orgId: string; name: string }; rounds: { id: string; name: string }[]; canWrite: boolean }>(`/api/decks?orgId=${encodeURIComponent(orgId)}`, swrFetcher)
  const { data: detail, error: detailError, mutate: reloadDeck } = useSWR<{ deck: StudioDeck }>(deckId ? `/api/decks/${deckId}?orgId=${encodeURIComponent(orgId)}` : null, swrFetcher)
  const [draft, setDraft] = useState<StudioDeck | null>(null)
  const [active, setActive] = useState(0), [busy, setBusy] = useState(false), [message, setMessage] = useState("")
  const [actionError, setActionError] = useState("")
  useEffect(() => { setDraft(null); setActive(0); setMessage(""); setActionError("") }, [deckId])
  const deck = draft || detail?.deck
  const dirty = !!draft
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  async function run(action: () => Promise<void>) {
    setBusy(true); setActionError(""); setMessage("")
    try { await action() } catch (e) { setActionError(e instanceof Error ? e.message : "Request failed. Try again.") }
    finally { setBusy(false) }
  }
  async function save(): Promise<StudioDeck> {
    if (!deck) throw new Error("Deck unavailable.")
    if (!draft) return deck
    const res = await fetch(`/api/decks/${deck.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...deck, orgId: deck.context.orgId, roundId: deck.context.roundId }) })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || "Could not save the deck.")
    await reloadDeck({ deck: body.deck }, { revalidate: false }); setDraft(null); void mutate()
    return body.deck
  }
  function editSlide(patch: Partial<StudioSlide>) {
    if (deck) setDraft({ ...deck, slides: deck.slides.map((s, i) => i === active ? { ...s, ...patch } : s) })
  }
  if (error || detailError) return <div role="alert" className="p-8">Deck Studio could not be loaded. <button className="underline" onClick={() => { void mutate(); void reloadDeck() }}>Try again</button><p className="mt-3"><Link href="/dashboard/decks" className="underline">Open native Deck Studio</Link></p><p className="mt-3 text-sm text-muted-foreground">Legacy Figma projects remain stored separately and do not open in the native editor.</p></div>
  if (!data || (deckId && !deck)) return <p role="status" className="p-8">Loading Deck Studio…</p>
  const selectedSlide = deck?.slides[active]
  return <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-8">
    <header><p className="text-xs uppercase tracking-widest text-muted-foreground">{data.context.name} / Deck Studio</p><h1 className="mt-3 font-serif text-4xl">{deck ? "Shape your investment story" : "A clear story, ready to share"}</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">Edit slides in Anker. Download an editable PowerPoint, a presentation PDF, or a Word brief with speaker notes.</p></header>
    {actionError && <p role="alert" className="rounded-lg border border-destructive p-3 text-destructive">{actionError}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {!deck ? <>
      <section aria-label="Sample templates" className="grid gap-6 md:grid-cols-2">{data.templates.map(t => <article key={t.key} className="border p-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Sample / {t.slides.length} slides</p><h2 className="mt-4 font-serif text-2xl">{t.name}</h2><p className="my-4 text-sm text-muted-foreground">{t.description}</p>
        <button className={button} disabled={busy || !data.canWrite} onClick={() => void run(async () => {
          const res = await fetch("/api/decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateKey: t.key, orgId: data.context.orgId }) }); const body = await res.json()
          if (!res.ok) throw new Error(body.error); router.push(`/dashboard/decks/${body.deck.id}`)
        })}>Use this template</button>
        <div className="mt-4 flex flex-wrap gap-3">{["pptx", "pdf", "docx"].map(format => <button key={format} disabled={busy} className="text-sm underline" onClick={() => void run(() => download(`/api/decks/samples?template=${t.key}&format=${format}`, `sample.${format}`))}>Sample {format.toUpperCase()}</button>)}</div>
      </article>)}</section>
      <section><h2 className="mb-4 font-serif text-2xl">Your workspace decks</h2>{!data.decks.length ? <p className="text-muted-foreground">Choose a sample above to start your first deck.</p> : <ul className="divide-y">{data.decks.map(d => <li key={d.id}><Link className="flex items-center justify-between gap-4 py-4 hover:underline" href={`/dashboard/decks/${d.id}`}><span>{d.title}</span><span className="text-xs text-muted-foreground">Revision {d.revision}</span></Link></li>)}</ul>}</section>
    </> : <>
      <div className="flex flex-wrap items-center gap-3">
        <button className={button} disabled={busy} onClick={() => { if (!dirty || window.confirm("Leave without saving your deck edits?")) router.push("/dashboard/decks") }}>All decks</button>
        <span role="status" className="text-sm text-muted-foreground">{dirty ? "Unsaved changes" : `Saved revision ${deck.revision}`}</span>
        <button className={button} disabled={busy || !data.canWrite || !dirty} onClick={() => void run(async () => { await save(); setMessage("Deck saved.") })}>Save changes</button>
        {["pptx", "pdf", "docx"].map(format => <button key={format} className={button} disabled={busy || (!data.canWrite && dirty)} onClick={() => void run(async () => { const saved = await save(); await download(`/api/decks/${saved.id}/export?format=${format}&revision=${saved.revision}`, `deck.${format}`); setMessage("Download ready.") })}>Download {format.toUpperCase()}</button>)}
      </div>
      <fieldset disabled={busy} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Deck title<input disabled={!data.canWrite} maxLength={100} className="mt-1 w-full rounded border bg-background p-3" value={deck.title} onChange={e => setDraft({ ...deck, title: e.target.value })} /></label>
          <label className="text-sm">Saved context<select disabled={!data.canWrite} className="mt-1 w-full rounded border bg-background p-3" value={deck.context.roundId || ""} onChange={e => setDraft({ ...deck, context: { ...deck.context, roundId: e.target.value || null } })}><option value="">{data.context.name}</option>{data.rounds.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label></div>
        <p className="text-sm text-muted-foreground">Sample slides contain prompts, not verified company metrics. Review and replace them before sharing. Context is saved with the deck; changing it does not overwrite your slide text.</p>
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <nav aria-label="Slides" className="flex gap-2 overflow-x-auto lg:block lg:space-y-2">{deck.slides.map((s, i) => <button type="button" key={i} aria-current={active === i ? "step" : undefined} className={`${button} min-w-40 text-left lg:w-full ${active === i ? "bg-muted font-semibold" : ""}`} onClick={() => setActive(i)}>{i + 1}. {s.title}</button>)}
            <button className={`${button} min-w-40`} disabled={!data.canWrite || deck.slides.length >= 30} onClick={() => { setDraft({ ...deck, slides: [...deck.slides, { kind: "content", title: "New slide", subtitle: "", bullets: [], notes: "" }] }); setActive(deck.slides.length) }}>Add slide</button></nav>
          {selectedSlide && <section className="space-y-4">
            <div aria-label="Slide preview" className="min-h-64 border bg-white p-6 text-[#142B40] sm:p-10"><p className="text-xs uppercase tracking-widest text-[#52667A]">ANKER / {active + 1}</p><h2 className="mt-6 break-words font-serif text-3xl">{selectedSlide.title}</h2><p className="mt-3 break-words text-[#52667A]">{selectedSlide.subtitle}</p><ul className="mt-6 list-disc space-y-3 pl-5">{selectedSlide.bullets.map((b, i) => <li className="break-words" key={i}>{b}</li>)}</ul></div>
            <label className="block text-sm">Slide title<input disabled={!data.canWrite} maxLength={100} value={selectedSlide.title} onChange={e => editSlide({ title: e.target.value })} className="mt-1 w-full rounded border bg-background p-3" /></label>
            <label className="block text-sm">Subtitle<input disabled={!data.canWrite} maxLength={160} value={selectedSlide.subtitle} onChange={e => editSlide({ subtitle: e.target.value })} className="mt-1 w-full rounded border bg-background p-3" /></label>
            {selectedSlide.kind === "content" && <label className="block text-sm">Body points (up to 5 lines, 180 characters each)<textarea disabled={!data.canWrite} rows={5} value={selectedSlide.bullets.join("\n")} onChange={e => editSlide({ bullets: e.target.value.split("\n") })} className="mt-1 w-full rounded border bg-background p-3" /></label>}
            <label className="block text-sm">Speaker notes (included in PowerPoint and Word)<textarea disabled={!data.canWrite} maxLength={5000} rows={3} value={selectedSlide.notes} onChange={e => editSlide({ notes: e.target.value })} className="mt-1 w-full rounded border bg-background p-3" /></label>
            <button className={button} disabled={!data.canWrite || deck.slides.length <= 1} onClick={() => { setDraft({ ...deck, slides: deck.slides.filter((_, i) => i !== active) }); setActive(Math.max(0, active - 1)) }}>Remove slide</button>
          </section>}
        </div>
      </fieldset>
    </>}
  </main>
}
