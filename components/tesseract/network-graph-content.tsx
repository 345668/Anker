"use client"

/**
 * Relationship web — your LinkedIn network captured by the Anker extension,
 * rendered in the platform's design language: light canvas, editorial type,
 * mono micro-labels, thin hairline edges. React Flow drives pan/zoom/drag;
 * the radial layout puts you at the centre with one band per degree,
 * clustered by company.
 *
 * Data comes from GET /api/portfolio/network (owner-scoped LinkedIn captures
 * only; CRM contacts enrich matching people with the "In CRM" badge but do
 * not appear as standalone nodes). The node drawer answers "who can
 * introduce me?" via the ?intro= lookup against linkedin_mutuals.
 */

import { useCallback, useMemo, useState } from "react"
import useSWR from "swr"
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Panel, Handle, Position,
  type Node, type Edge, type NodeProps, type NodeMouseHandler,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Loader2, Search, X, ExternalLink, Users, RefreshCw, Chrome, Pencil, Download,
} from "lucide-react"
import Link from "next/link"
import { useNetworkWebMcp } from "@/components/webmcp/network-tools"
import type { GraphNode, GraphEdge, GraphStats, EdgeType } from "@/lib/portfolio/network-graph"

const STORE_URL = "https://chromewebstore.google.com/detail/anker-linkedin/acnchlkijdhbdghedndbdikpjjcmffcp"

// ── Palette ──────────────────────────────────────────────────────────────────
//
// Grayscale by distance — closer people read darker/heavier, like type on a
// page. Colour is reserved for meaning: cobalt is you (the focal point),
// emerald when a person sits at a company you're actively evaluating (deal
// edges), and platform-primary for CRM.

const ACCENT = "#2f45e0" // cobalt — the "you" focal colour

const DEGREE_RING: Record<number, string> = {
  1: "border-foreground/70",
  2: "border-foreground/35",
  3: "border-foreground/20",
}

// Fixed radius per degree band — gives the web a legible concentric structure
// (matched by the faint guide rings) instead of one continuous spiral.
const BAND_RADIUS: Record<number, number> = { 1: 340, 2: 680, 3: 1020 }
const SUB_GAP = 96
const ARC = 150

const EDGE_STYLE: Record<EdgeType, { stroke: string; dash?: string; opacity: number; width: number }> = {
  me:      { stroke: "#111111", opacity: 0.07, width: 1 },
  mutual:  { stroke: "#111111", opacity: 0.4,  width: 1.2 },
  company: { stroke: "#111111", dash: "3 4", opacity: 0.12, width: 1 },
  tag:     { stroke: "#111111", dash: "2 5", opacity: 0.15, width: 1 },
  deal:    { stroke: "#059669", dash: "5 3", opacity: 0.55, width: 1.2 },
}

const EDGE_LABELS: Record<EdgeType, string> = {
  me: "Direct", mutual: "Mutual", company: "Company", tag: "Tag", deal: "Deal",
}

const MINIMAP_COLOR: Record<number, string> = { 0: "#111111", 1: "#333333", 2: "#8a8a8a", 3: "#c4c4c4" }

// ── Person node ──────────────────────────────────────────────────────────────

type PersonNodeData = { person: GraphNode; dim: boolean }

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?"
}

function PersonNode({ data }: NodeProps) {
  const { person: p, dim } = data as PersonNodeData
  const isMe = p.kind === "me"
  const size = isMe ? 56 : p.degree === 1 ? 40 : p.degree === 2 ? 32 : 26

  return (
    <div
      className="relative flex flex-col items-center"
      style={{ opacity: dim ? 0.25 : 1, width: 140 }}
      title={p.name}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      <div
        className={
          isMe
            ? "rounded-full text-white flex items-center justify-center font-mono text-[11px] uppercase tracking-wider"
            : `rounded-full bg-background border-2 ${DEGREE_RING[p.degree] ?? "border-foreground/20"} flex items-center justify-center overflow-hidden shadow-sm`
        }
        style={isMe
          ? { width: size, height: size, background: ACCENT, boxShadow: `0 0 0 6px ${ACCENT}18, 0 2px 8px ${ACCENT}40` }
          : { width: size, height: size }}
      >
        {isMe ? (
          "You"
        ) : p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="font-mono text-[10px] text-foreground/70">{initials(p.name)}</span>
        )}
      </div>

      {/* CRM marker — a small filled dot on the rim, platform-primary. */}
      {p.inCrm && !isMe && (
        <span
          className="absolute rounded-full bg-primary border-2 border-background"
          style={{ width: 10, height: 10, top: 0, left: `calc(50% + ${size / 2 - 8}px)` }}
          aria-label="In CRM"
        />
      )}

      {!isMe && (
        <>
          <div className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-foreground text-center max-w-[140px] truncate">
            {p.name}
          </div>
          {p.company && (
            <div className="text-[9px] text-muted-foreground text-center max-w-[140px] truncate leading-tight">
              {p.company}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Ring guide (concentric degree bands drawn behind the web) ─────────────────

type RingGuideData = { radii: { deg: number; r: number }[]; cx: number }
const degLabel = (d: number) => (d === 1 ? "1st degree" : d === 2 ? "2nd degree" : "3rd degree")

function RingGuide({ data }: NodeProps) {
  const { radii, cx } = data as RingGuideData
  const size = cx * 2
  return (
    <svg width={size} height={size} className="overflow-visible pointer-events-none">
      {radii.map(({ deg, r }) => (
        <g key={deg}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="currentColor"
            className="text-foreground" style={{ opacity: 0.07 }} strokeWidth={1} strokeDasharray="2 7" />
          <text x={cx} y={cx - r - 10} textAnchor="middle"
            className="fill-current text-muted-foreground"
            style={{ fontSize: 12, fontFamily: "var(--font-jetbrains, monospace)", letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.6 }}>
            {degLabel(deg)}
          </text>
        </g>
      ))}
    </svg>
  )
}

const nodeTypes = { person: PersonNode, ringGuide: RingGuide }

// ── Layout ───────────────────────────────────────────────────────────────────
//
// Concentric bands: you at the centre, one fixed-radius band per degree, and
// company-clustered nodes spread around each band (splitting into a couple of
// staggered sub-rings when a band is crowded). Faint guide rings mark each band.

function layout(nodes: GraphNode[]): Node[] {
  const me = nodes.find((n) => n.kind === "me")
  const rings = new Map<number, GraphNode[]>()
  for (const n of nodes) {
    if (n.kind === "me") continue
    const d = Math.min(Math.max(n.degree, 1), 3)
    rings.set(d, [...(rings.get(d) || []), n])
  }
  const present = [...rings.keys()].sort((a, b) => a - b)
  const cx = (present.length ? BAND_RADIUS[present[present.length - 1]] : 340) + 160

  const out: Node[] = []
  // Guide rings sit behind everything, centred on "me" (whose centre is 0,0).
  out.push({
    id: "ring-guide", type: "ringGuide",
    position: { x: -cx, y: -cx }, zIndex: -1, draggable: false, selectable: false,
    data: { cx, radii: present.map((deg) => ({ deg, r: BAND_RADIUS[deg] })) } as RingGuideData,
  })
  out.push({
    id: "me", type: "person", position: { x: -28, y: -28 }, zIndex: 3,
    data: { person: me!, dim: false }, draggable: true,
  })

  for (const deg of present) {
    const ring = rings.get(deg)!.slice().sort((a, b) =>
      (a.company || "zzz").localeCompare(b.company || "zzz") || a.name.localeCompare(b.name))
    const base = BAND_RADIUS[deg]
    const cap = Math.max(8, Math.floor((2 * Math.PI * base) / ARC))
    const nSub = Math.max(1, Math.ceil(ring.length / cap))
    let idx = 0
    for (let s = 0; s < nSub; s++) {
      const take = Math.ceil((ring.length - idx) / (nSub - s))
      const slice = ring.slice(idx, idx + take)
      idx += take
      const r = base + (s - (nSub - 1) / 2) * SUB_GAP
      // Stagger alternate sub-rings so adjacent nodes don't line up radially.
      const offset = -Math.PI / 2 + (s % 2) * (Math.PI / Math.max(slice.length, 1))
      slice.forEach((p, j) => {
        const angle = (2 * Math.PI * j) / slice.length + offset
        out.push({
          id: p.id, type: "person", zIndex: 1, draggable: true,
          position: { x: Math.cos(angle) * r - 70, y: Math.sin(angle) * r - 20 },
          data: { person: p, dim: false },
        })
      })
    }
  }
  return out
}

// ── Drawer ───────────────────────────────────────────────────────────────────

const fetcher = (u: string) => fetch(u).then((r) => r.json())

function NodeDrawer({ person, onClose, onUpdated }: { person: GraphNode; onClose: () => void; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false)
  const { data: introData, isLoading: introLoading } = useSWR<{ paths: Array<{ name: string; url: string | null }> }>(
    person.linkedinUrl && person.degree >= 2
      ? `/api/portfolio/network?intro=${encodeURIComponent(person.linkedinUrl)}`
      : null,
    fetcher,
  )
  const paths = introData?.paths || []

  return (
    <div className="absolute top-0 right-0 h-full w-80 z-10 border-l border-foreground/10 bg-background/95 backdrop-blur-sm p-5 overflow-y-auto">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-lg truncate">{person.name}</h3>
          <p className="text-sm text-muted-foreground text-pretty">
            {[person.title, person.company].filter(Boolean).join(" · ") || person.headline || "—"}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {person.connectionId && (
            <button onClick={() => setEditing((v) => !v)} aria-label="Edit profile"
              className={`p-1.5 rounded-md hover:bg-foreground/5 ${editing ? "text-foreground" : "text-muted-foreground"}`}>
              <Pencil className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} aria-label="Close details"
            className="p-1.5 rounded-md hover:bg-foreground/5 text-muted-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {editing && person.connectionId && (
        <ConnectionEditForm person={person} onDone={() => { setEditing(false); onUpdated() }} />
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-foreground/15">
          {person.degree === 1 ? "1st degree" : person.degree === 2 ? "2nd degree" : "3rd degree"}
        </span>
        {person.inCrm && (
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
            In CRM
          </span>
        )}
        {person.jobChangedAt && (
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-amber-500/40 text-amber-700 bg-amber-500/5"
            title={person.previousCompany ? `Previously at ${person.previousCompany}` : undefined}>
            Job change
          </span>
        )}
        {person.status && (
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-foreground/15">
            {person.status}
          </span>
        )}
        {person.tags.slice(0, 6).map((t) => (
          <span key={t} className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-foreground/5 text-muted-foreground">
            {t}
          </span>
        ))}
      </div>

      {person.location && (
        <p className="mt-3 text-xs text-muted-foreground">{person.location}</p>
      )}
      {person.headline && person.title && (
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{person.headline}</p>
      )}
      {person.summary && (
        <div className="mt-4">
          <h4 className="text-xs font-mono uppercase tracking-wide text-muted-foreground">About</h4>
          <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-line">{person.summary}</p>
        </div>
      )}
      {person.notes && (
        <div className="mt-4">
          <h4 className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Notes</h4>
          <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-line text-muted-foreground">{person.notes}</p>
        </div>
      )}

      {/* Intro paths: mutual 1st-degree connections who can introduce you. */}
      {person.degree >= 2 && person.linkedinUrl && (
        <div className="mt-5">
          <h4 className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Warm intro paths</h4>
          {introLoading ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Checking mutuals…
            </div>
          ) : paths.length ? (
            <ul className="mt-2 space-y-1.5">
              {paths.map((p, i) => (
                <li key={i} className="text-sm flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-hidden />
                  {p.url ? (
                    <a href={`https://${p.url}`} target="_blank" rel="noreferrer" className="hover:underline truncate">
                      {p.name}
                    </a>
                  ) : (
                    <span className="truncate">{p.name}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              No mutual connections captured yet. Open their LinkedIn profile with the
              extension installed to record mutuals.
            </p>
          )}
        </div>
      )}

      <div className="mt-6 space-y-2">
        {person.linkedinUrl && (
          <a href={`https://${person.linkedinUrl}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 text-sm px-3 h-9 rounded-md border border-foreground/15 hover:bg-foreground/5">
            <ExternalLink className="w-4 h-4" /> Open LinkedIn profile
          </a>
        )}
        {person.contactId && (
          <Link href={`/dashboard/crm?contact=${person.contactId}`}
            className="flex items-center gap-2 text-sm px-3 h-9 rounded-md border border-foreground/15 hover:bg-foreground/5">
            <Users className="w-4 h-4" /> View in CRM
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

interface ApiGraph { nodes: GraphNode[]; edges: GraphEdge[]; stats: GraphStats }

const ALL_EDGE_TYPES: EdgeType[] = ["me", "mutual", "company", "tag", "deal"]

export function NetworkGraphContent() {
  const [q, setQ] = useState("")
  const [qLive, setQLive] = useState("")
  const [degrees, setDegrees] = useState<number[]>([1, 2, 3])
  const [edgeTypes, setEdgeTypes] = useState<EdgeType[]>(["me", "mutual", "company", "deal"])
  const [warmOnly, setWarmOnly] = useState(false)
  const [selected, setSelected] = useState<GraphNode | null>(null)

  const params = new URLSearchParams()
  if (degrees.length && degrees.length < 3) params.set("degrees", degrees.join(","))
  if (edgeTypes.length && edgeTypes.length < ALL_EDGE_TYPES.length) params.set("edges", edgeTypes.join(","))
  if (warmOnly) params.set("warm", "1")
  if (q) params.set("q", q)

  const { data, isLoading, mutate } = useSWR<ApiGraph>(
    `/api/portfolio/network?${params.toString()}`, fetcher, { revalidateOnFocus: false },
  )

  useNetworkWebMcp({
    onSearch: (v: string) => { setQLive(v); setQ(v) },
    onFilter: ({ warmOnly, degrees }: { warmOnly?: boolean; degrees?: number[] }) => {
      if (typeof warmOnly === "boolean") setWarmOnly(warmOnly)
      if (Array.isArray(degrees) && degrees.length) setDegrees(degrees)
    },
    onOpenIntro: async (url: string) => {
      const person = ((data?.nodes || []) as any[]).find((n) => n.linkedinUrl === url) || null
      if (person) { setSelected(person as any); return { ok: true, paths: 0 } }
      return { ok: false, hint: "No node in the current graph matches that URL. Widen your filters or run Sync." }
    },
  })

  const rfNodes = useMemo(() => (data ? layout(data.nodes) : []), [data])
  const rfEdges = useMemo<Edge[]>(() => {
    if (!data) return []
    return data.edges.map((e) => {
      const s = EDGE_STYLE[e.type]
      return {
        id: e.id, source: e.source, target: e.target,
        style: {
          stroke: s.stroke,
          strokeDasharray: s.dash,
          opacity: s.opacity,
          strokeWidth: s.width,
        },
        type: "straight" as const,
      }
    })
  }, [data])

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    if (node.type !== "person") return
    const p = (node.data as PersonNodeData).person
    setSelected(p.kind === "me" ? null : p)
  }, [])

  const degCounts = useMemo(() => {
    const c: Record<number, number> = { 1: 0, 2: 0, 3: 0 }
    for (const n of data?.nodes || []) if (n.kind !== "me") c[Math.min(Math.max(n.degree, 1), 3)]++
    return c
  }, [data])

  function toggleDegree(d: number) {
    setDegrees((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort())
  }
  function toggleEdge(t: EdgeType) {
    setEdgeTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])
  }

  const stats = data?.stats
  const empty = !isLoading && data && data.nodes.length <= 1

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header — platform editorial block */}
      <div className="border-b border-foreground/10">
        <div className="px-6 lg:px-12 py-6 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              <span className="w-2.5 h-2.5 bg-[#2f45e0]" /> Network · LinkedIn connections
            </div>
            <h1 className="text-3xl font-display tracking-tight">
              Relationship web
            </h1>
          </div>
          <div className="flex items-center gap-6">
            {stats && (
              <>
                <div className="text-right">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">People</div>
                  <div className="font-display text-2xl">{stats.total}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">In CRM</div>
                  <div className="font-display text-2xl">{stats.inCrm}</div>
                </div>
                <div className="text-right hidden sm:block">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">1st · 2nd · 3rd</div>
                  <div className="font-display text-2xl tabular-nums">
                    {degCounts[1]} <span className="text-muted-foreground/50">·</span> {degCounts[2]} <span className="text-muted-foreground/50">·</span> {degCounts[3]}
                  </div>
                </div>
                {stats.truncated && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-amber-600">truncated</span>
                )}
              </>
            )}
            <a href="/api/portfolio/network/export?format=xlsx"
              className="inline-flex items-center gap-2 rounded-full h-9 px-4 border border-foreground/15 hover:bg-foreground/5 text-sm"
              title="Download your captured network (CSV also available via ?format=csv)">
              <Download className="w-4 h-4" />
              Export
            </a>
            <Link href="/dashboard/settings/extension-tokens"
              className="inline-flex items-center gap-2 rounded-full h-9 px-4 border border-foreground/15 hover:bg-foreground/5 text-sm">
              <Chrome className="w-4 h-4" />
              Extension setup
            </Link>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-6 lg:px-12 pb-4 flex flex-wrap items-center gap-3">
          <form className="relative" onSubmit={(e) => { e.preventDefault(); setQ(qLive) }}>
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
            <input
              value={qLive}
              onChange={(e) => { setQLive(e.target.value); if (!e.target.value) setQ("") }}
              placeholder="Search name, company, title…"
              aria-label="Search network"
              className="h-9 w-64 pl-8 pr-3 rounded-md border border-input bg-background text-sm"
            />
          </form>

          <div className="flex items-center gap-1" role="group" aria-label="Degree filter">
            {[1, 2, 3].map((d) => (
              <button key={d} onClick={() => toggleDegree(d)}
                className={`h-8 px-3 rounded-full text-xs font-mono border transition-colors ${
                  degrees.includes(d)
                    ? "bg-foreground text-background border-foreground"
                    : "border-foreground/15 text-muted-foreground hover:bg-foreground/5"
                }`}>
                {d === 1 ? "1st" : d === 2 ? "2nd" : "3rd"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1" role="group" aria-label="Edge type filter">
            {ALL_EDGE_TYPES.map((t) => (
              <button key={t} onClick={() => toggleEdge(t)}
                className={`h-8 px-3 rounded-full text-xs font-mono border transition-colors ${
                  edgeTypes.includes(t)
                    ? t === "deal"
                      ? "border-emerald-600/50 text-emerald-700 bg-emerald-500/5"
                      : "border-foreground/40 text-foreground"
                    : "border-foreground/15 text-muted-foreground/60 hover:bg-foreground/5"
                }`}>
                {EDGE_LABELS[t]}
              </button>
            ))}
          </div>

          <button onClick={() => setWarmOnly((w) => !w)}
            className={`h-8 px-3 rounded-full text-xs font-mono border transition-colors ${
              warmOnly ? "bg-primary text-primary-foreground border-primary" : "border-foreground/15 text-muted-foreground hover:bg-foreground/5"
            }`}>
            Warm only
          </button>

          <button onClick={() => mutate()} aria-label="Refresh graph"
            className="h-8 w-8 rounded-full border border-foreground/15 flex items-center justify-center text-muted-foreground hover:bg-foreground/5">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 min-h-0">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {empty ? (
          <div className="h-full flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-4">
              <Chrome className="w-10 h-10 mx-auto text-muted-foreground" aria-hidden />
              <h2 className="font-display text-xl text-balance">Your relationship web is empty</h2>
              <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
                Install the Anker LinkedIn extension, open your LinkedIn connections page,
                and use the popup&apos;s <strong>My Connections</strong> tab to sync your
                network. Captured people appear here as an interactive web with
                warm-intro paths.
              </p>
              <div className="flex items-center justify-center gap-3">
                <a href={STORE_URL} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full h-10 px-5 bg-foreground text-background hover:bg-foreground/90 text-sm">
                  <Chrome className="w-4 h-4" />
                  Add to Chrome
                </a>
                <Link href="/dashboard/settings/extension-tokens"
                  className="text-sm underline underline-offset-4 text-muted-foreground hover:text-foreground">
                  Setup guide
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelected(null)}
            fitView
            minZoom={0.05}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            elementsSelectable
            className="bg-background"
          >
            <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="rgba(0,0,0,0.10)" />
            <Controls showInteractive={false}
              className="!bg-background !border-foreground/10 !shadow-sm [&_button]:!bg-transparent [&_button]:!border-foreground/10 [&_button]:!text-foreground/70 [&_button:hover]:!bg-foreground/5" />
            <MiniMap pannable zoomable
              maskColor="rgba(255,255,255,0.85)"
              style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.08)" }}
              nodeColor={(n) => {
                if (n.type !== "person") return "transparent"
                const p = (n.data as PersonNodeData).person
                return p.kind === "me" ? ACCENT : (MINIMAP_COLOR[p.degree] ?? "#c4c4c4")
              }} />

            {/* Legend — explains the visual language */}
            <Panel position="bottom-left" className="!m-3">
              <div className="rounded-lg border border-foreground/10 bg-background/90 backdrop-blur-sm px-3.5 py-3 shadow-sm text-[11px] space-y-1.5">
                <div className="font-mono uppercase tracking-wider text-muted-foreground mb-1.5">Legend</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: ACCENT }} /> You</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-foreground/70 shrink-0" /> Bigger / darker = closer (1st→3rd)</div>
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" /> In CRM</div>
                <div className="flex items-center gap-2"><span className="inline-block w-5 border-t-2 border-dashed shrink-0" style={{ borderColor: "#059669" }} /> At a deal company</div>
                <div className="flex items-center gap-2"><span className="inline-block w-5 border-t shrink-0" style={{ borderColor: "rgba(17,17,17,0.4)" }} /> Mutual connection</div>
              </div>
            </Panel>
          </ReactFlow>
        )}

        {selected && (
          <NodeDrawer person={selected} onClose={() => setSelected(null)}
            onUpdated={() => { setSelected(null); mutate() }} />
        )}
      </div>
    </div>
  )
}


// ── Connection profile editing ───────────────────────────────────────────────
//
// Captured LinkedIn profiles are editable on the platform: occupation
// (headline), company, title, location, the about summary, and private
// notes. Saves PATCH /api/portfolio/network/connections/[id].

function ConnectionEditForm({ person, onDone }: { person: GraphNode; onDone: () => void }) {
  const [form, setForm] = useState({
    full_name: person.name === "Unknown" ? "" : person.name,
    headline: person.headline ?? "",
    company: person.company ?? "",
    title: person.title ?? "",
    location: person.location ?? "",
    summary: person.summary ?? "",
    notes: person.notes ?? "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/portfolio/network/connections/${person.connectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`)
      onDone()
    } catch (e: any) { setError(e?.message ?? "Save failed") }
    finally { setSaving(false) }
  }

  const inp = "w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm"
  const lbl = "block font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-1"

  return (
    <div className="mt-4 border border-foreground/10 rounded-lg p-3 space-y-2.5">
      {error && <div className="text-xs text-destructive">{error}</div>}
      <div><label className={lbl}>Name</label><input value={form.full_name} onChange={set("full_name")} className={inp} /></div>
      <div><label className={lbl}>Headline / occupation</label><input value={form.headline} onChange={set("headline")} className={inp} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={lbl}>Company</label><input value={form.company} onChange={set("company")} className={inp} /></div>
        <div><label className={lbl}>Title</label><input value={form.title} onChange={set("title")} className={inp} /></div>
      </div>
      <div><label className={lbl}>Location</label><input value={form.location} onChange={set("location")} className={inp} /></div>
      <div><label className={lbl}>About / summary</label>
        <textarea value={form.summary} onChange={set("summary")} rows={4}
          className="w-full p-2.5 rounded-md border border-input bg-background text-sm" /></div>
      <div><label className={lbl}>Notes (private)</label>
        <textarea value={form.notes} onChange={set("notes")} rows={3}
          className="w-full p-2.5 rounded-md border border-input bg-background text-sm" /></div>
      <button onClick={save} disabled={saving}
        className="inline-flex items-center gap-2 rounded-full h-9 px-4 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        Save profile
      </button>
    </div>
  )
}
