"use client"

import type { FunnelReport, CampaignFunnel } from "@/lib/linkedin/analytics"

const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`)

type FunnelKey = "enrolled" | "connectsSent" | "accepted" | "messagesSent" | "replied"
const FUNNEL: { key: FunnelKey; label: string; color: string }[] = [
  { key: "enrolled", label: "Enrolled", color: "#94a3b8" },
  { key: "connectsSent", label: "Connects sent", color: "#0a66c2" },
  { key: "accepted", label: "Accepted", color: "#0891b2" },
  { key: "messagesSent", label: "Messages sent", color: "#7c3aed" },
  { key: "replied", label: "Replied", color: "#059669" },
]

export function AnalyticsClient({ report }: { report: FunnelReport }) {
  const t = report.totals
  const top = Math.max(1, t.enrolled, t.connectsSent, t.messagesSent)

  return (
    <div className="space-y-8">
      {/* Overall funnel */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">Overall funnel</h2>
        <div className="space-y-2 rounded-lg border bg-card p-4">
          {FUNNEL.map((s) => {
            const v = Number(t[s.key]) || 0
            return (
              <div key={s.key} className="flex items-center gap-3">
                <div className="w-28 shrink-0 text-xs text-muted-foreground">{s.label}</div>
                <div className="h-6 flex-1 overflow-hidden rounded bg-muted">
                  <div className="flex h-full items-center justify-end rounded px-2 text-[11px] font-medium text-white"
                    style={{ width: `${Math.max(4, (v / top) * 100)}%`, backgroundColor: s.color }}>
                    {v}
                  </div>
                </div>
              </div>
            )
          })}
          <div className="mt-3 flex flex-wrap gap-4 border-t pt-3 text-xs text-muted-foreground">
            <span>Accept rate <b className="text-foreground">{pct(t.acceptRate)}</b></span>
            <span>Reply rate <b className="text-foreground">{pct(t.replyRate)}</b></span>
            {t.pending ? <span className="text-amber-600">{t.pending} pending approval</span> : null}
            {t.failed ? <span className="text-red-600">{t.failed} failed</span> : null}
          </div>
        </div>
      </section>

      {/* Per-campaign table */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">By campaign</h2>
        {report.campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No campaigns yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Campaign</th>
                  <th className="px-3 py-2 font-medium text-right">Enrolled</th>
                  <th className="px-3 py-2 font-medium text-right">Connects</th>
                  <th className="px-3 py-2 font-medium text-right">Accepted</th>
                  <th className="px-3 py-2 font-medium text-right">Accept %</th>
                  <th className="px-3 py-2 font-medium text-right">Messages</th>
                  <th className="px-3 py-2 font-medium text-right">Replied</th>
                  <th className="px-3 py-2 font-medium text-right">Reply %</th>
                </tr>
              </thead>
              <tbody>
                {report.campaigns.map((c) => (
                  <tr key={c.campaignId} className="border-t">
                    <td className="px-3 py-2 max-w-[220px] truncate">
                      <a href={`/dashboard/linkedin/campaigns/${c.campaignId}`} className="hover:underline">{c.name}</a>
                      <span className="ml-2 text-[11px] text-muted-foreground">{c.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{c.enrolled}</td>
                    <td className="px-3 py-2 text-right">{c.connectsSent}</td>
                    <td className="px-3 py-2 text-right">{c.accepted}</td>
                    <td className="px-3 py-2 text-right">{pct(c.acceptRate)}</td>
                    <td className="px-3 py-2 text-right">{c.messagesSent}</td>
                    <td className="px-3 py-2 text-right">{c.replied}</td>
                    <td className="px-3 py-2 text-right">{pct(c.replyRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          "Accepted" is populated by the extension's invite sync. Until you run it, that column reads 0 even if invites were accepted.
        </p>
      </section>

      {/* A/B variant breakdown */}
      {report.campaigns.some((c) => c.variants && c.variants.length > 1) && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">A/B variants</h2>
          <div className="space-y-4">
            {report.campaigns.filter((c) => c.variants && c.variants.length > 1).map((c) => {
              const best = [...c.variants!].filter((v) => v.sent >= 3 && v.replyRate != null).sort((a, b) => (b.replyRate! - a.replyRate!))[0]
              return (
                <div key={c.campaignId} className="rounded-lg border">
                  <div className="border-b px-3 py-2 text-sm font-medium">{c.name}</div>
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr><th className="px-3 py-2 font-medium">Variant</th><th className="px-3 py-2 font-medium text-right">Sent</th><th className="px-3 py-2 font-medium text-right">Replied</th><th className="px-3 py-2 font-medium text-right">Reply %</th></tr>
                    </thead>
                    <tbody>
                      {c.variants!.map((v) => (
                        <tr key={v.variant} className={`border-t ${best && v.variant === best.variant ? "bg-emerald-500/5" : ""}`}>
                          <td className="px-3 py-2">Variant {String.fromCharCode(65 + v.variant)}{best && v.variant === best.variant ? " · best" : ""}</td>
                          <td className="px-3 py-2 text-right">{v.sent}</td>
                          <td className="px-3 py-2 text-right">{v.replied}</td>
                          <td className="px-3 py-2 text-right">{pct(v.replyRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Reply-rate compares message variants (A = main copy). "Best" needs at least 3 sends.</p>
        </section>
      )}
    </div>
  )
}
