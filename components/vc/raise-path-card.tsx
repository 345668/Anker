"use client"
import Link from "next/link"
import { useState } from "react"
import { ArrowRight, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { RaiseState } from "@/lib/vc/raise-path"

interface Wave {
  proposed: number
  skipped: Array<{ name: string; reason: string }>
  stoppedAtLimit: boolean
}
/** "Raise your fund" (docs/architecture/50): the six steps from an empty fund workspace to a first approved wave of LP outreach, with one next action. */
export function RaisePathCard({ initial }: { initial: RaiseState }) {
  const [state, setState] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [wave, setWave] = useState<Wave | null>(null)
  const [error, setError] = useState("")
  const done = state.steps.filter((s) => s.done && s.id !== "follow").length
  const total = state.steps.length - 1
  async function refresh() {
    try {
      const r = await fetch("/api/vc/raise-path", { cache: "no-store" })
      if (r.ok) setState(await r.json())
    } catch {}
  }
  async function writeDrafts() {
    setBusy(true)
    setError("")
    setWave(null)
    try {
      const r = await fetch("/api/vc/raise-path/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || "Could not write the drafts. Try again.")
      setWave(j)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const next = state.next
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
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-lg bg-muted/40 p-4">
          <div className="min-w-0 max-w-2xl">
            <p className="text-sm font-medium">Next: {next.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{next.detail}</p>
          </div>
          {next.action === "drafts" ? (
            <Button
              onClick={() => void writeDrafts()}
              disabled={busy || state.counts.draftable === 0}
              className="min-h-11 gap-2"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy ? "Writing…" : next.button}
            </Button>
          ) : next.href ? (
            <Button asChild className="min-h-11">
              <Link href={next.href}>
                {next.button} <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {wave && (
        <div role="status" className="mt-3 text-sm">
          <p>
            {wave.proposed === 0
              ? "No drafts were written."
              : `${wave.proposed} draft${wave.proposed === 1 ? "" : "s"} written and waiting for your approval. Nothing has been sent.`}{" "}
            {wave.proposed > 0 && (
              <Link href="/dashboard/actions" className="underline">
                Review them in Actions
              </Link>
            )}
          </p>
          {wave.skipped.length > 0 && (
            <p className="mt-1 text-muted-foreground">
              Skipped:{" "}
              {wave.skipped
                .slice(0, 4)
                .map((s) => `${s.name} (${s.reason})`)
                .join("; ")}
              {wave.skipped.length > 4 ? `, and ${wave.skipped.length - 4} more` : ""}.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
