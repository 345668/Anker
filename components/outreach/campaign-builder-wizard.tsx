"use client"

/**
 * Campaign Builder Wizard — 4-step flow.
 *
 *   1. Source   — pull pool from Neon investors / crm_entries + optional XLSX
 *   2. Score    — LP-mix sliders + target count + tier bands → shortlist
 *   3. Verify   — regex + role drop + prior bounces + DNS MX
 *   4. Draft    — pick template + AI provider, kick off draft generation
 *
 * Everything is a POST to a dedicated endpoint; the UI is a thin driver
 * that shows results between steps so the user can course-correct.
 */
import { useCallback, useState } from "react"
import Link from "next/link"

interface Campaign {
  id: string
  name: string
  description: string | null
  eventTopic: string | null
  eventDate: string | null
  eventUrl: string | null
  ccAddresses: string[]
}

interface Stats {
  pool: number
  selected: number
  verified: number
  byTier: { t1: number; t2: number; t3: number }
}

type Step = 1 | 2 | 3 | 4 | 5

export function CampaignBuilderWizard({
  campaign,
  initialStats,
}: {
  campaign: Campaign
  initialStats: Stats
}) {
  const [step, setStep] = useState<Step>(1)
  const [stats, setStats] = useState<Stats>(initialStats)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])

  const push = useCallback((line: string) => setLog((l) => [...l, `${new Date().toLocaleTimeString()}  ${line}`]), [])

  async function callJson<T = any>(path: string, body?: any): Promise<T> {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
    return j as T
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <header className="border-b border-foreground/10 pb-4">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Link href="/dashboard/outreach" className="hover:underline">← Outreach</Link>
          <span>·</span>
          <span>Campaign builder</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold">{campaign.name}</h1>
        {campaign.description && (
          <p className="mt-1 text-sm text-muted-foreground">{campaign.description}</p>
        )}
      </header>

      {/* Stepper */}
      <nav className="flex items-center gap-2 text-xs">
        {(["Source", "Shortlist", "Verify", "Enrich", "Draft"] as const).map((label, i) => {
          const n = (i + 1) as Step
          const active = n === step
          const done = n < step
          return (
            <button
              key={n}
              onClick={() => setStep(n)}
              className={
                "rounded-full px-3 py-1.5 font-mono uppercase tracking-wider transition-colors " +
                (active ? "bg-foreground text-background"
                       : done   ? "bg-foreground/10 text-foreground"
                                : "bg-foreground/5 text-muted-foreground hover:bg-foreground/10")
              }
            >
              {n}. {label}
            </button>
          )
        })}
      </nav>

      {err && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Current stats banner */}
      <section className="grid grid-cols-2 gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4 sm:grid-cols-4">
        <Stat label="Pool" value={stats.pool} />
        <Stat label="Shortlisted" value={stats.selected} />
        <Stat label="Email verified" value={stats.verified} />
        <Stat label="T1 · T2 · T3" value={`${stats.byTier.t1} · ${stats.byTier.t2} · ${stats.byTier.t3}`} />
      </section>

      {/* Steps */}
      {step === 1 && (
        <StepSource
          campaign={campaign}
          busy={busy}
          setBusy={setBusy}
          setErr={setErr}
          push={push}
          onDone={(s) => { setStats((prev) => ({ ...prev, pool: s.total })); setStep(2) }}
        />
      )}
      {step === 2 && (
        <StepScore
          campaign={campaign}
          busy={busy}
          setBusy={setBusy}
          setErr={setErr}
          push={push}
          callJson={callJson}
          onDone={(r) => { setStats((prev) => ({ ...prev, selected: r.selected, byTier: r.byTier })); setStep(3) }}
        />
      )}
      {step === 3 && (
        <StepVerify
          campaign={campaign}
          busy={busy}
          setBusy={setBusy}
          setErr={setErr}
          push={push}
          callJson={callJson}
          onDone={(r) => { setStats((prev) => ({ ...prev, verified: r.byStatus?.valid || 0 })); setStep(4) }}
        />
      )}
      {step === 4 && (
        <StepEnrich
          campaign={campaign}
          busy={busy}
          setBusy={setBusy}
          setErr={setErr}
          push={push}
          callJson={callJson}
          onDone={() => setStep(5)}
        />
      )}
      {step === 5 && (
        <StepDraft
          campaign={campaign}
          busy={busy}
          setBusy={setBusy}
          setErr={setErr}
          push={push}
        />
      )}

      {/* Activity log */}
      {log.length > 0 && (
        <section className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Activity</h3>
          <ul className="space-y-1 font-mono text-xs">
            {log.slice(-20).map((l, i) => <li key={i} className="text-foreground/70">{l}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Step 1 · Source
// ────────────────────────────────────────────────────────────────────────
function StepSource(props: {
  campaign: Campaign; busy: boolean; setBusy: (b: boolean) => void
  setErr: (s: string | null) => void; push: (l: string) => void
  onDone: (result: { total: number }) => void
}) {
  const [neonInvestors, setNeonInvestors] = useState(true)
  const [neonCrm, setNeonCrm] = useState(true)
  const [file, setFile] = useState<File | null>(null)

  async function run() {
    props.setErr(null); props.setBusy(true)
    try {
      const form = new FormData()
      form.append("sources", JSON.stringify({ neonInvestors, neonCrm }))
      if (file) form.append("file", file)
      props.push("Importing pool from selected sources…")
      const r = await fetch(`/api/outreach/campaigns/${props.campaign.id}/import-pool`, {
        method: "POST",
        body: form,
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      props.push(`Pool: ${j.poolSize} unique (added ${j.added}). Coverage: ${j.coverage.emailAndLinkedin} both, ${j.coverage.emailOnly} email, ${j.coverage.linkedinOnly} linkedin.`)
      props.onDone({ total: j.poolSize })
    } catch (e: any) {
      props.setErr(e?.message || "Import failed")
    } finally {
      props.setBusy(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-foreground/10 bg-background p-6">
      <h2 className="text-lg font-semibold">1 · Source</h2>
      <p className="text-sm text-muted-foreground">
        Pull the candidate pool from your Neon data and optionally add rows from an XLSX
        (e.g. today's LinkedIn network export).
      </p>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={neonInvestors} onChange={(e) => setNeonInvestors(e.target.checked)} />
          Neon <code>investors</code> table
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={neonCrm} onChange={(e) => setNeonCrm(e.target.checked)} />
          Neon <code>crm_entries</code> table
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">Optional XLSX (LinkedIn export or profiles)</span>
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
      </div>
      <button
        onClick={run}
        disabled={props.busy}
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/85 disabled:opacity-60"
      >
        {props.busy ? "Importing…" : "Import pool"}
      </button>
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Step 2 · Score + Shortlist
// ────────────────────────────────────────────────────────────────────────
function StepScore(props: {
  campaign: Campaign; busy: boolean; setBusy: (b: boolean) => void
  setErr: (s: string | null) => void; push: (l: string) => void
  callJson: <T = any>(path: string, body?: any) => Promise<T>
  onDone: (result: { selected: number; byTier: Stats["byTier"] }) => void
}) {
  const [target, setTarget] = useState(500)
  const [mixFo, setMixFo] = useState(60)
  const [mixHnw, setMixHnw] = useState(30)
  const [mixMfo, setMixMfo] = useState(10)
  const [t1Cap, setT1Cap] = useState(100)
  const [t2Min, setT2Min] = useState(60)

  const total = mixFo + mixHnw + mixMfo

  async function run() {
    props.setErr(null); props.setBusy(true)
    try {
      const mix = {
        family_office: mixFo / 100,
        hnw_angel:     mixHnw / 100,
        mfo_ifo:       mixMfo / 100,
      }
      props.push(`Scoring pool with mix ${mixFo}/${mixHnw}/${mixMfo}, target=${target}…`)
      const j = await props.callJson<any>(`/api/outreach/campaigns/${props.campaign.id}/score-shortlist`, {
        target, mix, tierBands: { t1Cap, t2Min },
      })
      props.push(`Scored ${j.scored}, selected ${j.selected}. T1=${j.byTier.t1}, T2=${j.byTier.t2}, T3=${j.byTier.t3}.`)
      props.onDone({ selected: j.selected, byTier: j.byTier })
    } catch (e: any) {
      props.setErr(e?.message || "Scoring failed")
    } finally {
      props.setBusy(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-foreground/10 bg-background p-6">
      <h2 className="text-lg font-semibold">2 · Score + shortlist</h2>
      <p className="text-sm text-muted-foreground">
        Score every pool member using the IP-topic model, then pick the top-N respecting the LP-type mix.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Target size">
          <input type="number" value={target} onChange={(e) => setTarget(parseInt(e.target.value || "0", 10))}
                 className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"/>
        </Field>
        <Field label={`Family office · ${mixFo}%`}>
          <input type="range" min={0} max={100} value={mixFo} onChange={(e) => setMixFo(parseInt(e.target.value, 10))} className="w-full"/>
        </Field>
        <Field label={`HNW angel · ${mixHnw}%`}>
          <input type="range" min={0} max={100} value={mixHnw} onChange={(e) => setMixHnw(parseInt(e.target.value, 10))} className="w-full"/>
        </Field>
        <Field label={`MFO / IFO · ${mixMfo}%`}>
          <input type="range" min={0} max={100} value={mixMfo} onChange={(e) => setMixMfo(parseInt(e.target.value, 10))} className="w-full"/>
        </Field>
        <Field label="T1 cap (top-N)">
          <input type="number" value={t1Cap} onChange={(e) => setT1Cap(parseInt(e.target.value || "0", 10))}
                 className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"/>
        </Field>
        <Field label="T2 min score">
          <input type="number" value={t2Min} onChange={(e) => setT2Min(parseInt(e.target.value || "0", 10))}
                 className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"/>
        </Field>
      </div>
      {total !== 100 && (
        <p className="text-xs text-amber-600">Mix sums to {total}%, not 100. That's OK — remainder goes to the largest bucket.</p>
      )}
      <button
        onClick={run}
        disabled={props.busy}
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/85 disabled:opacity-60"
      >
        {props.busy ? "Scoring…" : "Score + build shortlist"}
      </button>
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Step 3 · Verify
// ────────────────────────────────────────────────────────────────────────
function StepVerify(props: {
  campaign: Campaign; busy: boolean; setBusy: (b: boolean) => void
  setErr: (s: string | null) => void; push: (l: string) => void
  callJson: <T = any>(path: string, body?: any) => Promise<T>
  onDone: (result: { byStatus: Record<string, number> }) => void
}) {
  const [byStatus, setByStatus] = useState<Record<string, number> | null>(null)

  async function run() {
    props.setErr(null); props.setBusy(true)
    try {
      props.push("Verifying shortlist emails (regex + role drop + prior bounces + DNS MX)…")
      const j = await props.callJson<any>(`/api/outreach/campaigns/${props.campaign.id}/verify-emails`)
      props.push(`Verified ${j.verified}. Valid=${j.byStatus?.valid ?? 0}, role=${j.byStatus?.role ?? 0}, bounced_june=${j.byStatus?.bounced_june ?? 0}, no_mx=${j.byStatus?.no_mx ?? 0}, invalid=${j.byStatus?.format_invalid ?? 0}, no_email=${j.byStatus?.no_email ?? 0}.`)
      setByStatus(j.byStatus || {})
      props.onDone({ byStatus: j.byStatus || {} })
    } catch (e: any) {
      props.setErr(e?.message || "Verification failed")
    } finally {
      props.setBusy(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-foreground/10 bg-background p-6">
      <h2 className="text-lg font-semibold">3 · Verify emails (local, free)</h2>
      <p className="text-sm text-muted-foreground">
        Format regex → drop role addresses (info@, contact@, …) → cross-ref against prior bounces → DNS MX lookup.
        This isn't as thorough as a paid verifier but tends to drop the obvious 20-30% of guessed emails that caused the June bounce spike.
      </p>
      <button
        onClick={run}
        disabled={props.busy}
        className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/85 disabled:opacity-60"
      >
        {props.busy ? "Verifying…" : "Verify emails"}
      </button>
      {byStatus && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(byStatus).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="mt-1 text-lg font-semibold">{v}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Step 4 · Enrich (batched AI enrichment, 15 at a time)
// ────────────────────────────────────────────────────────────────────────
function StepEnrich(props: {
  campaign: Campaign; busy: boolean; setBusy: (b: boolean) => void
  setErr: (s: string | null) => void; push: (l: string) => void
  callJson: <T = any>(path: string, body?: any) => Promise<T>
  onDone: () => void
}) {
  const [progress, setProgress] = useState<{ done: number; remaining: number } | null>(null)
  const [running, setRunning] = useState(false)

  async function run() {
    props.setErr(null); props.setBusy(true); setRunning(true)
    let totalDone = 0
    try {
      // Poll-loop: one batch per call, keep going until nextOffset is null.
      for (let iter = 0; iter < 60; iter++) {  // safety cap: 60 batches = 900 profiles
        const j = await props.callJson<any>(`/api/outreach/campaigns/${props.campaign.id}/enrich`, {
          batchSize: 15,
        })
        totalDone += Number(j.processed || 0)
        setProgress({ done: totalDone, remaining: Number(j.remaining || 0) })
        props.push(`Enriched batch: +${j.processed} · ${j.remaining} remaining`)
        if (j.nextOffset === null || j.processed === 0) break
        await new Promise((r) => setTimeout(r, 300))  // gentle spacing
      }
      props.push(`Enrichment complete: ${totalDone} enriched.`)
      props.onDone()
    } catch (e: any) {
      props.setErr(e?.message || "Enrichment failed")
    } finally {
      props.setBusy(false); setRunning(false)
    }
  }

  async function downloadXlsx() {
    props.setErr(null)
    try {
      const url = `/api/outreach/campaigns/${props.campaign.id}/export-enriched`
      window.location.href = url
    } catch (e: any) {
      props.setErr(e?.message || "Export failed")
    }
  }

  async function enqueueCrawl() {
    props.setErr(null); props.setBusy(true)
    try {
      props.push("Enqueueing T1 members for Chrome-extension crawl…")
      const j = await props.callJson<any>(`/api/outreach/campaigns/${props.campaign.id}/enqueue-crawl`, { tiers: ["t1"] })
      props.push(`Crawl queue: +${j.enqueued} enqueued · ${j.alreadyQueued} already there · ${j.skippedNoUrl} skipped (no LinkedIn URL).`)
    } catch (e: any) {
      props.setErr(e?.message || "Enqueue failed")
    } finally {
      props.setBusy(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-foreground/10 bg-background p-6">
      <h2 className="text-lg font-semibold">4 · Enrich (batched)</h2>
      <p className="text-sm text-muted-foreground">
        AI enriches each shortlisted contact with sectors, firm intelligence, investment mandate,
        why-them, a personalisation hook, and a customized subject line. Batches of 15 per call
        so the Vercel timeout isn't hit even on 500-row shortlists.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={run}
          disabled={props.busy}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/85 disabled:opacity-60"
        >
          {running ? "Enriching…" : "Start enrichment"}
        </button>
        <button
          onClick={downloadXlsx}
          disabled={props.busy}
          className="rounded-lg border border-foreground/20 px-4 py-2 text-sm font-semibold hover:bg-foreground/5 disabled:opacity-60"
        >
          Download enriched XLSX
        </button>
        <button
          onClick={enqueueCrawl}
          disabled={props.busy}
          className="rounded-lg border border-foreground/20 px-4 py-2 text-sm font-semibold hover:bg-foreground/5 disabled:opacity-60"
        >
          Queue T1 for Chrome-extension crawl
        </button>
      </div>
      {progress && (
        <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4 text-sm">
          <div>Enriched so far: <b>{progress.done}</b></div>
          <div>Remaining: <b>{progress.remaining}</b></div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Once done: download the XLSX to review offline, or upload it via the LP Campaign tab —
        it comes out in the exact 8-sheet SVS shape the existing import expects.
      </p>
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Step 5 · Draft + Schedule (reuses existing /draft endpoint, adds schedules)
// ────────────────────────────────────────────────────────────────────────
function StepDraft(props: {
  campaign: Campaign; busy: boolean; setBusy: (b: boolean) => void
  setErr: (s: string | null) => void; push: (l: string) => void
}) {
  const [sendAt, setSendAt] = useState<string>(() => {
    // Default: tomorrow 09:00 local
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0)
    return d.toISOString().slice(0, 16)
  })
  const [nudgeAt, setNudgeAt] = useState<string>(() => {
    // Default: 2 days after send at 10:00 local
    const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(10, 0, 0, 0)
    return d.toISOString().slice(0, 16)
  })
  const [schedules, setSchedules] = useState<any[]>([])

  async function callJson<T = any>(path: string, body?: any, method: string = "POST"): Promise<T> {
    const r = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error((j as any)?.error || `HTTP ${r.status}`)
    return j as T
  }

  async function loadSchedules() {
    try {
      const j = await callJson<any>(`/api/outreach/campaigns/${props.campaign.id}/schedule`, undefined, "GET")
      setSchedules(j.schedules || [])
    } catch (e: any) { props.setErr(e?.message || "Failed to load schedules") }
  }

  async function schedule(actionType: string, whenLocalIso: string) {
    props.setErr(null); props.setBusy(true)
    try {
      const at = new Date(whenLocalIso).toISOString()
      const j = await callJson<any>(`/api/outreach/campaigns/${props.campaign.id}/schedule`,
        { actionType, scheduledAt: at })
      props.push(`Scheduled ${actionType} at ${at}. id=${j.schedule?.id}`)
      await loadSchedules()
    } catch (e: any) { props.setErr(e?.message || "Schedule failed") }
    finally { props.setBusy(false) }
  }

  return (
    <section className="space-y-6 rounded-xl border border-foreground/10 bg-background p-6">
      <div>
        <h2 className="text-lg font-semibold">5 · Draft + review</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Draft generation uses the existing outreach engine + template picker. Jump into the
          campaign detail view to pick a template, kick off AI drafting for the enriched shortlist,
          and review before scheduling.
        </p>
        <Link
          href={`/dashboard/outreach/campaigns/${props.campaign.id}`}
          className="mt-3 inline-block rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/85"
        >
          Open campaign →
        </Link>
      </div>

      <div className="border-t border-foreground/10 pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Automated schedule</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          The cron scheduler runs every 10 minutes and executes any due action. Set the initial send
          + the opener nudge once — cron takes care of firing them.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Initial send (send_batch)</label>
            <input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)}
                   className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"/>
            <button
              onClick={() => schedule("send_batch", sendAt)}
              disabled={props.busy}
              className="w-full rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/85 disabled:opacity-60"
            >
              Schedule initial send
            </button>
          </div>
          <div className="space-y-2">
            <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Opener nudge (send_openers_nudge)</label>
            <input type="datetime-local" value={nudgeAt} onChange={(e) => setNudgeAt(e.target.value)}
                   className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm"/>
            <button
              onClick={() => schedule("send_openers_nudge", nudgeAt)}
              disabled={props.busy}
              className="w-full rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-foreground/85 disabled:opacity-60"
            >
              Schedule opener nudge
            </button>
          </div>
        </div>

        <button onClick={loadSchedules}
                className="mt-4 rounded-lg border border-foreground/15 px-3 py-1.5 text-xs hover:bg-foreground/5">
          Refresh schedule list
        </button>

        {schedules.length > 0 && (
          <div className="mt-3 space-y-2">
            {schedules.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2 text-xs">
                <div>
                  <span className="font-mono uppercase tracking-wider text-muted-foreground">{s.action_type}</span>
                  <span className="ml-3 text-foreground/70">{new Date(s.scheduled_at).toLocaleString()}</span>
                </div>
                <div className={
                  s.status === "done" ? "text-green-600" :
                  s.status === "running" ? "text-amber-600" :
                  s.status === "failed" ? "text-red-600" : "text-foreground/60"
                }>{s.status}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
