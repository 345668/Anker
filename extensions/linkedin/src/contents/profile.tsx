/**
 * Content script: LinkedIn profile — the Anker card.
 *
 * On every /in/<slug> page, a floating card shows what Anker already knows
 * (CRM match + stage, network capture, outreach status, warm-intro paths,
 * job change, active deals at the person's company) and offers actions:
 *
 *   Send to Anker : capture rendered HTML -> /api/extension/ingest (the
 *                   server-side parser + AI extractor take the variance heat)
 *   Add as deal   : create a sourced deal on the flagship fund from this
 *                   founder's profile -> /api/extension/deal
 *
 * Context loads via the background SW (bearer token never enters content-
 * script land). LinkedIn is an SPA — a 1500ms URL watcher re-fetches when
 * the profile changes.
 */
import type { PlasmoCSConfig } from "plasmo";
import { useEffect, useRef, useState } from "react";

export const config: PlasmoCSConfig = {
  matches: ["https://www.linkedin.com/in/*"],
  run_at: "document_idle",
};

type Status = "idle" | "capturing" | "ok" | "no_match" | "err";
type DealStatus = "idle" | "sending" | "ok" | "err";

interface Result {
  ok?: boolean;
  reason?: string;
  hint?: string;
  summary?: string | null;
  crmEntryId?: string;
  error?: string;
  extracted?: { fullName?: string; title?: string; firm?: string };
}

interface Ctx {
  known: "crm" | "network" | null;
  name: string | null;
  capturedAt: string | null;
  jobChange: { previousCompany: string | null; previousTitle: string | null; at: string } | null;
  introPaths: number;
  crm: { stage: string | null; score: number | null; tier: string | null } | null;
  outreach: { status: string | null; kind: string | null; sentAt: string | null; opens: number | null } | null;
  dealMatches: Array<{ id: string; company: string; stage: string }>;
}

// ── Anker design tokens ──────────────────────────────────────────────────────
const INK = "#111111";
const MUTED = "#6b6b6b";
const HAIRLINE = "#e8e6e1";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** Degree badge on the profile top card: "· 1st" / "· 2nd" / "· 3rd". */
function detectDegree(): number | undefined {
  const badges = document.querySelectorAll(
    '.dist-value, [class*="dist-value"], [class*="distance-badge"]',
  );
  for (const b of badges) {
    const t = (b.textContent || "").trim();
    if (/\b1st\b/.test(t)) return 1;
    if (/\b2nd\b/.test(t)) return 2;
    if (/\b3rd\b/.test(t)) return 3;
  }
  const top = document.querySelector("main section");
  const t = (top?.textContent || "").slice(0, 2000);
  if (/·\s*1st\b/.test(t)) return 1;
  if (/·\s*2nd\b/.test(t)) return 2;
  if (/·\s*3rd\b/.test(t)) return 3;
  return undefined;
}

/** Named mutual connections from the top-card highlight. */
function detectMutuals(): Array<{ name: string; url?: string }> {
  const out: Array<{ name: string; url?: string }> = [];
  const anchor = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find(
    (a) => /mutual connection/i.test(a.textContent || ""),
  );
  if (!anchor) return out;
  const text = (anchor.textContent || "").replace(/\s+/g, " ").trim();
  const namesPart = text
    .replace(/(?:,? and \d+ other.*|are mutual connections.*|\d+ mutual connections?.*)/i, "")
    .trim();
  if (namesPart) {
    for (const raw of namesPart.split(/,| and /)) {
      const name = raw.trim();
      if (name && name.length > 2 && !/mutual/i.test(name)) out.push({ name });
    }
  }
  return out;
}

/** Best-effort top-card scrape for the "Add as deal" payload. */
function scrapeTopCard(): { name?: string; headline?: string; location?: string; company?: string } {
  const name = (document.querySelector("main h1")?.textContent || "").replace(/\s+/g, " ").trim() || undefined;
  const headline = (document.querySelector('main [class*="text-body-medium"]')?.textContent || "")
    .replace(/\s+/g, " ").trim() || undefined;
  const location = (document.querySelector('main [class*="text-body-small"][class*="break-words"], main span[class*="text-body-small"]')?.textContent || "")
    .replace(/\s+/g, " ").trim() || undefined;
  // Company: the right-rail experience chip, else "at X" in the headline.
  let company = (document.querySelector('main [aria-label*="Current company"], main button[class*="top-card"] span')?.textContent || "")
    .replace(/\s+/g, " ").trim() || undefined;
  if (!company && headline) {
    const m = headline.match(/(?:@|at )([^|·,]+)/i);
    if (m) company = m[1].trim();
  }
  return { name, headline, location, company };
}

const chip = (fg: string, bg: string, border: string): React.CSSProperties => ({
  display: "inline-block", padding: "2px 8px", borderRadius: 999,
  fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.8,
  color: fg, background: bg, border: `1px solid ${border}`, marginRight: 5, marginBottom: 4,
});

function AnkerCard() {
  const [status, setStatus] = useState<Status>("idle");
  const [dealStatus, setDealStatus] = useState<DealStatus>("idle");
  const [msg, setMsg] = useState<string>("");
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [open, setOpen] = useState(true);
  const urlRef = useRef("");

  // Context loader + SPA URL watcher.
  useEffect(() => {
    const tick = async () => {
      const url = window.location.href.split("?")[0];
      if (url === urlRef.current) return;
      urlRef.current = url;
      setCtx(null); setStatus("idle"); setDealStatus("idle"); setMsg("");
      try {
        const res = await chrome.runtime.sendMessage({ type: "context", urls: [url] });
        if (res?.ok && res.contexts) {
          const first = Object.values(res.contexts)[0] as Ctx | undefined;
          setCtx(first ?? null);
        }
      } catch { /* context is best-effort */ }
    };
    const id = setInterval(tick, 1500);
    tick();
    return () => clearInterval(id);
  }, []);

  async function capture() {
    setStatus("capturing");
    setMsg("Capturing page HTML…");
    try {
      const html = document.documentElement.outerHTML;
      const url = window.location.href;
      const degree = detectDegree();
      const res: Result = await chrome.runtime.sendMessage({ type: "ingest", url, html, degree });
      if (res?.error) { setStatus("err"); setMsg(res.error); return; }

      const mutuals = detectMutuals();
      if (mutuals.length) {
        chrome.runtime.sendMessage({ type: "syncMutuals", personUrl: url, mutuals }).catch(() => {});
      }

      if (res?.ok === false && res?.reason === "no_match") {
        setStatus("no_match");
        setMsg(res.hint || "No CRM row matches this profile yet.");
        return;
      }
      if (res?.ok) {
        const who = [res.extracted?.fullName, res.extracted?.title, res.extracted?.firm].filter(Boolean).join(" · ");
        setStatus("ok");
        setMsg(
          (who || res.summary || "Captured.") +
          (res.reason === "captured_as_connection" ? " (saved to Network)" : "") +
          (mutuals.length ? ` · ${mutuals.length} mutual${mutuals.length > 1 ? "s" : ""} recorded` : ""),
        );
        return;
      }
      setStatus("err");
      setMsg("Unexpected response.");
    } catch (e: any) {
      setStatus("err");
      setMsg(e?.message || "Capture failed.");
    }
  }

  async function addAsDeal() {
    const card = scrapeTopCard();
    if (!card.name && !card.company) { setDealStatus("err"); setMsg("Couldn't read the profile top card."); return; }
    setDealStatus("sending");
    try {
      const res = await chrome.runtime.sendMessage({
        type: "createDeal",
        url: window.location.href,
        name: card.name, company: card.company,
        headline: card.headline, location: card.location,
      });
      if (res?.ok) {
        setDealStatus("ok");
        setMsg(`Deal created — ${res.companyName ?? card.company ?? card.name} is on your board as sourced.`);
      } else {
        setDealStatus("err");
        setMsg(res?.error || "Deal creation failed.");
      }
    } catch (e: any) {
      setDealStatus("err");
      setMsg(e?.message || "Deal creation failed.");
    }
  }

  const busy = status === "capturing" || dealStatus === "sending";
  const outreachLabel = ctx?.outreach
    ? ctx.outreach.status === "sent" || ctx.outreach.sentAt
      ? `sent${ctx.outreach.opens ? ` · ${ctx.outreach.opens} opens` : ""}`
      : ctx.outreach.status || null
    : null;

  return (
    <div style={{
      position: "fixed", top: 76, right: 16, zIndex: 2147483647,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      width: 300,
    }}>
      <div style={{
        background: "#fff", borderRadius: 12,
        boxShadow: "0 12px 36px rgba(0,0,0,.16), 0 0 0 1px rgba(0,0,0,.06)",
        overflow: "hidden",
      }}>
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", borderBottom: open ? `1px solid ${HAIRLINE}` : "none",
        }}>
          <span style={{ fontFamily: "Georgia, serif", fontSize: 15, color: INK }}>Anker.</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {ctx?.known && (
              <span style={chip(ctx.known === "crm" ? "#fff" : INK, ctx.known === "crm" ? INK : "#fff", INK)}>
                {ctx.known === "crm" ? "In CRM" : "In network"}
              </span>
            )}
            <button onClick={() => setOpen((v) => !v)}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: MUTED, fontSize: 13 }}>
              {open ? "▾" : "▴"}
            </button>
          </div>
        </header>

        {open && (
          <div style={{ padding: "12px 14px" }}>
            {/* Intelligence chips */}
            <div style={{ marginBottom: 8 }}>
              {ctx == null && <span style={{ fontSize: 11, color: MUTED }}>Checking Anker…</span>}
              {ctx && !ctx.known && <span style={chip(MUTED, "#fff", HAIRLINE)}>Not captured yet</span>}
              {ctx?.crm?.stage && <span style={chip(INK, "#fff", HAIRLINE)}>{ctx.crm.stage}</span>}
              {ctx?.crm?.tier && <span style={chip(INK, "#fff", HAIRLINE)}>Tier {ctx.crm.tier}</span>}
              {outreachLabel && <span style={chip("#065f46", "rgba(5,150,105,.06)", "rgba(5,150,105,.35)")}>Outreach: {outreachLabel}</span>}
              {!!ctx?.introPaths && <span style={chip(INK, "#fff", HAIRLINE)}>{ctx.introPaths} intro path{ctx.introPaths > 1 ? "s" : ""}</span>}
              {ctx?.jobChange && (
                <span style={chip("#92400e", "rgba(245,158,11,.08)", "rgba(245,158,11,.45)")}
                  title={ctx.jobChange.previousCompany ? `Previously at ${ctx.jobChange.previousCompany}` : undefined}>
                  Job change
                </span>
              )}
            </div>

            {/* Deal matches */}
            {!!ctx?.dealMatches?.length && (
              <div style={{
                marginBottom: 10, padding: "8px 10px", borderRadius: 8,
                background: "rgba(5,150,105,.05)", border: "1px solid rgba(5,150,105,.25)", fontSize: 11,
              }}>
                <div style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.8, color: "#065f46", marginBottom: 3 }}>
                  Active deals at this company
                </div>
                {ctx.dealMatches.slice(0, 3).map((d) => (
                  <div key={d.id} style={{ color: INK }}>{d.company} <span style={{ color: MUTED }}>· {d.stage}</span></div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={capture} disabled={busy}
                style={{
                  flex: 1, padding: "9px 10px", border: "none", borderRadius: 999, cursor: "pointer",
                  background: status === "ok" ? "#059669" : status === "err" || status === "no_match" ? "#b45309" : INK,
                  color: "#fff", fontWeight: 600, fontSize: 12, opacity: busy ? 0.7 : 1,
                }}>
                {status === "capturing" ? "Sending…" :
                 status === "ok" ? "Saved ✓" :
                 status === "no_match" ? "No match" :
                 status === "err" ? "Retry" : "Send to Anker"}
              </button>
              <button onClick={addAsDeal} disabled={busy}
                style={{
                  flex: 1, padding: "9px 10px", borderRadius: 999, cursor: "pointer",
                  background: dealStatus === "ok" ? "#059669" : "#fff",
                  color: dealStatus === "ok" ? "#fff" : INK,
                  border: `1px solid ${dealStatus === "ok" ? "#059669" : INK}`,
                  fontWeight: 600, fontSize: 12, opacity: busy ? 0.7 : 1,
                }}>
                {dealStatus === "sending" ? "Creating…" : dealStatus === "ok" ? "Deal added ✓" : "Add as deal"}
              </button>
            </div>

            {msg && (
              <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.45, color: dealStatus === "err" || status === "err" ? "#991b1b" : "#374151" }}>
                {msg}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AnkerCard;
