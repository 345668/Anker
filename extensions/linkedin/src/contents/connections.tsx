/**
 * Content script: LinkedIn network capture.
 *
 * Runs on the connections list and people-search pages. Renders a floating
 * "Sync to Anker" button. On click it auto-scrolls to force lazy cards to
 * render, scrapes visible person cards (defensively — several selector
 * fallbacks per field), dedupes by profile URL, and ships batches to the
 * background SW which POSTs /api/extension/connections.
 *
 * Degree detection: LinkedIn renders a "· 1st" / "· 2nd" / "· 3rd" badge next
 * to names. Connections-list pages are always 1st degree; search results use
 * the badge (default 2nd when absent).
 *
 * Scraping is deliberately conservative: user-initiated (one click), bounded
 * scroll passes, and only fields already visible on the user's own screen.
 */
import type { PlasmoCSConfig } from "plasmo";
import { useRef, useState } from "react";

export const config: PlasmoCSConfig = {
  matches: [
    "https://www.linkedin.com/mynetwork/invite-connect/connections/*",
    "https://www.linkedin.com/search/results/people*",
  ],
  run_at: "document_idle",
};

interface Card {
  url: string;
  name: string;
  headline?: string;
  location?: string;
  image?: string;
  degree?: number;
}

const MAX_SCROLL_PASSES = 30;
const SCROLL_PAUSE_MS = 900;
const BATCH_SIZE = 50;

function isConnectionsListPage(): boolean {
  return window.location.pathname.startsWith("/mynetwork/");
}

function parseDegreeBadge(scope: Element): number | undefined {
  // Badge text looks like "· 1st", "· 2nd", "· 3rd" (with i18n variants we
  // don't attempt). Search within small badge-ish nodes only.
  const badgeNodes = scope.querySelectorAll(
    '[class*="dist-value"], .entity-result__badge-text, .distance-badge, [class*="badge"]',
  );
  for (const n of badgeNodes) {
    const t = (n.textContent || "").trim();
    if (/\b1st\b/.test(t)) return 1;
    if (/\b2nd\b/.test(t)) return 2;
    if (/\b3rd\b/.test(t)) return 3;
  }
  return undefined;
}

function normName(raw: string): string {
  // Strip screen-reader duplication ("View John Doe's profile") and repeated
  // whitespace. LinkedIn often doubles the name for a11y.
  const s = raw.replace(/View .*?['’]s profile/gi, "").replace(/\s+/g, " ").trim();
  // Names repeated twice back-to-back ("Jane DoeJane Doe") — halve when so.
  const half = s.slice(0, Math.floor(s.length / 2));
  if (half && s === half + half) return half.trim();
  return s;
}

function scrapeCards(): Card[] {
  const out = new Map<string, Card>();
  const isConnList = isConnectionsListPage();

  // Anchor-first strategy: every person card contains an /in/<slug> anchor.
  // Walk anchors, then climb to a card-ish ancestor to read the rest.
  const anchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]'),
  );
  for (const a of anchors) {
    let href = a.href || "";
    // Ignore self-links, overlays, and anything that is not a profile path.
    const m = href.match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (!m) continue;
    href = `https://www.linkedin.com/in/${m[1]}`;

    // Card ancestor: nearest li or listed entity container.
    const card =
      a.closest("li") ||
      a.closest('[class*="entity-result"]') ||
      a.closest('[class*="connection-card"]') ||
      a.parentElement;
    if (!card) continue;

    // Name: prefer explicit name nodes, fall back to the anchor text.
    const nameNode =
      card.querySelector('[class*="connection-card__name"]') ||
      card.querySelector('.entity-result__title-text a span[aria-hidden="true"]') ||
      card.querySelector('span[dir="ltr"]') ||
      a;
    const name = normName(nameNode?.textContent || "");
    if (!name || name.length < 2 || /linkedin member/i.test(name)) continue;

    // Headline / occupation.
    const headlineNode =
      card.querySelector('[class*="connection-card__occupation"]') ||
      card.querySelector('[class*="entity-result__primary-subtitle"]') ||
      card.querySelector('[class*="subline-level-1"]');
    const headline = (headlineNode?.textContent || "").replace(/\s+/g, " ").trim() || undefined;

    // Location (search results only).
    const locNode =
      card.querySelector('[class*="entity-result__secondary-subtitle"]') ||
      card.querySelector('[class*="subline-level-2"]');
    const location = (locNode?.textContent || "").replace(/\s+/g, " ").trim() || undefined;

    // Avatar.
    const img = card.querySelector<HTMLImageElement>("img");
    const image = img?.src && !img.src.startsWith("data:") ? img.src : undefined;

    const degree = isConnList ? 1 : (parseDegreeBadge(card) ?? 2);

    if (!out.has(href)) out.set(href, { url: href, name, headline, location, image, degree });
  }
  return Array.from(out.values());
}

async function autoScroll(onPass: (found: number) => void): Promise<void> {
  let lastHeight = 0;
  for (let i = 0; i < MAX_SCROLL_PASSES; i++) {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    await new Promise((r) => setTimeout(r, SCROLL_PAUSE_MS));
    // Click "Show more results" style buttons when present.
    const more = Array.from(document.querySelectorAll("button")).find((b) =>
      /show more|load more/i.test(b.textContent || ""),
    );
    if (more) { more.click(); await new Promise((r) => setTimeout(r, SCROLL_PAUSE_MS)); }
    onPass(scrapeCards().length);
    const h = document.body.scrollHeight;
    if (h === lastHeight && !more) break; // nothing new rendered — done
    lastHeight = h;
  }
}

type Status = "idle" | "scrolling" | "sending" | "ok" | "err";

function SyncButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");
  const cancelled = useRef(false);

  async function sync() {
    cancelled.current = false;
    setStatus("scrolling");
    setMsg("Scrolling to load your network…");
    try {
      await autoScroll((n) => setMsg(`Scrolling… ${n} people found`));
      const cards = scrapeCards();
      if (!cards.length) {
        setStatus("err");
        setMsg("No people cards found on this page.");
        return;
      }
      setStatus("sending");
      let sent = 0, inserted = 0, updated = 0;
      for (let i = 0; i < cards.length; i += BATCH_SIZE) {
        if (cancelled.current) break;
        const batch = cards.slice(i, i + BATCH_SIZE);
        const res = await chrome.runtime.sendMessage({ type: "syncConnections", connections: batch });
        if (res?.error) { setStatus("err"); setMsg(res.error); return; }
        sent += batch.length;
        inserted += res?.inserted || 0;
        updated += res?.updated || 0;
        setMsg(`Syncing… ${sent}/${cards.length}`);
      }
      setStatus("ok");
      setMsg(`Synced ${sent} people (${inserted} new, ${updated} updated). View them in Anker → Network.`);
    } catch (e: any) {
      setStatus("err");
      setMsg(e?.message || "Sync failed.");
    }
  }

  const palette: Record<Status, { bg: string; fg: string }> = {
    idle:      { bg: "#0a66c2", fg: "#fff" },
    scrolling: { bg: "#0a66c2", fg: "#fff" },
    sending:   { bg: "#0a66c2", fg: "#fff" },
    ok:        { bg: "#16a34a", fg: "#fff" },
    err:       { bg: "#dc2626", fg: "#fff" },
  };
  const c = palette[status];
  const busy = status === "scrolling" || status === "sending";

  return (
    <div style={{
      position: "fixed", top: 76, right: 16, zIndex: 2147483647,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      maxWidth: 300,
    }}>
      <button
        onClick={busy ? () => { cancelled.current = true; } : sync}
        style={{
          padding: "10px 14px", border: "none", borderRadius: 999, cursor: "pointer",
          background: c.bg, color: c.fg, fontWeight: 600, fontSize: 13,
          boxShadow: `0 0 0 1px ${c.bg}33, 0 6px 16px rgba(0,0,0,.18)`,
          opacity: busy ? 0.9 : 1,
        }}>
        {status === "scrolling" ? "Scrolling… (click to stop)" :
         status === "sending" ? "Syncing… (click to stop)" :
         status === "ok" ? "Synced to Anker" :
         status === "err" ? "Retry sync" :
         "Sync network to Anker"}
      </button>
      {msg && (
        <div style={{
          marginTop: 8, padding: "8px 10px", borderRadius: 8,
          background: "#fff", color: "#111",
          boxShadow: "0 6px 24px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.06)",
          fontSize: 12, lineHeight: 1.4,
        }}>
          {msg}
        </div>
      )}
    </div>
  );
}

export default SyncButton;
