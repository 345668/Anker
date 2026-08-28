"use client"

import { useState } from "react"
import { Loader2, UserPlus, Download, Send, Trash2, Check } from "lucide-react"
import type { LiLeadList, LiLeadListMember } from "@/lib/linkedin/types"

const inputCls = "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#0a66c2]/30"

export function LeadListDetailClient({
  list: initialList,
  initialMembers,
  campaigns,
  orgs = [],
}: {
  list: LiLeadList
  initialMembers: LiLeadListMember[]
  campaigns: { id: string; name: string; status: string }[]
  orgs?: { id: string; name: string }[]
}) {
  const [list, setList] = useState<LiLeadList>(initialList)
  const owned = list.owned !== false
  const [sharing, setSharing] = useState(false)
  async function share(orgId: string | null) {
    setSharing(true)
    try {
      const d = await (await fetch(`/api/linkedin/lead-lists/${list.id}/share`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ orgId }),
      })).json()
      if (d.list) setList(d.list)
    } finally { setSharing(false) }
  }
  const [members, setMembers] = useState<LiLeadListMember[]>(initialMembers)
  const [blob, setBlob] = useState("")
  const [adding, setAdding] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // import from connections
  const [degree, setDegree] = useState("")
  const [companyLike, setCompanyLike] = useState("")
  const [importing, setImporting] = useState(false)

  // enroll
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "")
  const [enrolling, setEnrolling] = useState(false)

  async function refetch() {
    const d = await (await fetch(`/api/linkedin/lead-lists/${list.id}`)).json()
    if (d.members) setMembers(d.members)
  }

  async function add() {
    if (!blob.trim()) return
    setAdding(true); setNote(null)
    try {
      const d = await (await fetch(`/api/linkedin/lead-lists/${list.id}/members`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ blob }),
      })).json()
      if (d.ok) { setBlob(""); setNote(`Added ${d.added} lead(s).`); await refetch() }
      else setNote(d.error || "Failed.")
    } finally { setAdding(false) }
  }

  async function importConns() {
    setImporting(true); setNote(null)
    try {
      const d = await (await fetch(`/api/linkedin/lead-lists/${list.id}/import`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ degree: degree ? Number(degree) : undefined, companyLike: companyLike || undefined }),
      })).json()
      if (d.ok) { setNote(`Imported ${d.added} from connections.`); await refetch() }
      else setNote(d.error || "Import failed.")
    } finally { setImporting(false) }
  }

  async function enroll() {
    if (!campaignId) return
    setEnrolling(true); setNote(null)
    try {
      const d = await (await fetch(`/api/linkedin/lead-lists/${list.id}/enroll`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaignId }),
      })).json()
      setNote(d.ok ? `Enrolled ${d.added} into the campaign.` : (d.error || "Enroll failed."))
    } finally { setEnrolling(false) }
  }

  async function remove(memberId: string) {
    const d = await (await fetch(`/api/linkedin/lead-lists/${list.id}/members?memberId=${memberId}`, { method: "DELETE" })).json()
    if (d.ok) setMembers((m) => m.filter((x) => x.id !== memberId))
  }

  return (
    <div className="space-y-6">
      {note && <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5"><Check className="h-4 w-4" /> {note}</div>}

      {/* Workspace sharing */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
        <div className="text-sm">
          {!owned ? (
            <span className="text-muted-foreground">Shared into your workspace — you can enroll it into your campaigns.</span>
          ) : list.sharedOrgId ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              Shared with {orgs.find((o) => o.id === list.sharedOrgId)?.name || "your workspace"}
            </span>
          ) : (
            <span className="text-muted-foreground">Private to you.</span>
          )}
        </div>
        {owned && orgs.length > 0 && (
          <div className="flex items-center gap-2">
            <select className="rounded-md border bg-background px-2.5 py-1.5 text-sm" value={list.sharedOrgId ?? ""} disabled={sharing}
              onChange={(e) => share(e.target.value || null)}>
              <option value="">Private</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>Share with {o.name}</option>)}
            </select>
            {sharing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Add via paste */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold">Paste leads</h3>
          <p className="mt-1 text-xs text-muted-foreground">One per line: <code>Name | profile URL</code> or a bare <code>/in/</code> URL.</p>
          <textarea className={`mt-2 ${inputCls}`} rows={4} value={blob} onChange={(e) => setBlob(e.target.value)}
            placeholder={"Jane Doe | https://www.linkedin.com/in/jane\nhttps://www.linkedin.com/in/john"} />
          <button onClick={add} disabled={adding || !blob.trim()} className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#0a66c2] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add
          </button>
        </div>

        {/* Import from connections */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold">Import from connections</h3>
          <p className="mt-1 text-xs text-muted-foreground">From the people the extension has captured.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select className={inputCls} value={degree} onChange={(e) => setDegree(e.target.value)}>
              <option value="">Any degree</option>
              <option value="1">1st</option>
              <option value="2">2nd</option>
              <option value="3">3rd</option>
            </select>
            <input className={inputCls} value={companyLike} onChange={(e) => setCompanyLike(e.target.value)} placeholder="Company ~" />
          </div>
          <button onClick={importConns} disabled={importing} className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Import
          </button>
        </div>

        {/* Enroll into campaign */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold">Send to campaign</h3>
          <p className="mt-1 text-xs text-muted-foreground">Bulk-enroll everyone in this list.</p>
          {campaigns.length === 0 ? (
            <p className="mt-2 text-xs text-amber-600">No campaigns yet.</p>
          ) : (
            <>
              <select className={`mt-2 ${inputCls}`} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status !== "active" ? ` (${c.status})` : ""}</option>)}
              </select>
              <button onClick={enroll} disabled={enrolling || !campaignId} className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enroll list
              </button>
            </>
          )}
        </div>
      </div>

      {/* Members */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">People <span className="ml-1 text-muted-foreground">({members.length})</span></h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No people yet. Add some above.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Headline / company</th><th className="px-3 py-2"></th></tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="px-3 py-2 max-w-[240px] truncate">
                      <a href={m.targetUrl} target="_blank" rel="noreferrer" className="hover:underline">{m.targetName || m.targetUrl.replace(/^https?:\/\/(www\.)?/, "")}</a>
                    </td>
                    <td className="px-3 py-2 max-w-[320px] truncate text-muted-foreground">{[m.headline, m.company].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-3 py-2 text-right"><button onClick={() => remove(m.id)} className="rounded p-1 text-red-600 hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /></button></td>
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
