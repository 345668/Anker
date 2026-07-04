/**
 * Toolbar popup.
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
import { storage, KEYS, DEFAULT_BASE } from "~lib/anker-client";

type Tab = "setup" | "bulk" | "connections";

export default function Popup() {
  const [tab, setTab] = useState<Tab>("setup");

  return (
    <div style={{
      width: 420, minHeight: 480, padding: 0, margin: 0,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontSize: 13, color: "#111", background: "#fff",
    }}>
      <header style={{ padding: "12px 16px", background: "#0a66c2", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <strong>Anker LinkedIn</strong>
        <span style={{ fontSize: 11, opacity: 0.8 }}>v0.1</span>
      </header>
      <nav style={{ display: "flex", borderBottom: "1px solid #e5e7eb" }}>
        {(["setup", "bulk", "connections"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "10px 12px", border: "none", cursor: "pointer",
              background: tab === t ? "#fff" : "#f3f4f6",
              borderBottom: tab === t ? "2px solid #0a66c2" : "2px solid transparent",
              fontWeight: 600, fontSize: 12,
              color: tab === t ? "#0a66c2" : "#374151",
            }}>
            {t === "setup" ? "Setup" : t === "bulk" ? "Bulk capture" : "My Connections"}
          </button>
        ))}
      </nav>
      <main style={{ padding: 16 }}>
        {tab === "setup" ? <Setup /> : tab === "bulk" ? <Bulk /> : <Connections />}
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
    await storage.set(KEYS.baseUrl, baseUrl.trim() || DEFAULT_BASE);
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
          placeholder="https://anker.vercel.app"
          style={input} />
      </Field>
      <Field label="Bearer token">
        <textarea value={token} onChange={(e) => setToken(e.target.value)}
          placeholder="ank_..."
          rows={2}
          style={{ ...input, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11 }} />
        <p style={hint}>
          Mint a token at <code>{baseUrl || DEFAULT_BASE}/dashboard/settings/extension-tokens</code> (or via the API).
          Tokens are stored locally and never sent anywhere except your Anker server.
        </p>
      </Field>
      <Field label="Bulk capture delay (ms between profiles)">
        <input type="number" min={1000} step={500} value={bulkDelay} onChange={(e) => setBulkDelay(Number(e.target.value))}
          style={input} />
      </Field>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={save} style={btn}>Save</button>
        <button onClick={test} disabled={testing || !token} style={{ ...btn, background: testing ? "#9ca3af" : "#0a66c2", color: "#fff" }}>
          {testing ? "Testing…" : "Test connection"}
        </button>
      </div>
      {testResult && (
        <div style={{
          marginTop: 10, padding: 8, borderRadius: 6,
          background: testResult.ok ? "#ecfdf5" : "#fef2f2",
          color: testResult.ok ? "#065f46" : "#991b1b",
          border: `1px solid ${testResult.ok ? "#a7f3d0" : "#fecaca"}`,
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
          rows={6} style={{ ...input, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11 }} />
      </Field>
      <button onClick={runBulk} disabled={running || !parseUrls().length}
        style={{ ...btn, background: running ? "#9ca3af" : "#0a66c2", color: "#fff" }}>
        {running ? `Capturing ${progress.filter((p) => p.status !== "pending").length}/${progress.length}…` : `Capture ${parseUrls().length} profile(s)`}
      </button>
      {!!progress.length && (
        <ul style={{ marginTop: 10, padding: 0, listStyle: "none", maxHeight: 220, overflow: "auto", borderTop: "1px solid #e5e7eb" }}>
          {progress.map((row, i) => (
            <li key={i} style={{
              padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontSize: 11,
              display: "grid", gridTemplateColumns: "16px 1fr", gap: 8, alignItems: "center",
            }}>
              <span style={{ color: row.status === "ok" ? "#16a34a" : row.status === "err" ? "#dc2626" : row.status === "no_match" ? "#f59e0b" : "#9ca3af" }}>
                {row.status === "pending" ? "…" : row.status === "ok" ? "✓" : row.status === "no_match" ? "?" : "✕"}
              </span>
              <span>
                <div style={{ color: "#6b7280", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{row.url}</div>
                {row.msg && <div style={{ color: "#111", marginTop: 2 }}>{row.msg}</div>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * "My Connections" tab.
 *
 * The actual scrape happens in a content script (contents/connections.tsx)
 * that draws a floating panel on linkedin.com/mynetwork/.../connections/.
 * This popup tab is just a launcher: it opens the connections page in a
 * new tab and reminds the user what to click.
 *
 * Rationale: LinkedIn's connections list is a heavy virtualised scroller
 * with continual XHRs — trying to drive it from a background tab (like
 * Bulk capture does with individual profiles) is fragile. Doing it in a
 * focused foreground tab with a visible panel is more reliable and the
 * user can watch the counter climb.
 */
function Connections() {
  const CONN_URL = "https://www.linkedin.com/mynetwork/invite-connections/connections/";

  async function open() {
    await chrome.tabs.create({ url: CONN_URL, active: true });
    // Popups auto-close when focus moves to the new tab; not a bug.
  }

  return (
    <div>
      <div style={{
        padding: "10px 12px", borderRadius: 8,
        background: "#eff6ff", color: "#1e3a8a",
        border: "1px solid #dbeafe", fontSize: 12, lineHeight: 1.5,
        marginBottom: 12,
      }}>
        Sync your 1st-degree LinkedIn connections into Anker so we can build your
        Network graph and cross-reference them against your CRM.
      </div>

      <ol style={{ margin: "0 0 12px 18px", padding: 0, fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
        <li>Click <b>Open My Connections</b> below.</li>
        <li>Wait for LinkedIn to render your connections list.</li>
        <li>The floating <b>Anker · My Connections</b> panel appears on the right.</li>
        <li>Hit <b>Capture all connections</b>. It auto-scrolls, extracts every card, and streams them to Anker in batches.</li>
        <li>When done, open <code>/dashboard/network</code> in Anker to see the Galaxy view.</li>
      </ol>

      <button onClick={open} style={{ ...btn, width: "100%", background: "#0a66c2", color: "#fff" }}>
        Open My Connections
      </button>

      <p style={{ ...hint, marginTop: 10 }}>
        Nothing is uploaded until you click Capture — the extension only sends the visible
        card fields (name, headline, profile URL, thumbnail, "Connected N ago") to your
        Anker server. No LinkedIn credentials, cookies, or private data leaves the browser.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</label>
      {children}
    </div>
  );
}

const input: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6,
  fontSize: 12, color: "#111", background: "#fff", boxSizing: "border-box",
};
const hint: React.CSSProperties = { fontSize: 11, color: "#6b7280", margin: "4px 0 0" };
const btn: React.CSSProperties = {
  padding: "8px 14px", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer",
  background: "#fff", color: "#111", fontWeight: 600, fontSize: 12,
};
