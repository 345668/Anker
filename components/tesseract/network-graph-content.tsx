"use client"

/**
 * Relationship web: CRM contacts + LinkedIn captures rendered as a React Flow
 * graph. Radial layout — you at the center, one ring per network degree,
 * nodes grouped by company around each ring so clusters sit together.
 *
 * Data comes from GET /api/portfolio/network (owner-scoped LinkedIn data,
 * org-wide contacts). The node drawer answers "who can introduce me?" via
 * the ?intro= lookup against linkedin_mutuals.
 */

import { useCallback, useMemo, useState } from "react"
import useSWR from "swr"
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position,
  type Node, type Edge, type NodeProps, type NodeMouseHandler,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  Loader2, Search, X, ExternalLink, Users, Waypoints, RefreshCw, Chrome,
} from "lucide-react"
import Link from "next/link"
import type { GraphNode, GraphEdge, GraphStats, EdgeType } from "@/lib/portfolio/network-graph"

// ── Constants ────────────────────────────────────────────────────────────────

const DEGREE_COLOR: Record<number, string> = {
  0: "#0f766e", // me — teal
  1: "#0f766e",
  2: "#b45309", // 2nd — amber
  3: "#6b7280", // 3rd — gray
}

const EDGE_STYLE: Record<EdgeType, { stroke: string; dash?: string; opacity: number }> = {
  me:      { stroke: "#0f766e", opacity: 0.25 },
  mutual:  { stroke: "#b45309", opacity: 0.6 },
  company: { stroke: "#64748b", dash: "4 3", opacity: 0.35 },
  tag:     { stroke: "#0e7490", dash: "2 4", opacity: 0.35 },
  deal:    { stroke: "#be123c", dash: "6 3", opacity: 0.55 },
}

const EDGE_LABELS: Record<EdgeType, string> = {
  me: "Direct", mutual: "Mutual", company: "Company", tag: "Tag", deal: "Deal",
}

// ── Custom node ──────────────────────────────────────────────────────────────

type PersonNodeData = { person: GraphNode; dim: boolean }

function initials(name: string): string {
  return name.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
}

function PersonNode({ data }: NodeProps) {
  const { person: p, dim } = data as PersonNodeData
  const isMe = p.kind === "me"
  const color = DEGREE_COLOR[p.degree] ?? "#6b7280"
  const size = isMe ? 72 : 44
  return (
    <div className="flex flex-col items-center" style={{ opacity: dim ? 0.25 : 1, width: 120 }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div
        className="rounded-full flex items-center justify-center overflow-hidden font-mono text-xs"
        style={{
          width: size, height: size,
          background: p.inCrm || isMe ? color : "transparent",
          color: p.inCrm || isMe ? "#fff" : color,
          border: `2px solid ${color}`,
          boxShadow: p.inCrm ? `0 0 0 4px ${color}22` : undefined,
        }}
        title={p.name}
      >
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : isMe ? <Users className="w-7 h-7" /> : initials(p.name)}
      </div>
      <div className="mt-1 text-[10px] leading-tight text-center text-foreground/80 max-w-[120px] truncate">
        {isMe ? "You" : p.name}
      </div>
      {!isMe && p.company && (
        <div className="text-[9px] leading-tight text-center text-muted-foreground max-w-[120px] truncate">
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

  const rfNodes = useMemo(() => (data ? layout(data.nodes) : []), [data])
  const rfEdges = useMemo<Edge[]>(() => {
    if (!data) return []
    return data.edges.map((e) => {
      const s = EDGE_STYLE[e.type]
      return {
        id: e.id, source: e.source, target: e.target,
        style: { stroke: s.stroke, strokeDasharray: s.dash, opacity: s.opacity, strokeWidth: e.type === "mutual" ? 1.6 : 1 },
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
          >
            <Background gap={24} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n) => DEGREE_COLOR[(n.data as PersonNodeData).person.degree] ?? "#6b7280"} />
          </ReactFlow>
        )}

        {selected && <NodeDrawer person={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  )
}
