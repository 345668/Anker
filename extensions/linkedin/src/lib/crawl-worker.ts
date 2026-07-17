/**
 * Campaign crawl worker.
 *
 * Called from the background service worker when the user clicks "Start
 * campaign crawl" in the popup. The worker polls the Anker crawl queue,
 * opens each LinkedIn URL in a hidden tab, captures full DOM, ingests it,
 * marks the queue item done, closes the tab, then moves on.
 *
 * We keep tabs single-file (one at a time) so LinkedIn doesn't rate-limit
 * this account and the user's normal browsing isn't disrupted.
 */
import { fetchCrawlQueue, completeCrawlItem, ingestProfile, type CrawlQueueItem } from "./anker-client";

let running = false;
let currentBatch: CrawlQueueItem[] = [];
let processed = 0;
let failed = 0;
let lastError: string | null = null;

const PER_TAB_TIMEOUT_MS = 30_000;
const PER_TAB_PAUSE_MS   = 3_500;  // gentle jitter between LinkedIn navigations
const BATCH_SIZE         = 5;

export function isRunning() { return running; }
export function status() {
  return { running, processed, failed, remaining: currentBatch.length, lastError };
}

async function waitTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && info.status === "complete") {
        finish();
      }
    };
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("tab load timeout"));
    }, timeoutMs);
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function grabHtml(tabId: number): Promise<string> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => document.documentElement.outerHTML,
  });
  const html = results[0]?.result;
  if (typeof html !== "string" || !html.length) throw new Error("empty html");
  return html;
}

async function processItem(item: CrawlQueueItem): Promise<void> {
  let tab: chrome.tabs.Tab | null = null;
  try {
    tab = await chrome.tabs.create({ url: item.linkedinUrl, active: false });
    if (!tab?.id) throw new Error("no tab id");
    await waitTabComplete(tab.id, PER_TAB_TIMEOUT_MS);
    // Give LinkedIn a moment to hydrate its React tree.
    await new Promise((r) => setTimeout(r, 1500));
    const html = await grabHtml(tab.id);
    const ingest = await ingestProfile(item.linkedinUrl, html);
    await completeCrawlItem(item.id, {
      ok: true,
      crmEntryId: ingest?.crmEntryId ?? null,
    });
    processed++;
  } catch (e: any) {
    const msg = e?.message || String(e);
    lastError = msg;
    await completeCrawlItem(item.id, { ok: false, error: msg });
    failed++;
  } finally {
    if (tab?.id != null) {
      try { await chrome.tabs.remove(tab.id); } catch {}
    }
    await new Promise((r) => setTimeout(r, PER_TAB_PAUSE_MS));
  }
}

async function loop() {
  while (running) {
    if (currentBatch.length === 0) {
      const q = await fetchCrawlQueue(BATCH_SIZE);
      if (!q.ok) {
        lastError = q.error || "fetch failed";
        running = false;
        break;
      }
      currentBatch = q.items || [];
      if (currentBatch.length === 0) {
        running = false;   // queue drained
        break;
      }
    }
    const item = currentBatch.shift();
    if (!item) continue;
    await processItem(item);
    if (!running) break;
  }
}

export async function startCrawl(): Promise<{ ok: boolean; error?: string }> {
  if (running) return { ok: true };
  running = true; processed = 0; failed = 0; lastError = null; currentBatch = [];
  loop().catch((e) => {
    lastError = e?.message || String(e);
    running = false;
  });
  return { ok: true };
}

export function stopCrawl(): { ok: boolean } {
  running = false;
  return { ok: true };
}
