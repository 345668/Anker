/**
 * Toolbar popup — styled to match the Anker platform (editorial serif
 * headline, mono uppercase micro-labels, hairline borders, black pill
 * buttons on white).
 *
 * Two tabs:
 *   - Setup        : Anker base URL + paste-token + "Test connection"
 *   - Bulk capture : textarea of LinkedIn URLs + sequential capture
 *
 * State persists to chrome.storage.local via @plasmohq/storage. The popup
 * owns the bulk orchestration (chrome.tabs.create -> wait for load ->
 * scripting.executeScript to grab outerHTML -> send to background SW ->
 * close tab -> sleep `bulkDelayMs` -> next URL).
 */
import { useEffect, useState } from "react";
import { storage, KEYS, DEFAULT_BASE, normalizeBaseUrl } from "~lib/anker-client";

type Tab = "setup" | "bulk";

// ── Anker design tokens ──────────────────────────────────────────────────────

const INK = "#111111";
const MUTED = "#6b6b6b";
const HAIRLINE = "#e8e6e1";
const PAPER = "#ffffff";
const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export default function Popup() {
  const [tab, setTab] = useState<Tab>("setup");

  return (
    <div style={{
      width: 420, minHeight: 480, padding: 0, margin: 0,
      fontFamily: SANS, fontSize: 13, color: INK, background: PAPER,
    }}>
      <header style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${HAIRLINE}` }}>
        <div style={{
          fontFamily: MONO, fontSize: 9, textTransform: "uppercase",
          letterSpacing: 1.2, color: MUTED, display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ display: "inline-block", width: 24, height: 1, background: "#bbb" }} />
          LinkedIn · Network capture
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 }}>
          <strong style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 500, letterSpacing: -0.4 }}>Anker.</strong>
          <span style={{ fontFamily: MONO, fontSize: 10, color: MUTED }}>v0.2.0</span>
        </div>
      </header>
      <nav style={{ display: "flex", borderBottom: `1px solid ${HAIRLINE}` }}>
        {(["setup", "bulk"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "10px 12px", border: "none", cursor: "pointer",
              background: PAPER,
              borderBottom: tab === t ? `2px solid ${INK}` : "2px solid transparent",
              fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: 1,
              color: tab === t ? INK : MUTED,
            }}>
            {t === "setup" ? "Setup" : "Bulk capture"}
          </button>
        ))}
      </nav>
      <main style={{ padding: 20 }}>
        {tab === "setup" ? <Setup /> : <Bulk />}
      </main>
    </div>
  );
}

function Setup() {
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [bulkDelay, setBulkDelay] = useState(3000);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => { (async () => {
    const b = (await storage.get(KEYS.baseUrl)) || DEFAULT_BASE;
    const t = (await storage.get(KEYS.token)) || "";
    const d = Number(await storage.get(KEYS.bulkDelayMs)) || 3000;
    setBaseUrl(b); setToken(t); setBulkDelay(d);
  })(); }, []);

  async function save() {
    await storage.set(KEYS.baseUrl, normalizeBaseUrl(baseUrl));
    await storage.set(KEYS.token, token.trim());
    await storage.set(KEYS.bulkDelayMs, String(Math.max(1000, bulkDelay)));
  }

  async function test() {
    await save();
    setTesting(true); setTestResult(null);
    try {
      const res: { ok: boolean; userId?: string; email?: string; error?: string } =
        await chrome.runtime.sendMessage({ type: "whoami" });
      if (res?.ok) setTestResult({ ok: true, msg: `Connected as ${res.email || res.userId}` });
      else setTestResult({ ok: false, msg: res?.error || "Token rejected." });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.message || "Network error" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div>
      <Field label="Anker base URL">
        <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://www.an-ker.de"
          style={input} />
      </Field>
      <Field label="Bearer token">
        <textarea value={token} onChange={(e) => setToken(e.target.value)}
          placeholder="ank_..."
          rows={2}
          style={{ ...input, fontFamily: MONO, fontSize: 11 }} />
        <p style={hint}>
          Mint a token at <code style={{ fontFamily: MONO }}>{(baseUrl || DEFAULT_BASE).replace(/^https?:\/\//, "")}/dashboard/settings/extension-tokens</code>.
          Tokens are stored locally and never sent anywhere except your Anker server.
        </p>
      </Field>
      <Field label="Bulk capture delay (ms between profiles)">
        <input type="number" min={1000} step={500} value={bulkDelay} onChange={(e) => setBulkDelay(Number(e.target.value))}
          style={input} />
      </Field>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button onClick={save} style={btnGhost}>Save</button>
        <button onClick={test} disabled={testing || !token}
          style={{ ...btnSolid, opacity: testing || !token ? 0.5 : 1 }}>
          {testing ? "Testing…" : "Test connection"}
        </button>
      </div>
      {testResult && (
        <div style={{
          marginTop: 12, padding: "8px 10px", borderRadius: 8,
          background: testResult.ok ? "rgba(5,150,105,0.06)" : "rgba(220,38,38,0.05)",
          color: testResult.ok ? "#065f46" : "#991b1b",
          border: `1px solid ${testResult.ok ? "rgba(5,150,105,0.3)" : "rgba(220,38,38,0.3)"}`,
          fontSize: 12,
        }}>
          {testResult.msg}
        </div>
      )}
    </div>
  );
}

function Bulk() {
  const [urls, setUrls] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Array<{ url: string; status: "pending" | "ok" | "no_match" | "err"; msg?: string }>>([]);

  function parseUrls(): string[] {
    return urls.split(/[\r\n,]+/).map((s) => s.trim()).filter((s) => /linkedin\.com\/in\//i.test(s));
  }

  async function captureOne(url: string): Promise<{ status: "ok" | "no_match" | "err"; msg: string }> {
    const tab = await chrome.tabs.create({ url, active: false });
    if (!tab.id) return { status: "err", msg: "Could not open tab" };
    try {
      // Wait for the tab to settle.
      await new Promise<void>((resolve) => {
        const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
          if (id === tab.id && info.status === "complete") { chrome.tabs.onUpdated.removeListener(listener); resolve(); }
        };
        chrome.tabs.onUpdated.addListener(listener);
        // Hard cap so we don't hang forever on bad pages.
        setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 12000);
      });
      // Extra 800ms for client-side JS to render the profile shell.
      await new Promise((r) => setTimeout(r, 800));
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.documentElement.outerHTML,
      });
      const html = result as string;
      const res: { ok?: boolean; reason?: string; hint?: string; extracted?: any; error?: string } =
        await chrome.runtime.sendMessage({ type: "ingest", url, html });
      if (res?.error) return { status: "err", msg: res.error };
      if (res?.ok === false && res?.reason === "no_match") return { status: "no_match", msg: res.hint || "no CRM match" };
      if (res?.ok) {
        const who = [res.extracted?.fullName, res.extracted?.firm].filter(Boolean).join(" · ");
        return { status: "ok", msg: who || "saved" };
      }
      return { status: "err", msg: "unexpected response" };
    } finally {
      try { await chrome.tabs.remove(tab.id); } catch {}
    }
  }

  async function runBulk() {
    const list = parseUrls();
    if (!list.length) return;
    setRunning(true);
    const initial = list.map((url) => ({ url, status: "pending" as const }));
    setProgress(initial);
    const delay = Number(await storage.get(KEYS.bulkDelayMs)) || 3000;
    for (let i = 0; i < list.length; i++) {
      const out = await captureOne(list[i]);
      setProgress((p) => p.map((row, idx) => idx === i ? { ...row, status: out.status, msg: out.msg } : row));
      if (i < list.length - 1) await new Promise((r) => setTimeout(r, delay));
    }
    setRunning(false);
  }

  return (
    <div>
      <Field label={`LinkedIn URLs (one per line, ${parseUrls().length} valid)`}>
        <textarea value={urls} onChange={(e) => setUrls(e.target.value)}
          placeholder="https://www.linkedin.com/in/annewojcicki"
          rows={6} style={{ ...input, fontFamily: MONO, fontSize: 11 }} />
      </Field>
      <button onClick={runBulk} disabled={running || !parseUrls().length}
        style={{ ...btnSolid, opacity: running || !parseUrls().length ? 0.5 : 1 }}>
        {running ? `Capturing ${progress.filter((p) => p.status !== "pending").length}/${progress.length}…` : `Capture ${parseUrls().length} profile(s)`}
      </button>
      {!!progress.length && (
        <ul style={{ marginTop: 12, padding: 0, listStyle: "none", maxHeight: 220, overflow: "auto", borderTop: `1px solid ${HAIRLINE}` }}>
          {progress.map((row, i) => (
            <li key={i} style={{
              padding: "6px 0", borderBottom: `1px solid #f4f2ee`, fontSize: 11,
              display: "grid", gridTemplateColumns: "16px 1fr", gap: 8, alignItems: "center",
            }}>
              <span style={{ color: row.status === "ok" ? "#059669" : row.status === "err" ? "#dc2626" : row.status === "no_match" ? "#b45309" : "#9ca3af" }}>
                {row.status === "pending" ? "…" : row.status === "ok" ? "✓" : row.status === "no_match" ? "?" : "✕"}
              </span>
              <span>
                <div style={{ color: MUTED, fontFamily: MONO }}>{row.url}</div>
                {row.msg && <div style={{ color: INK, marginTop: 2 }}>{row.msg}</div>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: "block", fontFamily: MONO, fontSize: 9, color: MUTED,
        marginBottom: 5, textTransform: "uppercase", letterSpacing: 1.1,
      }}>{label}</label>
      {children}
    </div>
  );
}

const input: React.CSSProperties = {
  width: "100%", padding: "9px 11px", border: `1px solid ${HAIRLINE}`, borderRadius: 8,
  fontSize: 12, color: INK, background: PAPER, boxSizing: "border-box", outline: "none",
};
const hint: React.CSSProperties = { fontSize: 11, color: MUTED, margin: "5px 0 0", lineHeight: 1.5 };
const btnSolid: React.CSSProperties = {
  padding: "9px 18px", border: `1px solid ${INK}`, borderRadius: 999, cursor: "pointer",
  background: INK, color: PAPER, fontWeight: 600, fontSize: 12,
};
const btnGhost: React.CSSProperties = {
  padding: "9px 18px", border: `1px solid ${HAIRLINE}`, borderRadius: 999, cursor: "pointer",
  background: PAPER, color: INK, fontWeight: 600, fontSize: 12,
};
