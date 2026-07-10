/**
 * Content script: LinkedIn messaging outreach assist.
 *
 * Runs on linkedin.com/messaging/*. Detects the active conversation's
 * recipient (name + profile URL when available) and asks the background SW
 * for the curated draft (subject + email body + DM) Anker already produced
 * for that recipient.
 *
 * Renders a small side panel anchored to the bottom-right with the three
 * pieces and a Copy button for each. The user clicks Copy, switches focus
 * to LinkedIn's compose box, pastes. NO auto-paste, NO auto-send — that's
 * a deliberate TOS choice.
 *
 * Recipient detection is intentionally conservative: it pulls from LinkedIn's
 * conversation header DOM, then falls back to the URL if no name is visible.
 * Re-runs every 1500ms because LinkedIn's SPA swaps conversations without
 * a full page reload.
 */
import type { PlasmoCSConfig } from "plasmo";
import { useEffect, useState } from "react";

export const config: PlasmoCSConfig = {
  matches: ["https://www.linkedin.com/messaging/*"],
  run_at: "document_idle",
};

interface Draft {
  found: boolean;
  name?: string | null;
  subject?: string | null;
  body?: string | null;
  dm?: string | null;
  hint?: string;
  error?: string;
}

// Best-effort recipient detector. LinkedIn rewrites its DOM monthly; we try a
// handful of selectors and accept that misses happen — UX shows a clear
// "couldn't detect" state and the user can paste the LinkedIn URL manually.
function detectRecipient(): { firstName?: string; lastName?: string; linkedinUrl?: string } {
  const headerSelectors = [
    ".msg-thread__link-to-profile",
    ".msg-conversations-container__convo-item-link h3",
    "[data-control-name='view_profile']",
    "a[href*='/in/']",
  ];
  for (const sel of headerSelectors) {
    const el = document.querySelector(sel) as HTMLAnchorElement | HTMLElement | null;
    if (!el) continue;
    const href = (el as HTMLAnchorElement).href || "";
    const linkedinUrl = href.includes("/in/") ? href.split("?")[0] : undefined;
    const text = (el.textContent || "").trim();
    const [firstName, ...rest] = text.split(/\s+/);
    if (firstName) return { firstName, lastName: rest.join(" ") || undefined, linkedinUrl };
  }
  return {};
}

function CopyBtn({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      style={{
        padding: "4px 10px", border: "none", borderRadius: 6, cursor: "pointer",
        background: copied ? "#059669" : "#111111", color: "#fff",
        fontSize: 11, fontWeight: 600,
      }}>
      {copied ? "Copied!" : label}
    </button>
  );
}

function Panel() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [recipient, setRecipient] = useState<{ firstName?: string; lastName?: string; linkedinUrl?: string }>({});
  const [collapsed, setCollapsed] = useState(false);
  const [outreach, setOutreach] = useState<{ status: string | null; sentAt: string | null; opens: number | null } | null>(null);

  useEffect(() => {
    let lastKey = "";
    const tick = async () => {
      const r = detectRecipient();
      const key = (r.linkedinUrl || "") + "|" + (r.firstName || "") + "|" + (r.lastName || "");
      if (!key || key === lastKey) return;
      lastKey = key;
      setRecipient(r);
      if (!r.firstName && !r.linkedinUrl) { setDraft(null); return; }
      try {
        const res: Draft = await chrome.runtime.sendMessage({ type: "draftByName", ...r });
        setDraft(res);
      } catch (e: any) {
        setDraft({ found: false, error: e?.message || "Lookup failed" });
      }
      // Outreach status: never double-message someone you've already reached.
      setOutreach(null);
      if (r.linkedinUrl) {
        try {
          const c = await chrome.runtime.sendMessage({ type: "context", urls: [r.linkedinUrl] });
          const first: any = c?.contexts ? Object.values(c.contexts)[0] : null;
          if (first?.outreach) setOutreach(first.outreach);
        } catch { /* best-effort */ }
      }
    };
    const id = setInterval(tick, 1500);
    tick();
    return () => clearInterval(id);
  }, []);

  if (!recipient.firstName && !recipient.linkedinUrl) return null;

  return (
    <div style={{
      position: "fixed", bottom: 16, right: 16, zIndex: 2147483647,
      width: collapsed ? 200 : 360, maxHeight: "70vh", overflow: "auto",
      background: "#fff", color: "#111", borderRadius: 10,
      boxShadow: "0 12px 36px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.06)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontSize: 12, lineHeight: 1.5,
    }}>
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px", background: "#111111", color: "#fff",
        borderTopLeftRadius: 10, borderTopRightRadius: 10, fontWeight: 600,
      }}>
        <span style={{ fontFamily: "Georgia, serif" }}>
          Anker draft {recipient.firstName ? `· ${recipient.firstName}` : ""}
          {outreach && (outreach.status === "sent" || outreach.sentAt) && (
            <span style={{
              marginLeft: 8, padding: "1px 8px", borderRadius: 999,
              background: "rgba(255,255,255,.15)", fontFamily: "ui-monospace,Menlo,monospace",
              fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase",
            }}>
              already sent{outreach.opens ? ` · ${outreach.opens} opens` : ""}
            </span>
          )}
        </span>
        <button onClick={() => setCollapsed((c) => !c)}
          style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", fontSize: 14 }}>
          {collapsed ? "▴" : "▾"}
        </button>
      </header>
      {!collapsed && (
        <div style={{ padding: 12 }}>
          {!draft && <div style={{ color: "#6b7280" }}>Looking up…</div>}
          {draft && !draft.found && (
            <div style={{ color: "#6b7280" }}>
              {draft.error || draft.hint || "No curated draft found for this recipient. Add them to a campaign first."}
            </div>
          )}
          {draft?.found && (
            <>
              {draft.subject && (
                <Section title="Subject" value={draft.subject} />
              )}
              {draft.body && (
                <Section title="Email body" value={draft.body} long />
              )}
              {draft.dm && (
                <Section title="LinkedIn DM" value={draft.dm} long />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, value, long }: { title: string; value: string; long?: boolean }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>{title}</span>
        <CopyBtn value={value} label="Copy" />
      </div>
      <div style={{
        background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6,
        padding: 8, whiteSpace: "pre-wrap", wordBreak: "break-word",
        maxHeight: long ? 180 : undefined, overflow: "auto",
      }}>
        {value}
      </div>
    </div>
  );
}

export default Panel;
