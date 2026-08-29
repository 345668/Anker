"use client"

import { useState } from "react"
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, Play, Pause, Save, UserPlus, Check } from "lucide-react"
import type { LiCampaign, LiCampaignStep, LiCampaignMember, StepActionType, StepCondition } from "@/lib/linkedin/types"

type SenderLite = { id: string; displayName: string; status: string }
type EditStep = { actionType: StepActionType; template: string; delayHours: number; condition: StepCondition; variants: string[] }

const ACTION_LABEL: Record<StepActionType, string> = { connect_request: "Connect", message: "Message", follow_up: "Follow-up" }
const COND_LABEL: Record<StepCondition, string> = { any: "Always", if_accepted: "If accepted", if_no_reply: "If no reply" }
const inputCls = "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#0a66c2]/30"

const stateCls: Record<string, string> = {
  active: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  stopped: "bg-red-500/15 text-red-600 dark:text-red-400",
  replied: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
}

export function CampaignBuilderClient({
  campaign: initialCampaign,
  initialSteps,
  initialMembers,
  counts,
  senders,
  initialPoolIds = [],
}: {
  campaign: LiCampaign
  initialSteps: LiCampaignStep[]
  initialMembers: LiCampaignMember[]
  counts: Record<string, number>
  senders: SenderLite[]
  initialPoolIds?: string[]
}) {
  const [campaign, setCampaign] = useState(initialCampaign)
  const [pool, setPool] = useState<Set<string>>(new Set(initialPoolIds))
  const [savingPool, setSavingPool] = useState(false)
  const [steps, setSteps] = useState<EditStep[]>(
    initialSteps.map((s) => ({ actionType: s.actionType, template: s.template, delayHours: s.delayHours, condition: s.condition, variants: s.variants ?? [] })),
  )
  const [members, setMembers] = useState<LiCampaignMember[]>(initialMembers)
  const [enrollText, setEnrollText] = useState("")
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingSteps, setSavingSteps] = useState(false)
  const [enrolling, setEnrolling] = useState(false)
  const [savedSteps, setSavedSteps] = useState(false)

  // ── settings ──
  async function patchCampaign(body: Partial<{ senderId: string | null; fullAuto: boolean; status: LiCampaign["status"]; autoApproveConnects: boolean; autoApproveMessages: boolean }>) {
    setSavingSettings(true)
    try {
      const res = await fetch(`/api/linkedin/campaigns/${campaign.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      })
      const d = await res.json()
      if (d.campaign) setCampaign(d.campaign)
    } finally { setSavingSettings(false) }
  }

  async function togglePoolSender(id: string, on: boolean) {
    const next = new Set(pool)
    on ? next.add(id) : next.delete(id)
    setPool(next)
    setSavingPool(true)
    try {
      await fetch(`/api/linkedin/campaigns/${campaign.id}/senders`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ senderIds: [...next] }),
      })
    } finally { setSavingPool(false) }
  }

  // A campaign can send if it has a pool OR a single default sender.
  const hasSender = pool.size > 0 || !!campaign.senderId
  const canActivate = hasSender && steps.length > 0 && members.length > 0

  // ── steps ──
  const addStep = () =>
    setSteps((s) => [...s, { actionType: s.length === 0 ? "connect_request" : "message", template: "", delayHours: s.length === 0 ? 0 : 24, condition: "any", variants: [] }])
  const updateStep = (i: number, patch: Partial<EditStep>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const removeStep = (i: number) => setSteps((s) => s.filter((_, j) => j !== i))
  const moveStep = (i: number, dir: -1 | 1) =>
    setSteps((s) => {
      const j = i + dir
      if (j < 0 || j >= s.length) return s
      const c = [...s]; [c[i], c[j]] = [c[j], c[i]]; return c
    })

  async function saveSteps() {
    setSavingSteps(true); setSavedSteps(false)
    try {
      const res = await fetch(`/api/linkedin/campaigns/${campaign.id}/steps`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ steps }),
      })
      if ((await res.json()).ok) { setSavedSteps(true); setTimeout(() => setSavedSteps(false), 2000) }
    } finally { setSavingSteps(false) }
  }

  // ── members ──
  async function enroll() {
    const people = enrollText.split("\n").map((line) => {
      const t = line.trim(); if (!t) return null
      // "Name | https://linkedin.com/in/…"  or just a URL
      const parts = t.split("|").map((x) => x.trim())
      if (parts.length === 2) return { targetName: parts[0], targetUrl: parts[1] }
      return { targetUrl: t }
    }).filter(Boolean)
    if (!people.length) return
    setEnrolling(true)
    try {
      const res = await fetch(`/api/linkedin/campaigns/${campaign.id}/members`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ people }),
      })
      if ((await res.json()).ok) {
        setEnrollText("")
        // Refetch members for accurate state.
        const g = await (await fetch(`/api/linkedin/campaigns/${campaign.id}`)).json()
        if (g.members) setMembers(g.members)
      }
    } finally { setEnrolling(false) }
  }

  async function removeMemberRow(memberId: string) {
    const res = await fetch(`/api/linkedin/campaigns/${campaign.id}/members?memberId=${memberId}`, { method: "DELETE" })
    if ((await res.json()).ok) setMembers((m) => m.filter((x) => x.id !== memberId))
  }

  return (
    <div className="space-y-8">
      {/* Settings */}
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Default sender</span>
              <select className={inputCls} value={campaign.senderId ?? ""} onChange={(e) => patchCampaign({ senderId: e.target.value || null })}>
                <option value="">— none —</option>
                {senders.map((s) => <option key={s.id} value={s.id}>{s.displayName}{s.status !== "active" ? ` (${s.status})` : ""}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 pb-1.5 text-sm">
              <input type="checkbox" checked={campaign.fullAuto} onChange={(e) => patchCampaign({ fullAuto: e.target.checked })} />
              <span>Full-auto <span className="text-muted-foreground">(skip approval — all steps)</span></span>
            </label>
            <label className="flex items-center gap-2 pb-1.5 text-sm">
              <input type="checkbox" checked={campaign.fullAuto || campaign.autoApproveConnects} disabled={campaign.fullAuto}
                onChange={(e) => patchCampaign({ autoApproveConnects: e.target.checked })} />
              <span className="text-muted-foreground">Auto-approve connects</span>
            </label>
            <label className="flex items-center gap-2 pb-1.5 text-sm">
              <input type="checkbox" checked={campaign.fullAuto || campaign.autoApproveMessages} disabled={campaign.fullAuto}
                onChange={(e) => patchCampaign({ autoApproveMessages: e.target.checked })} />
              <span className="text-muted-foreground">Auto-approve messages</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${campaign.status === "active" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{campaign.status}</span>
            {campaign.status === "active" ? (
              <button onClick={() => patchCampaign({ status: "paused" })} disabled={savingSettings} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm">
                <Pause className="h-4 w-4" /> Pause
              </button>
            ) : (
              <button onClick={() => patchCampaign({ status: "active" })} disabled={savingSettings || !canActivate}
                title={canActivate ? "" : "Add a sender, at least one step, and one member first"}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
                <Play className="h-4 w-4" /> Activate
              </button>
            )}
          </div>
        </div>
        {/* Sender pool — rotation across multiple accounts */}
        <div className="mt-4 border-t pt-3">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            Sender pool <span className="font-normal">(rotate across accounts — each person keeps one sender)</span>
            {savingPool && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
          {senders.length === 0 ? (
            <p className="text-xs text-muted-foreground">Add senders in LinkedOut → Senders first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {senders.map((s) => {
                const on = pool.has(s.id)
                return (
                  <label key={s.id} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${on ? "border-[#0a66c2] bg-[#0a66c2]/10 text-[#0a66c2]" : ""}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={(e) => togglePoolSender(s.id, e.target.checked)} />
                    {s.displayName}{s.status !== "active" ? ` (${s.status})` : ""}
                  </label>
                )
              })}
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {pool.size > 0 ? `Rotating across ${pool.size} sender${pool.size === 1 ? "" : "s"}.` : "Empty pool → uses the default sender above."}
          </p>
        </div>

        {campaign.fullAuto && (
          <p className="mt-3 rounded-md bg-purple-500/10 px-3 py-2 text-xs text-purple-700 dark:text-purple-300">
            Full-auto sends unconditional steps without human approval, within the sender's caps and working hours. Conditional steps (If accepted / If no reply) still require approval until reply-tracking ships.
          </p>
        )}
      </section>

      {/* Sequence */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Sequence <span className="ml-1 text-muted-foreground">({steps.length})</span></h2>
          <div className="flex items-center gap-2">
            <button onClick={addStep} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> Add step</button>
            <button onClick={saveSteps} disabled={savingSteps} className="inline-flex items-center gap-1.5 rounded-md bg-[#0a66c2] px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {savingSteps ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedSteps ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {savedSteps ? "Saved" : "Save sequence"}
            </button>
          </div>
        </div>

        {steps.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No steps yet. A typical sequence: <b>Connect</b> → wait 48h → <b>Message</b>. Click “Add step”.
          </div>
        ) : (
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="rounded-lg border bg-card p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0a66c2]/10 text-xs font-medium text-[#0a66c2]">{i + 1}</span>
                  <select className="rounded-md border bg-background px-2 py-1 text-sm" value={s.actionType} onChange={(e) => updateStep(i, { actionType: e.target.value as StepActionType })}>
                    {(Object.keys(ACTION_LABEL) as StepActionType[]).map((t) => <option key={t} value={t}>{ACTION_LABEL[t]}</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground">wait</span>
                  <input type="number" min={0} className="w-20 rounded-md border bg-background px-2 py-1 text-sm" value={s.delayHours} onChange={(e) => updateStep(i, { delayHours: Number(e.target.value) })} />
                  <span className="text-xs text-muted-foreground">h before ·</span>
                  <select className="rounded-md border bg-background px-2 py-1 text-sm" value={s.condition} onChange={(e) => updateStep(i, { condition: e.target.value as StepCondition })}>
                    {(Object.keys(COND_LABEL) as StepCondition[]).map((c) => <option key={c} value={c}>{COND_LABEL[c]}</option>)}
                  </select>
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => moveStep(i, -1)} disabled={i === 0} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="rounded p-1 hover:bg-muted disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button onClick={() => removeStep(i)} className="rounded p-1 text-red-600 hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <textarea className={`mt-2 ${inputCls}`} rows={2}
                  placeholder={s.actionType === "connect_request" ? "Connection note (optional). Use {{firstName}}." : "Message body. Use {{firstName}} / {{name}}."}
                  value={s.template} onChange={(e) => updateStep(i, { template: e.target.value })} />
                {/* A/B variants */}
                {s.variants.map((v, vi) => (
                  <div key={vi} className="mt-1.5 flex items-start gap-1.5">
                    <span className="mt-2 text-[10px] font-mono text-muted-foreground">{String.fromCharCode(66 + vi)}</span>
                    <textarea className={inputCls} rows={2} placeholder={`Variant ${String.fromCharCode(66 + vi)}`}
                      value={v} onChange={(e) => updateStep(i, { variants: s.variants.map((x, j) => (j === vi ? e.target.value : x)) })} />
                    <button onClick={() => updateStep(i, { variants: s.variants.filter((_, j) => j !== vi) })} className="mt-1.5 rounded p-1 text-red-600 hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <button onClick={() => updateStep(i, { variants: [...s.variants, ""] })} className="mt-1 text-[11px] text-[#0a66c2] hover:underline">
                  + Add A/B variant {s.variants.length > 0 ? `(${s.variants.length + 1}-way split)` : ""}
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Members */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            People <span className="ml-1 text-muted-foreground">({members.length})</span>
            {counts.completed ? <span className="ml-2 text-xs text-emerald-600">· {counts.completed} completed</span> : null}
            {counts.stopped ? <span className="ml-2 text-xs text-red-600">· {counts.stopped} stopped</span> : null}
          </h2>
        </div>

        <div className="rounded-lg border bg-card p-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Enroll — one per line. <code>Name | https://linkedin.com/in/…</code> or just a profile URL.</span>
            <textarea className={inputCls} rows={3} value={enrollText} onChange={(e) => setEnrollText(e.target.value)} placeholder={"Jane Doe | https://www.linkedin.com/in/jane\nhttps://www.linkedin.com/in/john"} />
          </label>
          <div className="mt-2 flex justify-end">
            <button onClick={enroll} disabled={enrolling || !enrollText.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-[#0a66c2] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Enroll
            </button>
          </div>
        </div>

        {members.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">Person</th><th className="px-3 py-2 font-medium">Step</th><th className="px-3 py-2 font-medium">State</th><th className="px-3 py-2"></th></tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="px-3 py-2 max-w-[260px] truncate">
                      <a href={m.targetUrl} target="_blank" rel="noreferrer" className="hover:underline">{m.targetName || m.targetUrl.replace(/^https?:\/\/(www\.)?/, "")}</a>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{m.currentStep + 1}{m.stoppedReason ? ` · ${m.stoppedReason}` : ""}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${stateCls[m.state] ?? "bg-muted text-muted-foreground"}`}>{m.state}</span></td>
                    <td className="px-3 py-2 text-right"><button onClick={() => removeMemberRow(m.id)} className="rounded p-1 text-red-600 hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
