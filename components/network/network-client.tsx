"use client"

/**
 * NetworkClient — tabs: List | Galaxy.
 *
 * Zero external dependencies for the force sim. D3 would be the "right"
 * pick but pulling it in for a single view when we already have all the
 * math is unjustified. The simulation:
 *
 *   • Nodes are people. Position starts random inside the viewport.
 *   • Every node repels every other with an r² Coulomb-like force
 *     (Barnes-Hut would be O(n log n) but for ≤ 2000 nodes plain O(n²)
 *     is fine at 60fps on any laptop from the last 5 years).
 *   • Nodes with the same firm attract each other with a spring — that
 *     produces the "galaxy of firm clusters" look.
 *   • A weak centering force keeps the whole graph on-screen.
 *   • Velocity damping halves each frame's velocity so the sim settles.
 *
 * The tick loop runs on rAF, but we bail out (stop scheduling frames)
 * once total kinetic energy drops below a threshold — no CPU wasted on
 * a settled graph. Any interaction (drag, zoom, filter) restarts the
 * loop with a small energy injection.
 */
import { useEffect, useMemo, useRef, useState } from "react"

// ─── types ─────────────────────────────────────────────────────────────

export interface NetworkNode {
  id: string
  slug: string
  url: string
  name: string
  headline: string | null
  firm: string | null
  imageUrl: string | null
  location: string | null
  connectedAt: string | null
  lastSeen: string
  inCrm: boolean
}

type Tab = "list" | "galaxy"

// ─── shell ─────────────────────────────────────────────────────────────

export function NetworkClient({ nodes }: { nodes: NetworkNode[] }) {
  const [tab, setTab] = useState<Tab>("galaxy")
  const [query, setQuery] = useState("")
  const [firmFilter, setFirmFilter] = useState<string>("all")

  const firms = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of nodes) {
      const f = (n.firm || "—").trim()
      m.set(f, (m.get(f) ?? 0) + 1)
    }
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [nodes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return nodes.filter((n) => {
      if (firmFilter !== "all") {
        const nf = (n.firm || "—").trim()
        if (nf !== firmFilter) return false
      }
      if (!q) return true
      return (
        n.name.toLowerCase().includes(q) ||
        (n.headline || "").toLowerCase().includes(q) ||
        (n.firm || "").toLowerCase().includes(q) ||
        (n.location || "").toLowerCase().includes(q)
      )
    })
  }, [nodes, query, firmFilter])

  const crmMatches = filtered.filter((n) => n.inCrm).length

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5">
          <TabBtn active={tab === "galaxy"} onClick={() => setTab("galaxy")}>Galaxy</TabBtn>
          <TabBtn active={tab === "list"}   onClick={() => setTab("list")}  >List</TabBtn>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, headline, firm, location…"
          className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
        />
        <select
          value={firmFilter}
          onChange={(e) => setFirmFilter(e.target.value)}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-neutral-400 focus:outline-none"
        >
          <option value="all">All firms · {nodes.length}</option>
          {firms.slice(0, 200).map(([f, c]) => (
            <option key={f} value={f}>{f} · {c}</option>
          ))}
        </select>
        <div className="text-xs text-neutral-500">
          {filtered.length.toLocaleString()} shown · {crmMatches} in CRM
        </div>
      </div>

      {tab === "galaxy" ? <Galaxy nodes={filtered} /> : <ListView nodes={filtered} />}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
        active ? "bg-neutral-900 text-white" : "bg-transparent text-neutral-600 hover:bg-neutral-100"
      }`}
    >{children}</button>
  )
}

// ─── list view ─────────────────────────────────────────────────────────

function ListView({ nodes }: { nodes: NetworkNode[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Name</th>
              <th className="px-4 py-2 text-left font-semibold">Headline</th>
              <th className="px-4 py-2 text-left font-semibold">Firm</th>
              <th className="px-4 py-2 text-left font-semibold">Location</th>
              <th className="px-4 py-2 text-left font-semibold">In CRM</th>
              <th className="px-4 py-2 text-right font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {nodes.map((n) => (
              <tr key={n.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    {n.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={n.imageUrl} alt="" className="h-7 w-7 rounded-full border border-neutral-200 object-cover" />
                    )}
                    <span className="font-medium text-neutral-900">{n.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-neutral-700">{n.headline || "—"}</td>
                <td className="px-4 py-2 text-neutral-700">{n.firm || "—"}</td>
                <td className="px-4 py-2 text-neutral-600">{n.location || "—"}</td>
                <td className="px-4 py-2">
                  {n.inCrm ? (
                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Yes</span>
                  ) : (
                    <span className="text-xs text-neutral-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <a href={n.url} target="_blank" rel="noopener noreferrer"
                     className="text-xs font-semibold text-sky-600 hover:underline">Open ↗</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── galaxy view ───────────────────────────────────────────────────────

interface SimNode extends NetworkNode {
  x: number
  y: number
  vx: number
  vy: number
  firmKey: string
  color: string
  r: number
}

const FIRM_PALETTE = [
  "#0ea5e9", "#6366f1", "#8b5cf6", "#d946ef", "#ec4899",
  "#f43f5e", "#f97316", "#eab308", "#84cc16", "#22c55e",
  "#14b8a6", "#06b6d4", "#3b82f6", "#a855f7", "#f59e0b",
]

function colorForFirm(firm: string, palette: string[]): string {
  let h = 0
  for (let i = 0; i < firm.length; i++) h = (h * 31 + firm.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

function Galaxy({ nodes }: { nodes: NetworkNode[] }) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [dims, setDims] = useState({ w: 1000, h: 640 })
  const [selected, setSelected] = useState<SimNode | null>(null)
  const [hover, setHover] = useState<SimNode | null>(null)

  // Pan + zoom state, applied as a single SVG transform on the world layer.
  const [view, setView] = useState({ tx: 0, ty: 0, k: 1 })

  // Build the sim graph. Positions seed randomly around the centre so the
  // sim has something to relax; if the node set changes (filter etc.) we
  // reseed and restart the loop.
  const simRef = useRef<{
    nodes: SimNode[]
    firmCentres: Map<string, { x: number; y: number; n: number }>
    energy: number
  }>({ nodes: [], firmCentres: new Map(), energy: 1 })

  useEffect(() => {
    const cx = dims.w / 2, cy = dims.h / 2
    const sim: SimNode[] = nodes.map((n) => {
      const firmKey = (n.firm || "—").trim()
      return {
        ...n,
        x: cx + (Math.random() - 0.5) * 400,
        y: cy + (Math.random() - 0.5) * 400,
        vx: 0, vy: 0,
        firmKey,
        color: colorForFirm(firmKey, FIRM_PALETTE),
        r: n.inCrm ? 6 : 4,
      }
    })
    simRef.current.nodes = sim
    simRef.current.energy = 1
    kick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, dims.w, dims.h])

  // Fit to container.
  useEffect(() => {
    if (!wrapRef.current) return
    const el = wrapRef.current
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setDims({ w: Math.max(400, r.width), h: Math.max(400, Math.min(760, r.width * 0.6)) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Force-sim tick loop with rAF. Reads sim ref, writes new positions
  // straight to the SVG DOM (bypasses React re-renders for perf), only
  // re-renders when the energy drops to a "quiet" state, or on hover.
  const rafRef = useRef<number | null>(null)
  const tickRef = useRef<() => void>(() => {})

  useEffect(() => {
    tickRef.current = () => {
      const s = simRef.current.nodes
      if (s.length === 0) return
      const w = dims.w, h = dims.h
      const cx = w / 2, cy = h / 2

      // 1. Compute firm centroids for the "attract to firm" spring.
      const firmCentres = new Map<string, { x: number; y: number; n: number }>()
      for (const n of s) {
        const c = firmCentres.get(n.firmKey) || { x: 0, y: 0, n: 0 }
        c.x += n.x; c.y += n.y; c.n++
        firmCentres.set(n.firmKey, c)
      }
      for (const c of firmCentres.values()) { c.x /= c.n; c.y /= c.n }

      // 2. Repulsion — Coulomb. O(n²) with a distance floor to avoid NaN.
      const REPEL = 220
      const MAX_D2 = 40000  // beyond ~200px repulsion is negligible; cap
      for (let i = 0; i < s.length; i++) {
        const a = s[i]
        for (let j = i + 1; j < s.length; j++) {
          const b = s[j]
          const dx = a.x - b.x, dy = a.y - b.y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) d2 = 1
          if (d2 > MAX_D2) continue
          const f = REPEL / d2
          const fx = f * dx / Math.sqrt(d2)
          const fy = f * dy / Math.sqrt(d2)
          a.vx += fx; a.vy += fy
          b.vx -= fx; b.vy -= fy
        }
      }

      // 3. Spring toward firm centroid.
      const SPRING = 0.02
      for (const n of s) {
        const c = firmCentres.get(n.firmKey)!
        n.vx += (c.x - n.x) * SPRING
        n.vy += (c.y - n.y) * SPRING
      }

      // 4. Weak centering — keeps the whole graph in the viewport.
      const CENTER = 0.003
      for (const n of s) {
        n.vx += (cx - n.x) * CENTER
        n.vy += (cy - n.y) * CENTER
      }

      // 5. Damping + integrate + boundary clamp.
      const DAMP = 0.85
      let energy = 0
      for (const n of s) {
        n.vx *= DAMP; n.vy *= DAMP
        n.x += n.vx; n.y += n.vy
        if (n.x < 10) { n.x = 10; n.vx *= -0.4 }
        if (n.x > w - 10) { n.x = w - 10; n.vx *= -0.4 }
        if (n.y < 10) { n.y = 10; n.vy *= -0.4 }
        if (n.y > h - 10) { n.y = h - 10; n.vy *= -0.4 }
        energy += n.vx * n.vx + n.vy * n.vy
      }
      simRef.current.energy = energy / Math.max(1, s.length)
      simRef.current.firmCentres = firmCentres

      // Write to DOM.
      const g = svgRef.current?.querySelector<SVGGElement>("#world")
      if (g) {
        const children = g.querySelectorAll<SVGGElement>("g.node")
        for (let i = 0; i < s.length && i < children.length; i++) {
          children[i].setAttribute("transform", `translate(${s[i].x.toFixed(2)},${s[i].y.toFixed(2)})`)
        }
      }

      if (simRef.current.energy > 0.02) {
        rafRef.current = requestAnimationFrame(tickRef.current)
      } else {
        rafRef.current = null
      }
    }
  }, [dims.w, dims.h])

  function kick() {
    // Nudge sim awake — used after filter change, drag end, or first mount.
    for (const n of simRef.current.nodes) {
      n.vx += (Math.random() - 0.5) * 0.5
      n.vy += (Math.random() - 0.5) * 0.5
    }
    simRef.current.energy = 1
    if (!rafRef.current) rafRef.current = requestAnimationFrame(tickRef.current)
  }

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  // Wheel-to-zoom around the cursor, drag-to-pan.
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault()
    const rect = svgRef.current!.getBoundingClientRect()
    const px = e.clientX - rect.left, py = e.clientY - rect.top
    const dk = Math.exp(-e.deltaY * 0.0015)
    const nk = Math.max(0.25, Math.min(5, view.k * dk))
    // Keep the point under the cursor fixed: adjust tx/ty accordingly.
    const wx = (px - view.tx) / view.k
    const wy = (py - view.ty) / view.k
    setView({ k: nk, tx: px - wx * nk, ty: py - wy * nk })
  }
  function onMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if ((e.target as Element).closest("g.node")) return
    dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
  }
  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    setView((v) => ({ ...v, tx: dragRef.current!.tx + dx, ty: dragRef.current!.ty + dy }))
  }
  function onMouseUp() { dragRef.current = null }

  function resetView() { setView({ tx: 0, ty: 0, k: 1 }); kick() }

  return (
    <div ref={wrapRef} className="rounded-xl border border-neutral-200 bg-neutral-950 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3">
        <div className="rounded-lg bg-white/90 px-3 py-1.5 text-xs text-neutral-700 backdrop-blur">
          Scroll to zoom · drag to pan · click a node to open LinkedIn
        </div>
        <div className="flex gap-2">
          <button onClick={resetView}
            className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:bg-white">
            Reset view
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        width={dims.w}
        height={dims.h}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ display: "block", cursor: dragRef.current ? "grabbing" : "grab" }}
      >
        {/* Star-field backdrop — pure æsthetic, cheap. */}
        <defs>
          <radialGradient id="node-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="crm-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={dims.w} height={dims.h} fill="#0a0e1a" />
        <StarField w={dims.w} h={dims.h} />

        <g id="world" transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
          {/* Firm-centroid rings — gives the "galaxy" feel of clustered mass. */}
          {simRef.current.nodes.length > 0 && Array.from(new Set(simRef.current.nodes.map((n) => n.firmKey))).slice(0, 40).map((firmKey, i) => {
            const c = simRef.current.firmCentres.get(firmKey)
            if (!c) return null
            const count = simRef.current.nodes.filter((n) => n.firmKey === firmKey).length
            if (count < 3) return null
            return <circle key={firmKey} cx={c.x} cy={c.y} r={20 + Math.sqrt(count) * 8}
              fill="none" stroke={colorForFirm(firmKey, FIRM_PALETTE)} strokeOpacity={0.12} strokeWidth={1} />
          })}

          {simRef.current.nodes.map((n) => (
            <g key={n.id} className="node" style={{ cursor: "pointer" }}
               onMouseEnter={() => setHover(n)}
               onMouseLeave={() => setHover((h) => (h === n ? null : h))}
               onClick={() => { setSelected(n); window.open(n.url, "_blank", "noopener,noreferrer") }}>
              {n.inCrm && <circle r={n.r + 6} fill="url(#crm-glow)" />}
              <circle r={n.r + 2} fill="url(#node-glow)" />
              <circle r={n.r} fill={n.color} stroke="#fff" strokeOpacity={0.4} strokeWidth={0.5} />
            </g>
          ))}
        </g>

        {/* Hover tooltip in screen space so it doesn't scale with zoom. */}
        {hover && (
          <foreignObject
            x={Math.min(dims.w - 260, Math.max(8, (hover.x * view.k + view.tx) + 12))}
            y={Math.min(dims.h - 90, Math.max(8, (hover.y * view.k + view.ty) - 40))}
            width={240} height={82}
          >
            <div style={{
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              background: "rgba(255,255,255,0.95)", borderRadius: 8, padding: "8px 10px",
              fontSize: 12, color: "#111", boxShadow: "0 4px 12px rgba(0,0,0,.3)",
              border: `2px solid ${hover.color}`,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{hover.name}</div>
              <div style={{ color: "#374151", fontSize: 11, lineHeight: 1.35 }}>{hover.headline || "—"}</div>
              {hover.inCrm && <div style={{ color: "#059669", fontSize: 10, fontWeight: 700, marginTop: 4 }}>◎ IN CRM</div>}
            </div>
          </foreignObject>
        )}
      </svg>

      {/* Legend + selection panel below. */}
      <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-xs text-white/70">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> in CRM</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-white/60" /> connection</span>
        </div>
        <div>{simRef.current.nodes.length.toLocaleString()} nodes · {simRef.current.firmCentres.size} firm clusters</div>
      </div>
    </div>
  )
}

function StarField({ w, h }: { w: number; h: number }) {
  // Cheap deterministic starfield — same seed every render so the background
  // doesn't twinkle on state changes.
  const stars = useMemo(() => {
    const rand = mulberry32(1)
    return Array.from({ length: 120 }, () => ({
      x: rand() * w, y: rand() * h, r: rand() * 0.9 + 0.2, o: rand() * 0.5 + 0.1,
    }))
  }, [w, h])
  return (
    <g>
      {stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />)}
    </g>
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
