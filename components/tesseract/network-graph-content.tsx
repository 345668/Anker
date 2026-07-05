"use client"

/**
 * Relationship web: CRM contacts + LinkedIn captures rendered as a night-sky
 * constellation. React Flow still drives pan/zoom/drag/drawer, but every node
 * is a luminous star, edges are thin constellation lines, and the canvas is
 * a deep-space starfield. Radial layout — you at the centre, one degree ring
 * per band, clustered by firm so companies read as their own constellations.
 *
 * Data comes from GET /api/portfolio/network (owner-scoped LinkedIn data,
 * org-wide contacts). The node drawer answers "who can introduce me?" via
 * the ?intro= lookup against linkedin_mutuals.
 */

import { useCallback, useMemo, useState } from "react"
import useSWR from "swr"
import {
  ReactFlow, Controls, MiniMap, Handle, Position,
  type Node, type Edge, type NodeProps, type NodeMouseHandler,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Loader2, Search, X, ExternalLink, Users, Waypoints, RefreshCw, Chrome,
} from "lucide-react"
import Link from "next/link"
import { useNetworkWebMcp } from "@/components/webmcp/network-tools"
import type { GraphNode, GraphEdge, GraphStats, EdgeType } from "@/lib/portfolio/network-graph"

// ── Stellar palette ──────────────────────────────────────────────────────────
//
// Star classes mapped by degree — brighter/whiter for closer, deeper for the
// outer ring. "You" is a supernova at the centre. Colours are picked to read
// well on a near-black backdrop while staying identifiable when the canvas is
// zoomed out to constellation scale.

const DEGREE_COLOR: Record<number, string> = {
  0: "#fef3c7", // me — bright yellow-white
  1: "#7dd3fc", // 1st — sirius blue-white
  2: "#f59e0b", // 2nd — amber giant
  3: "#a78bfa", // 3rd — distant violet
}

const EDGE_STYLE: Record<EdgeType, { stroke: string; dash?: string; opacity: number }> = {
  me:      { stroke: "#7dd3fc", opacity: 0.35 },                 // radiating from you
  mutual:  { stroke: "#fef3c7", opacity: 0.75 },                 // brightest ties
  company: { stroke: "#94a3b8", dash: "3 4", opacity: 0.35 },    // faint cluster ties
  tag:     { stroke: "#22d3ee", dash: "2 5", opacity: 0.4 },
  deal:    { stroke: "#f472b6", dash: "5 3", opacity: 0.7 },
}

const EDGE_LABELS: Record<EdgeType, string> = {
  me: "Direct", mutual: "Mutual", company: "Company", tag: "Tag", deal: "Deal",
}

// ── Star node ────────────────────────────────────────────────────────────────
//
// A person is rendered as a 4-point diffraction star (like real stellar
// photography — bright core + orthogonal spikes) inside a radial-glow halo.
// Nothing is drawn as a filled circle; every shape is either a spike, a glow,
// or a label. In-CRM stars pulse-glow. "You" is a supernova with a wider halo
// and a stronger cross.

type PersonNodeData = { person: GraphNode; dim: boolean }

/** Deterministic 0..1 hash off the profile id — used to give each star a
 *  stable brightness/twinkle offset so the sky doesn't shimmer identically. */
function seed01(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return ((h >>> 0) % 1000) / 1000
}

function PersonNode({ data }: NodeProps) {
  const { person: p, dim } = data as PersonNodeData
  const isMe = p.kind === "me"
  const color = DEGREE_COLOR[p.degree] ?? "#94a3b8"

  // Star magnitude: brighter when closer + in CRM. Bounded so degree-3 nodes
  // still render as visible pinpoints rather than disappearing entirely.
  const t = seed01(p.id)
  const baseR = isMe ? 22 : 4 + (3 - p.degree) * 3 + (p.inCrm ? 3 : 0) + t * 2  // core radius
  const spikeR = baseR * (isMe ? 3.2 : p.inCrm ? 2.8 : 2.2)                     // spike reach
  const glowR = spikeR * 2.4                                                    // halo radius
  const box = Math.ceil(glowR * 2) + 8

  const label = isMe ? "You" : p.name

  return (
    <div
      className="relative flex flex-col items-center"
      style={{ opacity: dim ? 0.2 : 1, width: Math.max(140, box) }}
      title={p.name}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      <svg
        width={box} height={box} viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`}
        style={{ overflow: "visible", display: "block" }}
        aria-hidden
      >
        <defs>
          {/* Radial halo — colour fades to fully transparent at glowR. */}
          <radialGradient id={`glow-${p.id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor={color} stopOpacity={isMe ? 0.75 : p.inCrm ? 0.55 : 0.35} />
            <stop offset="40%" stopColor={color} stopOpacity={0.12} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </radialGradient>
          {/* Spike gradient — hot core to faint tip. */}
          <linearGradient id={`spike-h-${p.id}`} x1="0" x2="1" y1="0.5" y2="0.5">
            <stop offset="0%"  stopColor={color} stopOpacity={0} />
            <stop offset="50%" stopColor="#ffffff" stopOpacity={isMe ? 1 : 0.9} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`spike-v-${p.id}`} x1="0.5" x2="0.5" y1="0" y2="1">
            <stop offset="0%"  stopColor={color} stopOpacity={0} />
            <stop offset="50%" stopColor="#ffffff" stopOpacity={isMe ? 1 : 0.9} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Outer halo */}
        <circle cx="0" cy="0" r={glowR} fill={`url(#glow-${p.id})`} />

        {/* Diagonal glimmer for supernova / bright stars */}
        {(isMe || p.inCrm) && (
          <g opacity={isMe ? 0.5 : 0.3}>
            <rect x={-spikeR * 0.9} y={-0.6} width={spikeR * 1.8} height={1.2}
                  fill={`url(#spike-h-${p.id})`} transform="rotate(45)" />
            <rect x={-spikeR * 0.9} y={-0.6} width={spikeR * 1.8} height={1.2}
                  fill={`url(#spike-h-${p.id})`} transform="rotate(-45)" />
          </g>
        )}

        {/* Primary + secondary diffraction spikes */}
        <rect x={-spikeR} y={-0.9} width={spikeR * 2} height={1.8} fill={`url(#spike-h-${p.id})`} />
        <rect x={-0.9} y={-spikeR} width={1.8} height={spikeR * 2} fill={`url(#spike-v-${p.id})`} />

        {/* Bright core */}
        <circle cx="0" cy="0" r={baseR * 0.7} fill="#ffffff" opacity={isMe ? 1 : 0.95} />
        <circle cx="0" cy="0" r={baseR} fill={color} opacity={0.85} />
        <circle cx="0" cy="0" r={baseR * 0.35} fill="#ffffff" />

        {/* Optional avatar clipped to the core — very small so it reads as
            "the star is a person" without competing with the glow. */}
        {p.image && !isMe && (
          <>
            <defs>
              <clipPath id={`clip-${p.id}`}><circle cx="0" cy="0" r={baseR * 0.9} /></clipPath>
            </defs>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <image href={p.image}
                   x={-baseR} y={-baseR} width={baseR * 2} height={baseR * 2}
                   clipPath={`url(#clip-${p.id})`} preserveAspectRatio="xMidYMid slice" opacity={0.75} />
          </>
        )}
      </svg>

      {/* Label sits below the star. Uppercase mono gives it that old-star-atlas
          feel. Font size and colour scale down for outer rings. */}
      <div
        className="mt-1 font-mono uppercase tracking-wider text-center max-w-[140px] truncate"
        style={{
          fontSize: isMe ? 12 : p.degree === 1 ? 11 : 10,
          color: isMe ? "#fef3c7" : p.inCrm ? color : "rgba(226,232,240,0.75)",
          letterSpacing: "0.08em",
          textShadow: "0 0 6px rgba(0,0,0,0.85)",
        }}
      >
        {label}
      </div>
      {!isMe && p.company && (
        <div
          className="text-[9px] leading-tight text-center max-w-[140px] truncate"
          style={{ color: "rgba(148,163,184,0.7)", textShadow: "0 0 6px rgba(0,0,0,0.85)" }}
        >
          {p.company}
        </div>
      )}
    </div>
  )
}

const nodeTypes = { person: PersonNode }

// ── Layout ───────────────────────────────────────────────────────────────────

function layout(nodes: GraphNode[]): Node[] {
  const rings = new Map<number, GraphNode[]>()
  for (const n of nodes) {
    if (n.kind === "me") continue
    const d = Math.min(Math.max(n.degree, 1), 3)
    rings.set(d, [...(rings.get(d) || []), n])
  }
  const out: Node[] = [{
    id: "me", type: "person", position: { x: -36, y: -36 },
    data: { person: nodes.find((n) => n.kind === "me")!, dim: false },
    draggable: true,
  }]
  // Each degree band fills concentric sub-rings greedily by capacity: a ring
  // at radius r fits ~(2πr / ARC) nodes, so inner rings hold fewer and outer
  // rings hold more. This keeps the web compact (annulus, not one huge circle)
  // while guaranteeing every node ~ARC px of breathing room.
  const ARC = 150
  const SUB_RING_GAP = 190
  const BAND_GAP = 360
  let bandStart = 60 // just outside the "me" node
  const orderedDegrees = [...rings.keys()].sort((a, b) => a - b)
  for (const deg of orderedDegrees) {
    const ring = rings.get(deg)!
    // Group companies together around the ring so clusters are adjacent.
    ring.sort((a, b) =>
      (a.company || "zzz").localeCompare(b.company || "zzz") || a.name.localeCompare(b.name))
    let r = bandStart + BAND_GAP
    let i = 0
    let sub = 0
    while (i < ring.length) {
      const capacity = Math.max(12, Math.floor((2 * Math.PI * r) / ARC))
      const slice = ring.slice(i, i + capacity)
      const n = slice.length
      // Stagger sub-ring start angles so radial "spokes" don't align.
      const offset = -Math.PI / 2 + sub * 0.35
      slice.forEach((p, j) => {
        const angle = (2 * Math.PI * j) / n + offset
        out.push({
          id: p.id, type: "person",
          position: { x: Math.cos(angle) * r - 60, y: Math.sin(angle) * r - 22 },
          data: { person: p, dim: false },
          draggable: true,
        })
      })
      i += n
      sub += 1
      bandStart = r
      r += SUB_RING_GAP
    }
  }
  return out
}

// ── Drawer ───────────────────────────────────────────────────────────────────

const fetcher = (u: string) => fetch(u).then((r) => r.json())

function NodeDrawer({ person, onClose }: { person: GraphNode; onClose: () => void }) {
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
        <button onClick={onClose} aria-label="Close details"
          className="p-1.5 rounded-md hover:bg-foreground/5 text-muted-foreground shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-foreground/15">
          {person.degree === 1 ? "1st degree" : person.degree === 2 ? "2nd degree" : "3rd degree"}
        </span>
        {person.inCrm && (
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
            In CRM
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
          strokeWidth: e.type === "mutual" ? 1.2 : 0.7,
          // Cheap glow via drop-shadow filter; browsers render this fast even
          // with several hundred edges. Falls back gracefully if filter is
          // unsupported.
          filter: `drop-shadow(0 0 3px ${s.stroke}66)`,
        },
        type: "straight" as const,
      }
    })
  }, [data])

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    const p = (node.data as PersonNodeData).person
    setSelected(p.kind === "me" ? null : p)
  }, [])

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
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-foreground/10">
        <div className="flex items-center gap-2">
          <Waypoints className="w-5 h-5 text-primary" aria-hidden />
          <h1 className="font-display text-lg">Network</h1>
        </div>

        <form className="relative" onSubmit={(e) => { e.preventDefault(); setQ(qLive) }}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
          <input
            value={qLive}
            onChange={(e) => { setQLive(e.target.value); if (!e.target.value) setQ("") }}
            placeholder="Search name, company, title…"
            aria-label="Search network"
            className="h-9 w-64 pl-8 pr-3 rounded-md border border-foreground/15 bg-background text-sm"
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
                  ? "border-foreground/40 text-foreground"
                  : "border-foreground/15 text-muted-foreground/50 hover:bg-foreground/5"
              }`}
              style={edgeTypes.includes(t) ? { borderColor: EDGE_STYLE[t].stroke, color: EDGE_STYLE[t].stroke } : undefined}>
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

        {stats && (
          <div className="ml-auto flex items-center gap-3 text-xs font-mono text-muted-foreground">
            <span>{stats.total} people</span>
            <span className="text-primary">{stats.inCrm} in CRM</span>
            {stats.truncated && <span className="text-amber-600">truncated</span>}
          </div>
        )}
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
              <Waypoints className="w-10 h-10 mx-auto text-muted-foreground" aria-hidden />
              <h2 className="font-display text-xl text-balance">Your relationship web is empty</h2>
              <p className="text-sm text-muted-foreground leading-relaxed text-pretty">
                Install the Anker LinkedIn extension, open your LinkedIn connections page,
                and click <strong>Sync network to Anker</strong>. Captured people and your
                CRM contacts will appear here as an interactive web with warm-intro paths.
              </p>
              <div className="flex items-center justify-center gap-2 text-xs font-mono text-muted-foreground">
                <Chrome className="w-4 h-4" aria-hidden />
                extensions/linkedin · see README for install steps
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, #0b1220 0%, #05080f 55%, #02030a 100%)" }}>
            {/* Static starfield backdrop — SVG so it survives zoom/pan behind
                the graph. Rendered once, not tied to React Flow's viewport. */}
            <StarfieldBackdrop />

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
              className="constellation-canvas"
              style={{ background: "transparent" }}
            >
              {/* No dot-grid on a night sky. */}
              <Controls showInteractive={false} className="!bg-slate-900/70 !border-white/10 [&_button]:!bg-transparent [&_button]:!text-slate-200 [&_button:hover]:!bg-white/10" />
              <MiniMap pannable zoomable
                       maskColor="rgba(2,3,10,0.85)"
                       style={{ background: "#05080f", border: "1px solid rgba(255,255,255,0.08)" }}
                       nodeColor={(n) => DEGREE_COLOR[(n.data as PersonNodeData).person.degree] ?? "#94a3b8"} />
            </ReactFlow>
          </div>
        )}

        {selected && <NodeDrawer person={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  )
}

// ── Starfield backdrop ───────────────────────────────────────────────────────
//
// A pinned static SVG behind the ReactFlow canvas. ~180 random stars with
// varying brightness + a handful of larger "guide stars" with faint spikes.
// Deterministic seed so it doesn't twinkle every render.

function StarfieldBackdrop() {
  const stars = useMemo(() => {
    const rand = mulberry32(1729)
    const w = 1600, h = 900
    const small = Array.from({ length: 220 }, () => ({
      x: rand() * w, y: rand() * h,
      r: 0.3 + rand() * 1.1,
      o: 0.15 + rand() * 0.55,
    }))
    const bright = Array.from({ length: 14 }, () => ({
      x: rand() * w, y: rand() * h,
      r: 1.4 + rand() * 1.6,
      o: 0.6 + rand() * 0.35,
      hue: ["#7dd3fc", "#fef3c7", "#c7d2fe", "#fbcfe8"][Math.floor(rand() * 4)],
    }))
    return { small, bright, w, h }
  }, [])

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${stars.w} ${stars.h}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {stars.small.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />
      ))}
      {stars.bright.map((s, i) => (
        <g key={`b${i}`} transform={`translate(${s.x} ${s.y})`} opacity={s.o}>
          <circle r={s.r * 4} fill={s.hue} opacity={0.18} />
          <rect x={-s.r * 4} y={-0.25} width={s.r * 8} height={0.5} fill={s.hue} opacity={0.35} />
          <rect x={-0.25} y={-s.r * 4} width={0.5} height={s.r * 8} fill={s.hue} opacity={0.35} />
          <circle r={s.r} fill="#fff" />
        </g>
      ))}
    </svg>
  )
}

function mulberry32(seed: number) {
  let a = seed
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = a
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
