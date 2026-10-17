"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

const KINDS: Array<[string, string]> = [["redemption", "Withdrawal or redemption"], ["transfer", "Transfer of my interest"], ["details_change", "Change of my details (address, bank, name)"], ["other", "Something else"]]
export interface DoorState { state: "none" | "linked"; email: string | null; others: number }
export interface MyRequest { kind: string; body: string; at: string; status: string }

/** The optional account (docs/architecture/60 section 4): for an investor with several funds, or who prefers to sign in. The portal link keeps working either way. */
export function LpAccountDoor({ token, door }: { token: string; door: DoorState }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [done, setDone] = useState<{ created: boolean } | null>(null)
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const f = new FormData(e.currentTarget)
    const r = await fetch(`/api/portal/${token}/account`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: f.get("password") }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(j.error ?? "That did not work. Please try again."); return }
    setDone({ created: !!j.created }); router.refresh()
  }
  if (door.state === "linked" || done) return (
    <section className="rounded-xl border p-5 text-sm" aria-labelledby="door-h"><h2 id="door-h" className="text-lg font-semibold">Your account</h2>
      <p className="mt-1">{done?.created ? "Your account is ready." : "This investment is on your account."} Sign in with <strong>{door.email}</strong> at <a className="underline" href="/auth/login?redirect=/lp">the sign-in page</a> to see all your funds in one place. Your personal link keeps working too.</p></section>)
  return (
    <section className="rounded-xl border p-5 text-sm" aria-labelledby="door-h">
      <h2 id="door-h" className="text-lg font-semibold">Sign in without the link (optional)</h2>
      {door.others > 0 ? (
        <form onSubmit={submit} className="mt-2 space-y-2"><p>You already have an account for <strong>{door.email}</strong> from another fund. Add this one to it.</p><button className="h-9 rounded-md border px-4 disabled:opacity-50" disabled={busy}>Add this fund to my account</button></form>
      ) : (
        <form onSubmit={submit} className="mt-2 space-y-2">
          <p className="text-muted-foreground">Make an account for <strong>{door.email}</strong> so you can sign in with a password and see all your funds together. You do not need one: your personal link and the emailed code always work.</p>
          <label className="block">Choose a password (at least 10 characters)<input type="password" name="password" required minLength={10} autoComplete="new-password" className="mt-1 h-9 w-full max-w-sm rounded-md border bg-transparent px-3" /></label>
          <button className="h-9 rounded-md border px-4 disabled:opacity-50" disabled={busy}>Create my account</button>
        </form>)}
      {msg && <p role="alert" className="mt-2 text-red-600">{msg}</p>}
    </section>
  )
}

/** Ask the fund for something the portal cannot do itself. The fund sees it in your own words (docs/architecture/60 section 8). */
export function LpRequestCard({ token, initial }: { token: string; initial: MyRequest[] }) {
  const [mine, setMine] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const form = e.currentTarget; const f = new FormData(form)
    const r = await fetch(`/api/portal/${token}/request`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: f.get("kind"), body: f.get("body") }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(j.error ?? "That did not work. Please try again."); return }
    setMine(j.requests ?? mine); setMsg("Sent. The fund will get back to you."); form.reset()
  }
  return (
    <section className="rounded-xl border p-5 text-sm" aria-labelledby="req-h">
      <h2 id="req-h" className="text-lg font-semibold">Ask the fund</h2>
      <p className="mt-1 text-muted-foreground">For things this portal cannot do for you, such as a withdrawal, a transfer or a change of your details. Nothing changes until the fund has dealt with it.</p>
      <form onSubmit={submit} className="mt-3 space-y-2">
        <label className="block">About<select name="kind" required defaultValue="" className="mt-1 h-9 w-full max-w-md rounded-md border bg-transparent px-2"><option value="" disabled>Choose…</option>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="block">Your message<textarea name="body" required minLength={5} maxLength={1000} rows={3} className="mt-1 w-full rounded-md border bg-transparent px-3 py-2" /></label>
        <button className="h-9 rounded-md border px-4 disabled:opacity-50" disabled={busy}>Send to the fund</button>
      </form>
      {msg && <p role="status" className="mt-2">{msg}</p>}
      {mine.length > 0 && <ul className="mt-3 divide-y">{mine.map((r, i) => <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5"><span>{r.at} · {KINDS.find(([v]) => v === r.kind)?.[1] ?? r.kind}: <span className="text-muted-foreground">{r.body}</span></span><span className="text-xs">{r.status}</span></li>)}</ul>}
    </section>
  )
}
