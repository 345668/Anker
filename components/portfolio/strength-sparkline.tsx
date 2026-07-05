"use client"

/**
 * Strength-score sparkline — visualises the trajectory of a fund's
 * assessment Strength over time. Fetched from /assessment/history.
 *
 * Why a custom SVG instead of a chart lib:
 *   - Sparklines are 3 lines of geometry — pulling in d3 or recharts
 *     for this would be 200+KB of bundle for one widget.
 *   - The shape is opinionated (axis-less, label-less, single line +
 *     dots on hover) so a library would mostly fight us.
 *
 * Renders:
 *   - SVG polyline of strength values over time
 *   - Soft area fill below the line
 *   - First + last value annotated inline
 *   - Empty state when no snapshots yet ("save any field to start")
 *
 * Sized to fit the right-rail slot (~280px wide). viewBox-driven so it
 * scales cleanly at any container width.
 */

import { useEffect, useState } from "react"
import { TrendingUp, Loader2 } from "lucide-react"

interface Snapshot {
  strength: number
  captured_at: string
}

interface Props {
  fundId: string
  /** When supplied, used as initial data so the component renders
   *  without a fetch on first paint. The hook still refetches on mount
   *  to pick up any snapshots written after server render. */
  initialSnapshots?: Snapshot[]
  /** Max snapshots to fetch. Default 24 — enough for the ~last 6 weeks
   *  at one-per-edit-session cadence. */
  limit?: number
  /** SVG drawing height. Width is responsive via viewBox. */
  height?: number
  /** Compact mode: drops the label header and renders only the chart.
   *  Used inside the wheel overview panel where space is tight. */
  compact?: boolean
}

export function StrengthSparkline({
  fundId, initialSnapshots, limit = 24, height = 56, compact = false,
}: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>(initialSnapshots ?? [])
  const [loading, setLoading] = useState(initialSnapshots == null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/portfolio/funds/${fundId}/assessment/history?limit=${limit}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (Array.isArray(data?.snapshots)) {
          // History endpoint returns DESC; reverse so the line draws
          // chronologically left-to-right.
          setSnapshots([...data.snapshots].reverse())
        }
      })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Failed to load") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fundId, limit])

  // ── empty / loading states ──

  if (loading && snapshots.length === 0) {
    return (
      <Frame compact={compact}>
        <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading history…
        </div>
      </Frame>
    )
  }

  if (snapshots.length === 0) {
    return (
      <Frame compact={compact}>
        <div className="text-[10px] font-mono text-muted-foreground">
          {error ?? "No snapshots yet — save any field to start tracking the Strength score over time."}
        </div>
      </Frame>
    )
  }

  // ── chart geometry ──

  const W = 280
  const H = height
  const PAD_X = 8
  const PAD_Y = 8
  const innerW = W - PAD_X * 2
  const innerH = H - PAD_Y * 2

  const xs = snapshots.map((_, i) => snapshots.length === 1 ? innerW / 2 : (i / (snapshots.length - 1)) * innerW + PAD_X)
  const minStrength = Math.min(...snapshots.map((s) => s.strength))
  const maxStrength = Math.max(...snapshots.map((s) => s.strength))
  const span = Math.max(1, maxStrength - minStrength)
  const ys = snapshots.map((s) => {
    const norm = (s.strength - minStrength) / span
    // Invert: 0 at the bottom of the chart, 1 at the top.
    return H - PAD_Y - norm * innerH
  })

  const path = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x} ${ys[i]}`).join(" ")
  const areaPath = `${path} L ${xs[xs.length - 1]} ${H - PAD_Y} L ${xs[0]} ${H - PAD_Y} Z`

  const first = snapshots[0]
  const last = snapshots[snapshots.length - 1]
  const trend = last.strength - first.strength
  const trendUp = trend >= 0

  return (
    <Frame compact={compact}>
      {!compact && (
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="w-3 h-3" /> Score over time
          </div>
          <div className={`text-[10px] font-mono ${trendUp ? "text-emerald-700" : "text-rose-700"}`}>
            {trendUp ? "+" : ""}{trend} over {snapshots.length} snap{snapshots.length === 1 ? "" : "s"}
          </div>
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: `${H}px` }}
        role="img"
        aria-label={`Strength trajectory: ${first.strength} on ${formatDate(first.captured_at)} to ${last.strength} on ${formatDate(last.captured_at)}`}
      >
        {/* Subtle baseline at the chart bottom */}
        <line
          x1={PAD_X} y1={H - PAD_Y} x2={W - PAD_X} y2={H - PAD_Y}
          stroke="currentColor" strokeOpacity={0.08}
        />
        {/* Area fill */}
        <path d={areaPath} fill={trendUp ? "rgb(16 185 129 / 0.12)" : "rgb(244 63 94 / 0.12)"} />
        {/* Line */}
        <path
          d={path}
          fill="none"
          stroke={trendUp ? "rgb(16 185 129)" : "rgb(244 63 94)"}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Dots at each snapshot */}
        {xs.map((x, i) => (
          <circle
            key={i}
            cx={x}
            cy={ys[i]}
            r={i === xs.length - 1 ? 2.5 : 1.5}
            fill={trendUp ? "rgb(16 185 129)" : "rgb(244 63 94)"}
          >
            <title>{`${snapshots[i].strength} on ${formatDate(snapshots[i].captured_at)}`}</title>
          </circle>
        ))}
        {/* First + last labels (only when not too cramped) */}
        {snapshots.length >= 2 && (
          <>
            <text
              x={xs[0]} y={ys[0] - 5}
              fontSize={9} fontFamily="monospace"
              fill="currentColor" opacity={0.6}
            >
              {first.strength}
            </text>
            <text
              x={xs[xs.length - 1]} y={ys[ys.length - 1] - 5}
              fontSize={9} fontFamily="monospace"
              fill="currentColor" opacity={0.9}
              textAnchor="end"
            >
              {last.strength}
            </text>
          </>
        )}
      </svg>
      {!compact && (
        <div className="mt-1 flex items-center justify-between text-[9px] font-mono text-muted-foreground">
          <span>{formatDate(first.captured_at)}</span>
          <span>{formatDate(last.captured_at)}</span>
        </div>
      )}
    </Frame>
  )
}

function Frame({ children, compact }: { children: React.ReactNode; compact: boolean }) {
  if (compact) return <div>{children}</div>
  return (
    <div className="border border-foreground/10 rounded-md bg-foreground/[0.015] p-3">
      {children}
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
