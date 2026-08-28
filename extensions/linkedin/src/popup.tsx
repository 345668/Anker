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

type Tab = "setup" | "bulk" | "campaign" | "outreach";

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
          <span style={{ fontFamily: MONO, fontSize: 10, color: MUTED }}>v0.6.0</span>
        </div>
      </header>
      <nav style={{ display: "flex", borderBottom: `1px solid ${HAIRLINE}` }}>
        {(["setup", "bulk", "campaign", "outreach"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "10px 8px", border: "none", cursor: "pointer",
              background: PAPER,
              borderBottom: tab === t ? `2px solid ${INK}` : "2px solid transparent",
              fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6,
              color: tab === t ? INK : MUTED,
            }}>
            {t === "setup" ? "Setup" : t === "bulk" ? "Bulk" : t === "campaign" ? "Capture" : "Outreach"}
          </button>
        ))}
      </nav>
      <main style={{ padding: 20 }}>
        {tab === "setup" ? <Setup /> : tab === "bulk" ? <Bulk /> : tab === "campaign" ? <Campaign /> : <Outreach />}
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
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  useEffect(() => { (async () => {
    const b = (await storage.get(KEYS.baseUrl)) || DEFAULT_BASE;
    const t = (await storage.get(KEYS.token)) || "";
    const d = Number(await storage.get(KEYS.bulkDelayMs)) || 3000;
    const ls = (await storage.get(KEYS.lastSyncAt)) || null;
    setBaseUrl(b); setToken(t); setBulkDelay(d); setLastSyncAt(ls);
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

  const syncAgeDays = lastSyncAt ? Math.floor((Date.now() - new Date(lastSyncAt).getTime()) / 86400000) : null;

  return (
    <div>
      {lastSyncAt != null && (
        <div style={{
          marginBottom: 14, padding: "8px 10px", borderRadius: 8, fontSize: 11, lineHeight: 1.5,
          background: (syncAgeDays ?? 0) > 30 ? "rgba(245,158,11,.07)" : "rgba(5,150,105,.05)",
          border: `1px solid ${(syncAgeDays ?? 0) > 30 ? "rgba(245,158,11,.4)" : "rgba(5,150,105,.25)"}`,
          color: (syncAgeDays ?? 0) > 30 ? "#92400e" : "#065f46",
        }}>
          Network last synced {syncAgeDays === 0 ? "today" : `${syncAgeDays} day${syncAgeDays === 1 ? "" : "s"} ago`}.
          {(syncAgeDays ?? 0) > 30 && " Time for a re-sync — open your connections page and hit Sync; re-captures also flag job changes."}
        </div>
      )}
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
// Primary CTA — same as the solid pill; kept as a named alias the Campaign +
// Outreach tabs use.
const btnPrimary: React.CSSProperties = btnSolid;

// ── Campaign tab ─────────────────────────────────────────────────────────────

function Campaign() {
  const [status, setStatus] = useState<{ running: boolean; processed: number; failed: number; remaining: number; lastError: string | null } | null>(null);

  async function refresh() {
    try {
      const s = await chrome.runtime.sendMessage({ type: "crawlStatus" });
      setStatus(s);
    } catch {}
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, []);

  async function start() {
    await chrome.runtime.sendMessage({ type: "crawlStart" });
    refresh();
  }
  async function stop() {
    await chrome.runtime.sendMessage({ type: "crawlStop" });
    refresh();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: 1.2, color: MUTED }}>
          Campaign crawl queue
        </div>
        <p style={{ marginTop: 6, marginBottom: 0, color: MUTED, fontSize: 12, lineHeight: 1.55 }}>
          Pulls T1 LinkedIn URLs from your Anker campaign, opens each in a background tab, captures the
          profile, and files it into CRM. One tab at a time so LinkedIn doesn't rate-limit.
        </p>
      </div>

      <div style={{
        border: `1px solid ${HAIRLINE}`, borderRadius: 6, padding: 12,
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, fontSize: 12,
      }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: MUTED, textTransform: "uppercase" }}>Processed</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{status?.processed ?? 0}</div>
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: MUTED, textTransform: "uppercase" }}>Failed</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: (status?.failed ?? 0) > 0 ? "#a03030" : INK }}>
            {status?.failed ?? 0}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: MUTED, textTransform: "uppercase" }}>State</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: status?.running ? "#166534" : MUTED }}>
            {status?.running ? "Running" : "Idle"}
          </div>
        </div>
      </div>

      {status?.lastError && (
        <div style={{
          fontSize: 12, color: "#8a1c1c", padding: "8px 10px",
          border: "1px solid #f0d4d4", background: "#fbf1f1", borderRadius: 4,
        }}>
          Last error: {status.lastError}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {!status?.running ? (
          <button onClick={start} style={btnPrimary}>Start crawl</button>
        ) : (
          <button onClick={stop} style={btnGhost}>Stop crawl</button>
        )}
        <button onClick={refresh} style={btnGhost}>Refresh</button>
      </div>

      <p style={{ marginTop: 4, color: MUTED, fontSize: 11, lineHeight: 1.55 }}>
        Queue is populated from the Anker campaign builder (Enrich step). Sign in there, click{" "}
        <b>Queue T1 for Chrome-extension crawl</b>, then come back here and hit Start.
      </p>
    </div>
  );
}

// ── Outreach tab ─────────────────────────────────────────────────────────────
//
// Drives the outbound action worker: polls Anker for APPROVED actions (connect /
// message), executes each on LinkedIn in a background tab at a human cadence, and
// reports the result. Only human-approved actions are ever handed out, so this is
// safe to leave running.

function Outreach() {
  const [status, setStatus] = useState<{ running: boolean; processed: number; failed: number; remaining: number; lastError: string | null; lastFriction?: string | null } | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [syncingInv, setSyncingInv] = useState(false);
  const [invMsg, setInvMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function syncInvites() {
    setSyncingInv(true); setInvMsg(null);
    try {
      const r: { ok: boolean; marked?: number; pending?: number; error?: string } =
        await chrome.runtime.sendMessage({ type: "syncInvites" });
      if (r?.ok) setInvMsg({ ok: true, text: `${r.pending ?? 0} pending · ${r.marked ?? 0} newly accepted.` });
      else setInvMsg({ ok: false, text: r?.error || "Sync failed." });
    } catch (e: any) {
      setInvMsg({ ok: false, text: e?.message || "Sync failed." });
    } finally { setSyncingInv(false); }
  }

  async function syncInbox() {
    setSyncing(true); setSyncMsg(null);
    try {
      const r: { ok: boolean; conversations?: number; repliesDetected?: number; error?: string } =
        await chrome.runtime.sendMessage({ type: "syncInbox" });
      if (r?.ok) {
        const replies = r.repliesDetected ? `, ${r.repliesDetected} reply-stop${r.repliesDetected === 1 ? "" : "s"}` : "";
        setSyncMsg({ ok: true, text: `Synced ${r.conversations ?? 0} conversation(s)${replies}.` });
      } else {
        setSyncMsg({ ok: false, text: r?.error || "Sync failed." });
      }
    } catch (e: any) {
      setSyncMsg({ ok: false, text: e?.message || "Sync failed." });
    } finally {
      setSyncing(false);
    }
  }

  async function refresh() {
    try { setStatus(await chrome.runtime.sendMessage({ type: "actionStatus" })); } catch {}
  }
  useEffect(() => {
    (async () => { setAutoRun((await storage.get(KEYS.outreachAutoRun)) === "true"); })();
    refresh();
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, []);

  async function start() { await chrome.runtime.sendMessage({ type: "actionStart" }); refresh(); }
  async function stop() { await chrome.runtime.sendMessage({ type: "actionStop" }); refresh(); }

  async function toggleAuto(next: boolean) {
    setAutoRun(next);
    await storage.set(KEYS.outreachAutoRun, next ? "true" : "false");
    if (next) start(); else stop();
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: 1.2, color: MUTED }}>
          Outbound action queue
        </div>
        <p style={{ marginTop: 6, marginBottom: 0, color: MUTED, fontSize: 12, lineHeight: 1.55 }}>
          Runs <b>approved</b> LinkedIn actions from your Anker campaigns — connection requests and
          messages — one at a time, at a human pace. Nothing sends until you approve it in the
          Review Queue (or a campaign is set to full-auto).
        </p>
      </div>

      <div style={{
        border: `1px solid ${HAIRLINE}`, borderRadius: 6, padding: 12,
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, fontSize: 12,
      }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: MUTED, textTransform: "uppercase" }}>Sent</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{status?.processed ?? 0}</div>
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: MUTED, textTransform: "uppercase" }}>Failed</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: (status?.failed ?? 0) > 0 ? "#a03030" : INK }}>{status?.failed ?? 0}</div>
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: MUTED, textTransform: "uppercase" }}>State</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: status?.running ? "#166534" : MUTED }}>
            {status?.running ? "Running" : "Idle"}
          </div>
        </div>
      </div>

      {status?.lastFriction && (
        <div style={{
          fontSize: 12, color: "#8a5a1c", padding: "8px 10px",
          border: "1px solid #f0e2c4", background: "#fbf7ef", borderRadius: 4,
        }}>
          Paused on LinkedIn friction ({status.lastFriction}). Open LinkedIn, clear any checkpoint, then Start again.
        </div>
      )}
      {status?.lastError && !status?.lastFriction && (
        <div style={{
          fontSize: 12, color: "#8a1c1c", padding: "8px 10px",
          border: "1px solid #f0d4d4", background: "#fbf1f1", borderRadius: 4,
        }}>
          Last error: {status.lastError}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {!status?.running ? (
          <button onClick={start} style={btnPrimary}>Start sending</button>
        ) : (
          <button onClick={stop} style={btnGhost}>Stop</button>
        )}
        <button onClick={refresh} style={btnGhost}>Refresh</button>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: INK, cursor: "pointer" }}>
        <input type="checkbox" checked={autoRun} onChange={(e) => toggleAuto(e.target.checked)} />
        Keep sending — auto-resume when Chrome starts
      </label>

      <div style={{ borderTop: `1px solid ${HAIRLINE}`, paddingTop: 12 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: 1.2, color: MUTED, marginBottom: 6 }}>
          Unibox sync
        </div>
        <p style={{ margin: "0 0 8px", color: MUTED, fontSize: 11, lineHeight: 1.55 }}>
          Pull your latest LinkedIn conversations into Anker&apos;s Unibox. Replies from people in a
          campaign automatically stop their sequence.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={syncInbox} disabled={syncing} style={{ ...btnGhost, opacity: syncing ? 0.5 : 1 }}>
            {syncing ? "Syncing…" : "Sync inbox now"}
          </button>
          <button onClick={syncInvites} disabled={syncingInv} style={{ ...btnGhost, opacity: syncingInv ? 0.5 : 1 }}>
            {syncingInv ? "Syncing…" : "Sync invites (acceptance)"}
          </button>
        </div>
        {syncMsg && <div style={{ marginTop: 8, fontSize: 11, color: syncMsg.ok ? "#065f46" : "#991b1b" }}>{syncMsg.text}</div>}
        {invMsg && <div style={{ marginTop: 4, fontSize: 11, color: invMsg.ok ? "#065f46" : "#991b1b" }}>{invMsg.text}</div>}
      </div>

      <p style={{ marginTop: 0, color: MUTED, fontSize: 11, lineHeight: 1.55 }}>
        Build a sequence in <b>Anker → LinkedIn → Campaigns</b>, enroll people, and approve actions in{" "}
        <b>Review Queue</b>. Keep this browser signed in to the sending account.
      </p>
    </div>
  );
}
