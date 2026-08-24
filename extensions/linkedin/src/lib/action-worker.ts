/**
 * Outbound action worker.
 *
 * The counterpart to the crawl worker, for the LinkedIn outreach engine. Polls
 * the Anker action queue for APPROVED actions (the server only ever hands out
 * human-approved 'queued' rows), opens the target profile in a hidden tab,
 * executes the action (connect / message), reports the result, and moves on.
 *
 * One tab at a time, with jitter between actions, so LinkedIn sees a human
 * cadence and the user's normal browsing isn't disrupted.
 */
import { fetchActionQueue, reportActionResult, type LiActionItem } from "./anker-client";
import { executeConnect, executeMessage, type ExecResult } from "./action-executor";

let running = false;
let currentBatch: LiActionItem[] = [];
let processed = 0;
let failed = 0;
let lastError: string | null = null;
let lastFriction: string | null = null;

const PER_TAB_TIMEOUT_MS = 30_000;
const BATCH_SIZE = 3;
// Human-cadence pause between actions (30–75s). Deliberately slow.
const MIN_PAUSE_MS = 30_000;
const MAX_PAUSE_MS = 75_000;

export function isRunning() { return running; }
export function status() {
  return { running, processed, failed, remaining: currentBatch.length, lastError, lastFriction };
}

async function waitTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      err ? reject(err) : resolve();
    };
    const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && info.status === "complete") finish();
    };
    const timer = setTimeout(() => finish(new Error("tab load timeout")), timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function processItem(item: LiActionItem): Promise<void> {
  let tab: chrome.tabs.Tab | null = null;
  try {
    tab = await chrome.tabs.create({ url: item.targetUrl, active: false });
    if (!tab?.id) throw new Error("no tab id");
    await waitTabComplete(tab.id, PER_TAB_TIMEOUT_MS);
    // Let LinkedIn hydrate its React tree before we touch it.
    await new Promise((r) => setTimeout(r, 2000));

    const note = typeof item.payload?.message === "string" ? (item.payload.message as string) : null;
    let res: ExecResult;
    if (item.actionType === "connect_request") {
      res = await executeConnect(tab.id, note);
    } else if (item.actionType === "message" || item.actionType === "follow_up") {
      res = await executeMessage(tab.id, note || "");
    } else {
      res = { ok: false, error: `Unsupported action_type: ${item.actionType}` };
    }

    await reportActionResult(item.id, { ok: res.ok, error: res.error, result: res.detail });
    if (res.ok) {
      processed++;
    } else {
      failed++;
      lastError = res.error || "action failed";
    }

    // Friction → stop the whole worker so the user (and, later, the platform)
    // can react instead of hammering a checkpointed account.
    if (res.friction) {
      lastFriction = res.friction;
      running = false;
    }
  } catch (e: any) {
    const msg = e?.message || String(e);
    lastError = msg;
    failed++;
    await reportActionResult(item.id, { ok: false, error: msg });
  } finally {
    if (tab?.id != null) {
      try { await chrome.tabs.remove(tab.id); } catch {}
    }
  }
}

async function loop() {
  while (running) {
    if (currentBatch.length === 0) {
      const q = await fetchActionQueue(BATCH_SIZE);
      if (!q.ok) { lastError = q.error || "fetch failed"; running = false; break; }
      currentBatch = q.items || [];
      if (currentBatch.length === 0) { running = false; break; } // queue drained
    }
    const item = currentBatch.shift();
    if (!item) continue;
    await processItem(item);
    if (!running) break;
    // Human-cadence pause before the next action.
    if (currentBatch.length > 0 || running) {
      const pause = MIN_PAUSE_MS + Math.random() * (MAX_PAUSE_MS - MIN_PAUSE_MS);
      await new Promise((r) => setTimeout(r, pause));
    }
  }
}

export async function startActions(): Promise<{ ok: boolean; error?: string }> {
  if (running) return { ok: true };
  running = true; processed = 0; failed = 0; lastError = null; lastFriction = null; currentBatch = [];
  loop().catch((e) => { lastError = e?.message || String(e); running = false; });
  return { ok: true };
}

export function stopActions(): { ok: boolean } {
  running = false;
  return { ok: true };
}
