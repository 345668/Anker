/**
 * Content script: LinkedIn network capture — built for THOUSANDS of
 * connections.
 *
 * LinkedIn virtualizes its lists: cards that scroll out of view are REMOVED
 * from the DOM. The old version scrolled first and scraped once at the end,
 * so it only ever saw the last ~10 rendered cards. This version harvests
 * DURING the scroll into a persistent map keyed by profile URL, and streams
 * what it finds to Anker in batches of 100 while the scroll continues:
 *
 *   scroll → wait for render → harvest visible cards → (≥100 unsent? ship a
 *   batch) → repeat until no new profiles for STALL_LIMIT passes, the hard
 *   pass cap is hit, or the user clicks stop.
 *
 * Because the server upserts by (owner, url), batches are idempotent — an
 * interrupted run keeps everything already shipped, and re-running simply
 * tops up. That is what makes 1,000–10,000-connection captures practical.
 *
 * Extracted per card (whatever LinkedIn renders): profile URL, name,
 * headline/occupation, location, avatar, degree badge.
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

// Scroll budget: 10k connections at ~10–40 cards per pass needs several
// hundred passes. The stall counter is the real terminator; the hard cap
// only guards against pathological pages.
const MAX_SCROLL_PASSES = 1500;
const SCROLL_PAUSE_MS = 850;
const STALL_LIMIT = 10;       // consecutive passes with zero new profiles
const BATCH_SIZE = 100;       // cards per POST (server caps at 200)

function isConnectionsListPage(): boolean {
  return window.location.pathname.startsWith("/mynetwork/");
}

function parseDegreeBadge(scope: Element): number | undefined {
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
  const s = raw.replace(/View .*?['’]s profile/gi, "").replace(/\s+/g, " ").trim();
  const half = s.slice(0, Math.floor(s.length / 2));
  if (half && s === half + half) return half.trim();
  return s;
}

/** Scrape whatever cards are CURRENTLY rendered (virtualized window). */
function scrapeVisibleCards(): Card[] {
  const out = new Map<string, Card>();
  const isConnList = isConnectionsListPage();

  const anchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]'),
  );
  for (const a of anchors) {
    let href = a.href || "";
    const m = href.match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (!m) continue;
    href = `https://www.linkedin.com/in/${m[1]}`;

    const card =
      a.closest("li") ||
      a.closest('[class*="entity-result"]') ||
      a.closest('[class*="connection-card"]') ||
      a.parentElement;
    if (!card) continue;

    const nameNode =
      card.querySelector('[class*="connection-card__name"]') ||
      card.querySelector('.entity-result__title-text a span[aria-hidden="true"]') ||
      card.querySelector('span[dir="ltr"]') ||
      a;
    const name = normName(nameNode?.textContent || "");
    if (!name || name.length < 2 || /linkedin member/i.test(name)) continue;

    const headlineNode =
      card.querySelector('[class*="connection-card__occupation"]') ||
      card.querySelector('[class*="entity-result__primary-subtitle"]') ||
      card.querySelector('[class*="subline-level-1"]');
    const headline = (headlineNode?.textContent || "").replace(/\s+/g, " ").trim() || undefined;

    const locNode =
      card.querySelector('[class*="entity-result__secondary-subtitle"]') ||
      card.querySelector('[class*="subline-level-2"]');
    const location = (locNode?.textContent || "").replace(/\s+/g, " ").trim() || undefined;

    const img = card.querySelector<HTMLImageElement>("img");
    const image = img?.src && !img.src.startsWith("data:") ? img.src : undefined;

    const degree = isConnList ? 1 : (parseDegreeBadge(card) ?? 2);

    if (!out.has(href)) out.set(href, { url: href, name, headline, location, image, degree });
  }
  return Array.from(out.values());
}

type Status = "idle" | "running" | "ok" | "err";

/**
 * Badge visible cards with what Anker knows: ✓ known (CRM/network) and
 * intro-path counts. User-initiated, one pass over rendered cards, batched
 * 25 URLs per context call. Injected spans carry data-anker so re-runs
 * don't duplicate.
 */
async function annotateVisibleCards(): Promise<{ checked: number; known: number }> {
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/in/"]'));
  const cards = new Map<string, Element>();
  for (const a of anchors) {
    const m = (a.href || "").match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (!m) continue;
    const url = `https://www.linkedin.com/in/${m[1]}`;
    const card = a.closest("li") || a.closest('[class*="entity-result"]') || a.closest('[class*="connection-card"]');
    if (card && !cards.has(url) && !card.querySelector("[data-anker]")) cards.set(url, card);
  }
  const urls = Array.from(cards.keys());
  let known = 0;
  for (let i = 0; i < urls.length; i += 25) {
    const batch = urls.slice(i, i + 25);
    const res = await chrome.runtime.sendMessage({ type: "context", urls: batch });
    if (!res?.ok || !res.contexts) continue;
    for (const u of batch) {
      const norm = u.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
      const ctx = res.contexts[norm] ?? res.contexts[u];
      if (!ctx) continue;
      const card = cards.get(u);
      if (!card) continue;
      const bits: string[] = [];
      if (ctx.known) { bits.push(ctx.known === "crm" ? "✓ CRM" : "✓ Anker"); known++; }
      if (ctx.introPaths) bits.push(`${ctx.introPaths} intro${ctx.introPaths > 1 ? "s" : ""}`);
      if (ctx.jobChange) bits.push("moved");
      if (!bits.length) continue;
      const tag = document.createElement("span");
      tag.setAttribute("data-anker", "1");
      tag.textContent = bits.join(" · ");
      tag.style.cssText =
        "display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;" +
        "font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.6px;" +
        "text-transform:uppercase;vertical-align:middle;" +
        (ctx.known
          ? "background:#111;color:#fff;border:1px solid #111;"
          : "background:#fff;color:#111;border:1px solid #d4d0c8;");
      const nameEl =
        card.querySelector('[class*="connection-card__name"]') ||
        card.querySelector('.entity-result__title-text') ||
        card.querySelector('span[dir="ltr"]');
      (nameEl?.parentElement ?? card).appendChild(tag);
    }
  }
  return { checked: urls.length, known };
}

interface Progress {
  found: number;
  sent: number;
  inserted: number;
  updated: number;
  pass: number;
}

function SyncButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");
  const [prog, setProg] = useState<Progress | null>(null);
  const cancelled = useRef(false);

  async function sync() {
    cancelled.current = false;
    setStatus("running");
    setMsg("Harvesting while scrolling — leave this tab open…");

    // Everything ever seen this run, keyed by URL; survives virtualization.
    const harvested = new Map<string, Card>();
    const sentUrls = new Set<string>();
    const p: Progress = { found: 0, sent: 0, inserted: 0, updated: 0, pass: 0 };
    const paint = () => setProg({ ...p });

    async function shipPending(minBatch: number): Promise<boolean> {
      // Send unsent cards in BATCH_SIZE chunks while at least minBatch remain.
      let pending = Array.from(harvested.values()).filter((c) => !sentUrls.has(c.url));
      while (pending.length >= Math.max(1, minBatch)) {
        const batch = pending.slice(0, BATCH_SIZE);
        const res = await chrome.runtime.sendMessage({ type: "syncConnections", connections: batch });
        if (res?.error) { setStatus("err"); setMsg(res.error); return false; }
        for (const c of batch) sentUrls.add(c.url);
        p.sent += batch.length;
        p.inserted += res?.inserted || 0;
        p.updated += res?.updated || 0;
        paint();
        pending = pending.slice(batch.length);
        if (pending.length < Math.max(1, minBatch)) break;
      }
      return true;
    }

    try {
      let stalled = 0;
      for (let i = 0; i < MAX_SCROLL_PASSES && !cancelled.current; i++) {
        p.pass = i + 1;

        // Harvest BEFORE and AFTER the scroll so the first window is kept.
        const before = harvested.size;
        for (const c of scrapeVisibleCards()) if (!harvested.has(c.url)) harvested.set(c.url, c);

        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        await new Promise((r) => setTimeout(r, SCROLL_PAUSE_MS));

        const more = Array.from(document.querySelectorAll("button")).find((b) =>
          /show more|load more/i.test(b.textContent || ""),
        );
        if (more) { more.click(); await new Promise((r) => setTimeout(r, SCROLL_PAUSE_MS)); }

        for (const c of scrapeVisibleCards()) if (!harvested.has(c.url)) harvested.set(c.url, c);
        p.found = harvested.size;
        paint();
        setMsg(`Scrolling… ${p.found.toLocaleString()} profiles found, ${p.sent.toLocaleString()} synced`);

        // Stream full batches as soon as they accumulate.
        if (!(await shipPending(BATCH_SIZE))) return;

        stalled = harvested.size === before ? stalled + 1 : 0;
        if (stalled >= STALL_LIMIT) break; // end of the list
      }

      // Flush the remainder (anything under one full batch).
      if (!(await shipPending(1))) return;

      if (!harvested.size) {
        setStatus("err");
        setMsg("No people cards found on this page. Open your connections list and try again.");
        return;
      }
      setStatus("ok");
      setMsg(
        `${cancelled.current ? "Stopped — " : ""}synced ${p.sent.toLocaleString()} of ${p.found.toLocaleString()} profiles ` +
        `(${p.inserted.toLocaleString()} new, ${p.updated.toLocaleString()} updated). ` +
        `Everything sent is saved — re-run anytime to top up. View in Anker → Network.`,
      );
    } catch (e: any) {
      setStatus("err");
      setMsg(e?.message || "Sync failed — everything already sent is saved; re-run to continue.");
    }
  }

  const [checking, setChecking] = useState(false);
  async function checkKnown() {
    setChecking(true);
    try {
      const r = await annotateVisibleCards();
      setMsg(`Checked ${r.checked} visible people — ${r.known} already in Anker.`);
    } catch (e: any) {
      setMsg(e?.message || "Check failed.");
    } finally { setChecking(false); }
  }

  const busy = status === "running";
  const INK = "#111111";
  const bg = status === "ok" ? "#059669" : status === "err" ? "#dc2626" : INK;

  return (
    <div style={{
      position: "fixed", top: 76, right: 16, zIndex: 2147483647,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      maxWidth: 320,
    }}>
      <button
        onClick={busy ? () => { cancelled.current = true; } : sync}
        style={{
          padding: "10px 16px", border: "none", borderRadius: 999, cursor: "pointer",
          background: bg, color: "#fff", fontWeight: 600, fontSize: 13,
          boxShadow: "0 6px 16px rgba(0,0,0,.18)",
          opacity: busy ? 0.92 : 1,
        }}>
        {busy ? "Capturing… (click to stop & save)" :
         status === "ok" ? "Synced to Anker ✓" :
         status === "err" ? "Retry capture" :
         "Sync network to Anker"}
      </button>
      <button onClick={checkKnown} disabled={busy || checking}
        style={{
          marginLeft: 6, padding: "10px 14px", borderRadius: 999, cursor: "pointer",
          background: "#fff", color: "#111", border: "1px solid #111",
          fontWeight: 600, fontSize: 12, boxShadow: "0 6px 16px rgba(0,0,0,.12)",
          opacity: checking ? 0.7 : 1,
        }}>
        {checking ? "Checking…" : "Check known"}
      </button>
      {(msg || prog) && (
        <div style={{
          marginTop: 8, padding: "10px 12px", borderRadius: 10,
          background: "#fff", color: "#111",
          boxShadow: "0 6px 24px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.06)",
          fontSize: 12, lineHeight: 1.5,
        }}>
          {prog && (
            <div style={{
              display: "flex", gap: 12, marginBottom: msg ? 6 : 0,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, color: "#6b6b6b",
            }}>
              <span>found <b style={{ color: "#111" }}>{prog.found.toLocaleString()}</b></span>
              <span>synced <b style={{ color: "#111" }}>{prog.sent.toLocaleString()}</b></span>
              <span>new <b style={{ color: "#059669" }}>{prog.inserted.toLocaleString()}</b></span>
            </div>
          )}
          {msg}
        </div>
      )}
    </div>
  );
}

export default SyncButton;
