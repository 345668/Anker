/**
 * Content script: LinkedIn profile capture.
 *
 * Runs on every linkedin.com/in/<slug> URL. Renders a floating "Send to Anker"
 * button in the top-right of the page. On click, captures the rendered HTML
 * (post-auth, post-JS) and forwards it to the background SW.
 *
 * The SW POSTs to /api/extension/ingest. The server-side parser
 * (lib/agents/linkedin-public.ts) takes the variance heat — no LinkedIn
 * DOM selectors live in this file beyond `document.documentElement`.
 */
import type { PlasmoCSConfig } from "plasmo";
import { useState } from "react";

export const config: PlasmoCSConfig = {
  matches: ["https://www.linkedin.com/in/*"],
  run_at: "document_idle",
};

type Status = "idle" | "capturing" | "ok" | "no_match" | "err";

interface Result {
  ok?: boolean;
  reason?: string;
  hint?: string;
  summary?: string | null;
  crmEntryId?: string;
  error?: string;
  extracted?: { fullName?: string; title?: string; firm?: string };
}

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
  // Fallback: search the top-card region's text once.
  const top = document.querySelector("main section");
  const t = (top?.textContent || "").slice(0, 2000);
  if (/·\s*1st\b/.test(t)) return 1;
  if (/·\s*2nd\b/.test(t)) return 2;
  if (/·\s*3rd\b/.test(t)) return 3;
  return undefined;
}

/**
 * Mutual connections from the top-card highlight, e.g.
 * "Jane Doe, John Roe, and 12 other mutual connections".
 * Named mutuals only — the "+N others" tail carries no identity.
 */
function detectMutuals(): Array<{ name: string; url?: string }> {
  const out: Array<{ name: string; url?: string }> = [];
  // The mutual-connections highlight links to /search/results/people?facetConnectionOf=…
  const anchor = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find(
    (a) => /mutual connection/i.test(a.textContent || ""),
  );
  if (!anchor) return out;
  const text = (anchor.textContent || "").replace(/\s+/g, " ").trim();
  // "A, B, and 3 other mutual connections" | "A and B are mutual connections"
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

function FloatingButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState<string>("");

  async function capture() {
    setStatus("capturing");
    setMsg("Capturing page HTML…");
    try {
      const html = document.documentElement.outerHTML;
      const url = window.location.href;
      const degree = detectDegree();
      const res: Result = await chrome.runtime.sendMessage({ type: "ingest", url, html, degree });
      if (res?.error) { setStatus("err"); setMsg(res.error); return; }

      // Fire-and-forget: record any named mutual connections for the graph.
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

  const palette: Record<Status, { bg: string; fg: string; ring: string }> = {
    idle:       { bg: "#0a66c2", fg: "#fff",    ring: "#0a66c2" },
    capturing:  { bg: "#0a66c2", fg: "#fff",    ring: "#0a66c2" },
    ok:         { bg: "#16a34a", fg: "#fff",    ring: "#16a34a" },
    no_match:   { bg: "#f59e0b", fg: "#1f1300", ring: "#f59e0b" },
    err:        { bg: "#dc2626", fg: "#fff",    ring: "#dc2626" },
  };
  const c = palette[status];

  return (
    <div style={{
      position: "fixed", top: 76, right: 16, zIndex: 2147483647,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      maxWidth: 280,
    }}>
      <button
        onClick={capture}
        disabled={status === "capturing"}
        style={{
          padding: "10px 14px", border: "none", borderRadius: 999, cursor: "pointer",
          background: c.bg, color: c.fg, fontWeight: 600, fontSize: 13,
          boxShadow: `0 0 0 1px ${c.ring}33, 0 6px 16px rgba(0,0,0,.18)`,
          opacity: status === "capturing" ? 0.85 : 1,
        }}>
        {status === "capturing" ? "Sending…" :
         status === "ok" ? "Saved to Anker" :
         status === "no_match" ? "No match" :
         status === "err" ? "Retry" :
         "Send to Anker"}
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

export default FloatingButton;
