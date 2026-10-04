"use client"

import { CATEGORY_LABEL, type EngineResult } from "@/lib/intake/model"

const BADGE = { passed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", review: "bg-amber-500/15 text-amber-700 dark:text-amber-300", not_a_fit: "bg-foreground/10 text-muted-foreground" }

/** The intake engine's assessment of an inbound deal: category, score, why, per-dimension evidence, and what to ask. */
export function EngineCard({ engine, answers, ref_ }: { engine: EngineResult; answers?: Record<string, string>; ref_?: string }) {
  const given = Object.entries(answers ?? {}).filter(([k, v]) => v && typeof v === "string" && !["terms_accepted", "stage", "sectors", "location", "raise_amount", "cheque_ask"].includes(k))
  return (
    <div className="rounded-lg border border-foreground/10 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-display text-lg">Intake assessment</h3>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE[engine.category]}`}>{CATEGORY_LABEL[engine.category]}</span>
        {engine.score != null && <span className="font-mono text-sm tabular-nums">{engine.score} / 100</span>}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{ref_} · config v{engine.configVersion}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{engine.reason}</p>
      {engine.summary && <p className="mt-2 text-sm">{engine.summary}</p>}
      {engine.gates.length > 0 && (
        <ul className="mt-3 text-xs text-muted-foreground">{engine.gates.map((g) => <li key={g.gate}>{g.result === "pass" ? "✓" : g.result === "fail" ? "✗" : "?"} {g.label}: {g.detail}</li>)}</ul>)}
      {engine.dimensions.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">{engine.dimensions.map((d) => <li key={d.key}><span className="inline-block w-8 font-mono tabular-nums">{d.score}/5</span> <span className="font-medium">{d.key}</span> {d.note && <span className="text-muted-foreground">— {d.note}</span>}</li>)}</ul>)}
      <div className="mt-3 grid gap-4 sm:grid-cols-2 text-sm">
        {engine.strengths.length > 0 && <div><div className="text-xs font-medium text-muted-foreground">Strengths</div><ul className="list-disc pl-5">{engine.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
        {engine.concerns.length > 0 && <div><div className="text-xs font-medium text-muted-foreground">Concerns</div><ul className="list-disc pl-5">{engine.concerns.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      </div>
      {engine.questions.length > 0 && <div className="mt-3 text-sm"><div className="text-xs font-medium text-muted-foreground">Ask on the first call</div><ul className="list-disc pl-5">{engine.questions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      {given.length > 0 && (
        <details className="mt-3 text-sm"><summary className="cursor-pointer text-xs text-muted-foreground">What the applicant wrote</summary>
          <dl className="mt-2 space-y-1">{given.map(([k, v]) => <div key={k}><dt className="text-xs font-medium text-muted-foreground">{k}</dt><dd className="whitespace-pre-line">{v}</dd></div>)}</dl></details>)}
    </div>
  )
}
