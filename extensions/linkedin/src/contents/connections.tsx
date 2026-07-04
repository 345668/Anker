/**
 * Content script — "My Connections" capture.
 *
 * Runs on the user's own connections list page:
 *   https://www.linkedin.com/mynetwork/invite-connections/connections/
 *   https://www.linkedin.com/mynetwork/network-manager/people-follow/*/
 *
 * Draws a floating panel with a "Capture all connections" button. On
 * click:
 *   1. Auto-scroll to the bottom of the list, waiting for LinkedIn's
 *      infinite-scroll to load more rows. Stops when heights stop
 *      growing for N ticks.
 *   2. Extract every connection card (name, headline, profile URL,
 *      thumbnail) from the DOM.
 *   3. Batch to /api/extension/connections/ingest in chunks of 50.
 *   4. Report N inserted / M updated inline.
 *
 * The scraping uses stable data-* attributes where LinkedIn provides
 * them and falls back to structural queries otherwise. All DOM-fragility
 * is contained in extractCards() below.
 */
import type { PlasmoCSConfig } from "plasmo"
import { useState } from "react"

export const config: PlasmoCSConfig = {
  matches: [
    "https://www.linkedin.com/mynetwork/invite-connections/connections/*",
    "https://www.linkedin.com/mynetwork/network-manager/*",
  ],
  run_at: "document_idle",
}

interface Card {
  profileSlug: string
  profileUrl: string
  fullName: string | null
  headline: string | null
  imageUrl: string | null
  connectedAt: string | null  // "Connected 3 days ago" → parsed off if present
}

type Status = "idle" | "scrolling" | "extracting" | "sending" | "done" | "err"

function Panel() {
  const [status, setStatus] = useState<Status>("idle")
  const [msg, setMsg] = useState<string>("")
  const [count, setCount] = useState<number>(0)
  const [inserted, setInserted] = useState<number>(0)
  const [updated, setUpdated] = useState<number>(0)

  async function run() {
    try {
      setStatus("scrolling"); setMsg("Auto-scrolling to load all connections…")
      await autoScroll((n) => {
        setCount(n)
        setMsg(`Auto-scrolling · ${n} rows visible`)
      })

      setStatus("extracting"); setMsg("Extracting cards…")
      const cards = extractCards()
      setCount(cards.length)
      if (cards.length === 0) {
        setStatus("err"); setMsg("No connections found on this page. Are you on your own connections list?")
        return
      }

      setStatus("sending"); setMsg(`Sending ${cards.length} connections to Anker…`)
      let ins = 0, upd = 0
      for (let i = 0; i < cards.length; i += 50) {
        const chunk = cards.slice(i, i + 50)
        const res = await chrome.runtime.sendMessage({
          type: "connections_ingest",
          connections: chunk,
        })
        if (res?.error) throw new Error(res.error)
        ins += Number(res?.inserted ?? 0)
        upd += Number(res?.updated ?? 0)
        setInserted(ins); setUpdated(upd)
        setMsg(`Sent ${i + chunk.length} / ${cards.length}…`)
      }
      setStatus("done"); setMsg(`Saved: ${ins} new · ${upd} updated · ${cards.length} total`)
    } catch (e: any) {
      setStatus("err"); setMsg(e?.message || "Capture failed.")
    }
  }

  const busy = status === "scrolling" || status === "extracting" || status === "sending"
  const color = status === "done" ? "#16a34a" : status === "err" ? "#dc2626" : "#0a66c2"

  return (
    <div style={{
      position: "fixed", top: 88, right: 16, zIndex: 2147483647,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      width: 320, background: "#fff",
      boxShadow: "0 8px 32px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.06)",
      borderRadius: 12, overflow: "hidden",
    }}>
      <div style={{ padding: "10px 14px", background: color, color: "#fff", fontWeight: 600 }}>
        Anker · My Connections
      </div>
      <div style={{ padding: 14, fontSize: 13, color: "#111" }}>
        <div style={{ marginBottom: 10, lineHeight: 1.5 }}>
          Scroll all your connections into view, then send them to Anker.
        </div>
        <button
          onClick={run}
          disabled={busy}
          style={{
            width: "100%", padding: "10px 12px", border: "none", borderRadius: 8,
            background: color, color: "#fff", fontWeight: 600, fontSize: 13,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.85 : 1,
          }}>
          {status === "idle" ? "Capture all connections"
           : status === "scrolling" ? "Auto-scrolling…"
           : status === "extracting" ? "Extracting…"
           : status === "sending" ? "Sending…"
           : status === "done" ? "Done · run again" : "Retry"}
        </button>
        {msg && (
          <div style={{
            marginTop: 10, padding: "8px 10px", borderRadius: 8,
            background: "#f3f4f6", color: "#111",
            fontSize: 12, lineHeight: 1.4,
          }}>
            {msg}
          </div>
        )}
        {(status === "done" || status === "sending") && (
          <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280" }}>
            <span>{count} rows</span>
            <span>{inserted} new · {updated} updated</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── auto-scroll — stops when heights plateau for N ticks ────────────────

async function autoScroll(onTick: (visibleCount: number) => void): Promise<void> {
  const MAX_STABLE_TICKS = 6      // ~6 × 700ms of no growth ⇒ we're done
  const MAX_TICKS = 200           // safety cap for very large graphs (>2000)
  let stable = 0
  let lastHeight = 0
  for (let i = 0; i < MAX_TICKS; i++) {
    // Scroll the main container. LinkedIn uses window scrolling on this page.
    window.scrollTo(0, document.documentElement.scrollHeight)
    // Small nudge to trigger IntersectionObserver-based lazy loading.
    window.dispatchEvent(new Event("scroll"))
    await sleep(700)
    const h = document.documentElement.scrollHeight
    const visible = document.querySelectorAll('a[href*="/in/"]').length
    onTick(visible)
    if (h === lastHeight) {
      stable++
      if (stable >= MAX_STABLE_TICKS) break
    } else {
      stable = 0
      lastHeight = h
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── DOM extraction ───────────────────────────────────────────────────-

function extractCards(): Card[] {
  const out: Card[] = []
  const seen = new Set<string>()

  // Every connection row has an anchor to /in/<slug>. Iterate anchors,
  // walk to the containing card, then pluck the fields structurally.
  const anchors = document.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]')
  for (const a of Array.from(anchors)) {
    const href = a.href.split("?")[0].split("#")[0]
    const m = href.match(/\/in\/([^/]+)/)
    if (!m) continue
    const slug = decodeURIComponent(m[1])
    if (seen.has(slug)) continue
    seen.add(slug)

    // Find the enclosing card — walk up until we hit a container that
    // has both a name and a headline / subtitle. LinkedIn's connections
    // page uses <li> or <div class="mn-connection-card">-style wrappers.
    let card: HTMLElement | null = a
    for (let depth = 0; depth < 8 && card; depth++) {
      if (card.matches('li, [data-view-name="connections-list-item"], .mn-connection-card, .artdeco-list__item')) break
      card = card.parentElement
    }
    const scope: HTMLElement = card ?? a

    // Full name: the first non-empty text of the anchor's descendants,
    // often in a <span aria-hidden="true">.
    const nameEl = a.querySelector<HTMLElement>('[aria-hidden="true"]') || a
    const fullName = cleanText(nameEl.textContent) || null

    // Headline (title + firm combined): sibling <p> / <span> under the
    // card that isn't the name.
    const headlineEl = pickHeadline(scope, fullName)
    const headline = headlineEl ? cleanText(headlineEl.textContent) : null

    // Thumbnail.
    const img = scope.querySelector<HTMLImageElement>('img')
    const imageUrl = img?.src || null

    // "Connected N days/months/years ago" line if visible.
    const connectedAt = pickConnected(scope)

    out.push({
      profileSlug: slug,
      profileUrl: `https://www.linkedin.com/in/${slug}`,
      fullName, headline, imageUrl, connectedAt,
    })
  }
  return out
}

function cleanText(s: string | null | undefined): string {
  return (s || "").replace(/\s+/g, " ").trim()
}

function pickHeadline(scope: HTMLElement, fullName: string | null): HTMLElement | null {
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>('p, .t-14, [class*="occupation"], [class*="subline"], [class*="headline"]'))
  for (const el of candidates) {
    const txt = cleanText(el.textContent)
    if (!txt) continue
    if (fullName && txt === fullName) continue
    if (/^Connected /i.test(txt)) continue
    if (/^Message$/i.test(txt)) continue
    if (txt.length < 3) continue
    return el
  }
  return null
}

function pickConnected(scope: HTMLElement): string | null {
  const els = Array.from(scope.querySelectorAll<HTMLElement>('time, .time-badge, span'))
  for (const el of els) {
    const t = cleanText(el.textContent)
    if (/^Connected /i.test(t)) return t.replace(/^Connected\s+/i, "")
  }
  return null
}

export default Panel
