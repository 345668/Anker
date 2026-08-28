/**
 * Outbound action worker — MV3-safe (alarm-driven).
 *
 * The counterpart to the crawl worker, for the LinkedIn outreach engine. It runs
 * APPROVED actions (the server only hands out human-approved 'queued' rows) one
 * at a time, at a human cadence, opening the target profile in a hidden tab and
 * executing the connect/message.
 *
 * WHY ALARMS (not a setTimeout loop): MV3 terminates idle service workers after
 * ~30s, which would kill a paced `while(running){ …sleep 30–90s… }` loop mid-run.
 * Instead we process ONE action per `chrome.alarms` tick and schedule the next
 * tick with jitter. Alarms survive service-worker death and browser restarts, so
 * the worker keeps going without anything holding the SW alive. All state lives
 * in chrome.storage (not module memory, which is wiped on every SW restart).
 */
import { fetchActionQueue, reportActionResult, type LiActionItem } from "./anker-client";
import { executeConnect, executeMessage, type ExecResult } from "./action-executor";

export const ACTION_ALARM = "anker-action-tick";
const STATE_KEY = "ankerActionState";

// Human-cadence gap between actions, in MINUTES (chrome.alarms granularity).
// 0.6–1.5 min = 36–90s. Kept ≥0.5 so Chrome doesn't clamp/ignore it in prod.
const MIN_GAP_MIN = 0.6;
const MAX_GAP_MIN = 1.5;
const FIRST_GAP_MIN = 0.5; // first action ~30s after Start
const PER_TAB_TIMEOUT_MS = 30_000;

export interface WorkerState {
  running: boolean;
  processed: number;
  failed: number;
  lastError: string | null;
  lastFriction: string | null;
  startedAt: number | null;
  lastActionAt: number | null;
}

const DEFAULT_STATE: WorkerState = {
  running: false, processed: 0, failed: 0, lastError: null, lastFriction: null, startedAt: null, lastActionAt: null,
};

async function getState(): Promise<WorkerState> {
  try {
    const o = await chrome.storage.local.get(STATE_KEY);
    return { ...DEFAULT_STATE, ...(o?.[STATE_KEY] || {}) };
  } catch { return { ...DEFAULT_STATE }; }
}
async function setState(patch: Partial<WorkerState>): Promise<WorkerState> {
  const next = { ...(await getState()), ...patch };
  try { await chrome.storage.local.set({ [STATE_KEY]: next }); } catch {}
  return next;
}

const jitterMin = () => MIN_GAP_MIN + Math.random() * (MAX_GAP_MIN - MIN_GAP_MIN);
function scheduleNext(delayInMinutes: number) {
  // Same alarm name = replace, so there is never more than one pending tick.
  chrome.alarms.create(ACTION_ALARM, { delayInMinutes });
}

// ── Public control (called from the popup via background messages) ─────────────

export async function startActions(): Promise<{ ok: boolean }> {
  await setState({ running: true, processed: 0, failed: 0, lastError: null, lastFriction: null, startedAt: Date.now() });
  scheduleNext(FIRST_GAP_MIN);
  return { ok: true };
}

export async function stopActions(): Promise<{ ok: boolean }> {
  await setState({ running: false });
  try { await chrome.alarms.clear(ACTION_ALARM); } catch {}
  return { ok: true };
}

export async function status(): Promise<WorkerState & { remaining: number }> {
  // `remaining` kept for popup compatibility; one-at-a-time model has no batch.
  return { ...(await getState()), remaining: 0 };
}

/** Re-arm the alarm on SW startup if we were left running (belt-and-suspenders —
 *  alarms usually persist on their own, but a reload can drop them). */
export async function ensureArmedIfRunning(): Promise<void> {
  const st = await getState();
  if (!st.running) return;
  try {
    const existing = await chrome.alarms.get(ACTION_ALARM);
    if (!existing) scheduleNext(jitterMin());
  } catch { scheduleNext(jitterMin()); }
}

// ── The tick (called from chrome.alarms.onAlarm in background) ─────────────────

let ticking = false; // in-SW re-entrancy guard (single event loop, but be safe)

export async function onActionTick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const st = await getState();
    if (!st.running) { try { await chrome.alarms.clear(ACTION_ALARM); } catch {} return; }

    // Claim exactly one approved action.
    const q = await fetchActionQueue(1);
    if (!q.ok) { await setState({ lastError: q.error || "fetch failed" }); scheduleNext(jitterMin()); return; }
    const item = q.items?.[0];
    if (!item) { await setState({ running: false }); try { await chrome.alarms.clear(ACTION_ALARM); } catch {} return; } // queue drained

    const res = await processItem(item);

    const patch: Partial<WorkerState> = { lastActionAt: Date.now() };
    if (res.ok) patch.processed = st.processed + 1;
    else { patch.failed = st.failed + 1; patch.lastError = res.error || "action failed"; }
    if (res.friction) { patch.lastFriction = res.friction; patch.running = false; } // stop on LinkedIn friction
    const next = await setState(patch);

    if (next.running) scheduleNext(jitterMin());
    else { try { await chrome.alarms.clear(ACTION_ALARM); } catch {} }
  } finally {
    ticking = false;
  }
}

// ── One action ────────────────────────────────────────────────────────────────

function waitTabComplete(tabId: number, timeoutMs: number): Promise<void> {
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

async function processItem(item: LiActionItem): Promise<ExecResult> {
  let tab: chrome.tabs.Tab | null = null;
  try {
    tab = await chrome.tabs.create({ url: item.targetUrl, active: false });
    if (!tab?.id) throw new Error("no tab id");
    await waitTabComplete(tab.id, PER_TAB_TIMEOUT_MS);
    await new Promise((r) => setTimeout(r, 2000)); // let LinkedIn hydrate

    const note = typeof item.payload?.message === "string" ? (item.payload.message as string) : null;
    let res: ExecResult;
    if (item.actionType === "connect_request") res = await executeConnect(tab.id, note);
    else if (item.actionType === "message" || item.actionType === "follow_up") res = await executeMessage(tab.id, note || "");
    else res = { ok: false, error: `Unsupported action_type: ${item.actionType}` };

    await reportActionResult(item.id, { ok: res.ok, error: res.error, result: res.detail });
    return res;
  } catch (e: any) {
    const msg = e?.message || String(e);
    await reportActionResult(item.id, { ok: false, error: msg });
    return { ok: false, error: msg };
  } finally {
    if (tab?.id != null) { try { await chrome.tabs.remove(tab.id); } catch {} }
  }
}
