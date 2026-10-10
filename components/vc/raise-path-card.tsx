"use client"
import Link from "next/link"
import { useState } from "react"
import { ArrowRight, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SendReview } from "@/components/outreach/send-review"
import type { RaiseState } from "@/lib/vc/raise-path"

interface Wave {
  proposed: number
  skipped: Array<{ name: string; reason: string }>
  stoppedAtLimit: boolean
}
interface Notice {
  kind: "drafts" | "shortlist" | "linkedin" | "fund"
  text: string
  link?: { href: string; label: string }
  detail?: string
}
const field =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

async function post<T>(url: string, body: unknown = {}): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || "That did not work. Try again.")
  return j as T
}

/** "Raise your fund" (docs/architecture/50): the six steps from an empty fund workspace to a first approved wave of LP outreach, with one next action. */
export function RaisePathCard({ initial }: { initial: RaiseState }) {
  const [state, setState] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [error, setError] = useState("")
  const [reviewing, setReviewing] = useState(false)
  const [form, setForm] = useState(
    initial.fund?.form ?? {
      name: "",
      gpName: "",
      targetRaise: "",
      thesis: "",
      sectors: "",
      geography: "",
      hq: "",
    },
  )
  const done = state.steps.filter((s) => s.done && s.id !== "follow").length
  const total = state.steps.length - 1
  async function refresh() {
    try {
      const r = await fetch("/api/vc/raise-path", { cache: "no-store" })
      if (r.ok) setState(await r.json())
    } catch {}
  }
  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    setError("")
    setNotice(null)
    try {
      await fn()
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const writeDrafts = () =>
    run("drafts", async () => {
      const w = await post<Wave>("/api/vc/raise-path/drafts")
      setNotice({
        kind: "drafts",
        text:
          w.proposed === 0
            ? "No drafts were written."
            : `${w.proposed} draft${w.proposed === 1 ? "" : "s"} written and waiting for your approval. Nothing has been sent.`,
        link: w.proposed > 0 ? { href: "/dashboard/actions", label: "Review them in Actions" } : undefined,
        detail: w.skipped.length
          ? `Skipped: ${w.skipped
              .slice(0, 4)
              .map((s) => `${s.name} (${s.reason})`)
              .join("; ")}${w.skipped.length > 4 ? `, and ${w.skipped.length - 4} more` : ""}.`
          : undefined,
      })
    })
  const shortlist = () =>
    run("shortlist", async () => {
      const r = await post<{ added: number; alreadyThere: number; noRun: boolean }>(
        "/api/vc/raise-path/shortlist",
      )
      setNotice({
        kind: "shortlist",
        text: r.noRun
          ? "Run LP matching first: there is no finished run to take LPs from."
          : r.added === 0
            ? `Nobody new to add: ${r.alreadyThere} were already in your pipeline.`
            : `${r.added} LP${r.added === 1 ? "" : "s"} added to your pipeline${r.alreadyThere ? `; ${r.alreadyThere} were already there` : ""}.`,
      })
    })
  const queueLinkedIn = () =>
    run("linkedin", async () => {
      const r = await post<{ queued: number; skipped: Array<{ name: string; reason: string }> }>(
        "/api/vc/raise-path/linkedin",
      )
      setNotice({
        kind: "linkedin",
        text:
          r.queued === 0
            ? "No LinkedIn messages were queued."
            : `${r.queued} LinkedIn message${r.queued === 1 ? "" : "s"} queued as connection requests, waiting for your approval. Nothing has been sent.`,
        link:
          r.queued > 0
            ? { href: "/dashboard/linkedin/review", label: "Review them in the LinkedIn queue" }
            : undefined,
        detail: r.skipped.length
          ? `Skipped: ${r.skipped
              .slice(0, 3)
              .map((s) => `${s.name} (${s.reason})`)
              .join("; ")}.`
          : undefined,
      })
    })
  const saveFund = () =>
    run("fund", async () => {
      const raise = form.targetRaise.replace(/[^0-9.]/g, "")
      await post("/api/vc/raise-path/fund", {
        name: form.name,
        gpName: form.gpName,
        targetRaise: raise ? Number(raise) : undefined,
        thesisDescription: form.thesis,
        sectors: form.sectors,
        geographicFocus: form.geography,
        headquartersLocation: form.hq,
      })
      setNotice({ kind: "fund", text: "Fund profile saved." })
    })
  const next = state.next
  const c = state.counts
  return (
    <section
      id="raise-path"
      aria-label="Raise your fund"
      className="mb-8 rounded-xl border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Raise your fund</h2>
        <p className="text-sm text-muted-foreground">
          {done} of {total} steps done · about 15 minutes to a first wave you can approve
        </p>
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {state.steps.map((s, i) => (
          <li
            key={s.id}
            className={`rounded-lg border p-3 text-sm ${next?.id === s.id ? "border-primary ring-1 ring-primary/40" : ""}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${s.done ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {s.done ? <Check className="size-3" aria-label="done" /> : i + 1}
              </span>
              <span className="font-medium leading-tight">{s.label}</span>
            </div>
          </li>
        ))}
      </ol>
      {next && (
        <div className="mt-5 rounded-lg bg-muted/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 max-w-2xl">
              <p className="text-sm font-medium">Next: {next.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{next.detail}</p>
            </div>
            {next.action === "profile" ? null : next.action === "send" ? (
              <Button onClick={() => setReviewing(true)} className="min-h-11 gap-2">
                {next.button} <ArrowRight className="size-4" />
              </Button>
            ) : next.action === "drafts" ? (
              <Button
                onClick={() => void writeDrafts()}
                disabled={!!busy || c.draftable === 0}
                className="min-h-11 gap-2"
              >
                {busy === "drafts" ? <Loader2 className="size-4 animate-spin" /> : null}
                {busy === "drafts" ? "Writing…" : next.button}
              </Button>
            ) : next.action === "shortlist" ? (
              <Button onClick={() => void shortlist()} disabled={!!busy} className="min-h-11 gap-2">
                {busy === "shortlist" ? <Loader2 className="size-4 animate-spin" /> : null}
                {busy === "shortlist" ? "Adding…" : next.button}
              </Button>
            ) : next.href ? (
              <Button asChild className="min-h-11">
                <Link href={next.href}>
                  {next.button} <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            ) : null}
          </div>
          {next.action === "profile" && (
            <form
              className="mt-4 grid gap-3 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault()
                void saveFund()
              }}
            >
              <label className="text-sm">
                Fund name
                <input
                  className={`${field} mt-1`}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={200}
                  required
                />
              </label>
              <label className="text-sm">
                Your name (General Partner)
                <input
                  className={`${field} mt-1`}
                  value={form.gpName}
                  onChange={(e) => setForm({ ...form, gpName: e.target.value })}
                  maxLength={200}
                />
              </label>
              <label className="text-sm">
                Target raise (a number, for example 5000000)
                <input
                  className={`${field} mt-1`}
                  inputMode="numeric"
                  value={form.targetRaise}
                  onChange={(e) => setForm({ ...form, targetRaise: e.target.value })}
                />
              </label>
              <label className="text-sm">
                Based in
                <input
                  className={`${field} mt-1`}
                  value={form.hq}
                  onChange={(e) => setForm({ ...form, hq: e.target.value })}
                  maxLength={200}
                />
              </label>
              <label className="text-sm sm:col-span-2">
                Thesis, in two or three sentences
                <textarea
                  className={`${field} mt-1 min-h-20`}
                  value={form.thesis}
                  onChange={(e) => setForm({ ...form, thesis: e.target.value })}
                  maxLength={2000}
                />
              </label>
              <label className="text-sm">
                Sectors (comma separated)
                <input
                  className={`${field} mt-1`}
                  value={form.sectors}
                  onChange={(e) => setForm({ ...form, sectors: e.target.value })}
                />
              </label>
              <label className="text-sm">
                Geography (comma separated)
                <input
                  className={`${field} mt-1`}
                  value={form.geography}
                  onChange={(e) => setForm({ ...form, geography: e.target.value })}
                />
              </label>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                <Button type="submit" disabled={!!busy} className="min-h-11 gap-2">
                  {busy === "fund" ? <Loader2 className="size-4 animate-spin" /> : null}
                  {busy === "fund" ? "Saving…" : "Save the fund profile"}
                </Button>
                <Link href="/dashboard/matchmaking" className="text-sm underline">
                  Or upload the fund deck and fill it automatically
                </Link>
              </div>
            </form>
          )}
        </div>
      )}
      {(c.linkedinReady > 0 || c.linkedinPending > 0) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <p>
            <span className="font-medium">LinkedIn:</span>{" "}
            {c.linkedinReady > 0
              ? `${c.linkedinReady} saved message${c.linkedinReady === 1 ? "" : "s"} ready to queue as connection requests.`
              : null}{" "}
            {c.linkedinPending > 0
              ? `${c.linkedinPending} waiting for your approval in the LinkedIn queue.`
              : null}
          </p>
          <div className="flex gap-2">
            {c.linkedinReady > 0 && (
              <Button variant="outline" size="sm" onClick={() => void queueLinkedIn()} disabled={!!busy}>
                {busy === "linkedin" ? "Queuing…" : "Queue for review"}
              </Button>
            )}
            {c.linkedinPending > 0 && (
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/linkedin/review">Open the queue</Link>
              </Button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <div role="status" className="mt-3 text-sm">
          <p>
            {notice.text}{" "}
            {notice.link && (
              <Link href={notice.link.href} className="underline">
                {notice.link.label}
              </Link>
            )}
          </p>
          {notice.detail && <p className="mt-1 text-muted-foreground">{notice.detail}</p>}
        </div>
      )}
      {reviewing && (
        <SendReview
          messageIds={state.draftEmailIds}
          onClose={() => setReviewing(false)}
          onDone={() => void refresh()}
        />
      )}
    </section>
  )
}
