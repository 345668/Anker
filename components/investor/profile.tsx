"use client"
import { useCallback, useEffect, useState } from "react"
import { call, field, btn, btnGhost } from "./api"

const KINDS = [["individual", "Individual"], ["company", "Company"], ["trust", "Trust"], ["fund", "Fund"], ["family_office", "Family office"]]
const CATS = [["", "Not stated"], ["professional", "Professional investor"], ["semi_professional", "Semi-professional investor"], ["other", "Other"], ["unsure", "I am not sure"]]
const list = (a?: string[]) => (a ?? []).join(", ")
const emptyForm = { legalName: "", kind: "individual", country: "", taxResidence: "", category: "", sectors: "", stages: "", geographies: "", ticketMin: "", ticketMax: "", horizonYears: "" }

function toForm(e: any) { const i = e.interests ?? {}; return { legalName: e.legalName, kind: e.kind, country: e.country ?? "", taxResidence: e.taxResidence ?? "", category: e.category ?? "", sectors: list(i.sectors), stages: list(i.stages), geographies: list(i.geographies), ticketMin: i.ticketMin ?? "", ticketMax: i.ticketMax ?? "", horizonYears: i.horizonYears ?? "" } }
const toBody = (f: typeof emptyForm) => ({ legalName: f.legalName, kind: f.kind, country: f.country || null, taxResidence: f.taxResidence || null, category: f.category || null,
  interests: { sectors: f.sectors, stages: f.stages, geographies: f.geographies, ticketMin: f.ticketMin === "" ? null : f.ticketMin, ticketMax: f.ticketMax === "" ? null : f.ticketMax, horizonYears: f.horizonYears === "" ? null : f.horizonYears } })

function EntityEditor({ entity, onSaved, onCancel }: { entity: any | null; onSaved: () => void; onCancel: () => void }) {
  const [f, setF] = useState<any>(entity ? toForm(entity) : emptyForm), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value })
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try { await call(entity ? `/api/investor/entities/${entity.id}` : "/api/investor/entities", { method: entity ? "PUT" : "POST", body: toBody(f) }); onSaved() } catch (x) { setErr(x instanceof Error ? x.message : "Try again.") } finally { setBusy(false) }
  }
  return <form onSubmit={save} className="space-y-3 rounded-lg border p-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Name<input className={field} value={f.legalName} onChange={set("legalName")} required /></label>
      <label className="text-sm">Kind<select className={field} value={f.kind} onChange={set("kind")}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="text-sm">Country<input className={field} value={f.country} onChange={set("country")} /></label>
      <label className="text-sm">Tax residence<input className={field} value={f.taxResidence} onChange={set("taxResidence")} /></label>
      <label className="text-sm sm:col-span-2">Investor category (as you declare it; the fund may ask for proof)<select className={field} value={f.category} onChange={set("category")}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    </div>
    <p className="text-sm font-medium">What you look for</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Sectors (comma separated)<input className={field} value={f.sectors} onChange={set("sectors")} placeholder="climate, AI" /></label>
      <label className="text-sm">Stages<input className={field} value={f.stages} onChange={set("stages")} placeholder="seed, series a" /></label>
      <label className="text-sm">Regions or countries<input className={field} value={f.geographies} onChange={set("geographies")} placeholder="Europe" /></label>
      <label className="text-sm">Time horizon (years)<input className={field} inputMode="numeric" value={f.horizonYears} onChange={set("horizonYears")} /></label>
      <label className="text-sm">Smallest cheque<input className={field} inputMode="numeric" value={f.ticketMin} onChange={set("ticketMin")} /></label>
      <label className="text-sm">Largest cheque<input className={field} inputMode="numeric" value={f.ticketMax} onChange={set("ticketMax")} /></label>
    </div>
    {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
    <div className="flex gap-2"><button className={btn} disabled={busy}>{busy ? "Saving…" : "Save"}</button><button type="button" className={btnGhost} onClick={onCancel}>Cancel</button></div>
  </form>
}

export function InvestorProfile() {
  const [d, setD] = useState<any>(null), [err, setErr] = useState<string | null>(null), [editing, setEditing] = useState<string | null>(null), [adding, setAdding] = useState(false)
  const [p, setP] = useState({ displayName: "", country: "", languages: "", about: "" }), [saved, setSaved] = useState(false)
  const load = useCallback(async () => {
    try { const r = await call("/api/investor/profile"); setD(r); setP({ displayName: r.profile.displayName, country: r.profile.country ?? "", languages: list(r.profile.languages), about: r.profile.about ?? "" }) } catch (e) { setErr(e instanceof Error ? e.message : "Could not load.") }
  }, [])
  useEffect(() => { void load() }, [load])
  if (err) return <p role="alert">{err}</p>
  if (!d) return <p role="status">Loading…</p>
  async function saveProfile(e: React.FormEvent) { e.preventDefault(); setSaved(false); try { await call("/api/investor/profile", { method: "PATCH", body: p }); setSaved(true) } catch (x) { setErr(x instanceof Error ? x.message : "Try again.") } }
  async function remove(id: string) { try { await call(`/api/investor/entities/${id}`, { method: "DELETE" }); await load() } catch (x) { setErr(x instanceof Error ? x.message : "Try again.") } }
  const done = async () => { setEditing(null); setAdding(false); await load() }
  return <div className="space-y-10">
    <section><h1 className="text-xl font-semibold">Your profile</h1>
      <form onSubmit={saveProfile} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Display name<input className={field} value={p.displayName} onChange={(e) => setP({ ...p, displayName: e.target.value })} required /></label>
        <label className="text-sm">Country<input className={field} value={p.country} onChange={(e) => setP({ ...p, country: e.target.value })} /></label>
        <label className="text-sm">Languages<input className={field} value={p.languages} onChange={(e) => setP({ ...p, languages: e.target.value })} /></label>
        <label className="text-sm sm:col-span-2">About you<textarea className={field} rows={3} value={p.about} onChange={(e) => setP({ ...p, about: e.target.value })} /></label>
        <div className="flex items-center gap-3"><button className={btn}>Save profile</button>{saved && <span role="status" className="text-sm">Saved.</span>}</div>
      </form></section>
    <section><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Who invests</h2>{!adding && <button className={btnGhost} onClick={() => setAdding(true)}>Add an entity</button>}</div>
      <p className="mt-1 text-sm text-muted-foreground">You can invest as yourself, through a company or a trust. Each has its own category and interests.</p>
      <div className="mt-4 space-y-3">
        {adding && <EntityEditor entity={null} onSaved={done} onCancel={() => setAdding(false)} />}
        {d.entities.map((e: any) => editing === e.id ? <EntityEditor key={e.id} entity={e} onSaved={done} onCancel={() => setEditing(null)} /> :
          <div key={e.id} className="flex items-start justify-between rounded-lg border p-4 text-sm">
            <div><p className="font-medium">{e.legalName} <span className="font-normal text-muted-foreground">· {e.kind.replace("_", " ")}{e.country ? ` · ${e.country}` : ""}</span></p>
              <p className="text-muted-foreground">{e.category ? `Declares: ${e.category.replace("_", " ")}` : "Category not stated"} · {e.interests.sectors.length ? e.interests.sectors.join(", ") : "no sectors yet"}</p></div>
            <div className="flex gap-2"><button className={btnGhost} onClick={() => setEditing(e.id)}>Edit</button><button className={btnGhost} onClick={() => remove(e.id)}>Remove</button></div>
          </div>)}
      </div></section>
  </div>
}
