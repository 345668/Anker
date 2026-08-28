/**
 * Unibox sync.
 *
 * Opens the LinkedIn messaging inbox in a background tab, scrapes the visible
 * conversation list (participant, snippet, unread, direction), posts it to
 * Anker's Unibox, and closes the tab. One-shot — triggered from the popup.
 *
 * Like the action executor, the scraper is best-effort against LinkedIn's DOM
 * and is the piece most likely to need tuning; everything downstream (ingest,
 * reply-stop, Unibox UI) is stable regardless.
 */
import { syncInbox, type InboxThread } from "./anker-client";

const MESSAGING_URL = "https://www.linkedin.com/messaging/";
const TAB_TIMEOUT_MS = 30_000;

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
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === "complete") finish();
    };
    const timer = setTimeout(() => finish(new Error("tab load timeout")), timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/** Injected: scrape the conversation list into InboxThread[]. Runs in-page. */
function scrapeInbox(): InboxThread[] {
  const threads: InboxThread[] = [];
  const items = Array.from(document.querySelectorAll<HTMLElement>("li.msg-conversation-listitem, .msg-conversations-container__convo-item"));
  for (const li of items) {
    try {
      const link = li.querySelector<HTMLAnchorElement>("a.msg-conversation-listitem__link, a[href*='/messaging/thread/']");
      const href = link?.getAttribute("href") || "";
      const threadUrn = (href.match(/thread\/([^/?#]+)/)?.[1]) || href || null;
      const nameEl = li.querySelector<HTMLElement>(".msg-conversation-listitem__participant-names, .msg-conversation-card__participant-names");
      const participantName = nameEl?.innerText?.trim() || null;
      const snippetEl = li.querySelector<HTMLElement>(".msg-conversation-card__message-snippet, .msg-conversation-listitem__message-snippet-body");
      const snippet = snippetEl?.innerText?.trim() || null;
      const timeEl = li.querySelector<HTMLElement>("time, .msg-conversation-listitem__time-stamp");
      const unread = !!li.querySelector(".notification-badge--show, .msg-conversation-card__unread-count, [class*='unread']");
      // Direction: LinkedIn prefixes the snippet with "You: " when you wrote last.
      const lastDirection: "inbound" | "outbound" | null = snippet
        ? /^you:\s/i.test(snippet) ? "outbound" : "inbound"
        : null;
      if (!threadUrn && !participantName) continue;
      threads.push({
        threadUrn,
        participantName,
        participantUrl: null, // list view rarely exposes the /in/ URL; matched server-side by name→member later if needed
        lastMessageText: snippet ? snippet.replace(/^you:\s/i, "") : null,
        lastMessageAt: timeEl?.getAttribute("datetime") || null,
        lastDirection,
        unread,
      });
    } catch {
      // skip malformed rows
    }
  }
  return threads;
}

export async function syncInboxNow(): Promise<{ ok: boolean; conversations?: number; repliesDetected?: number; error?: string }> {
  let tab: chrome.tabs.Tab | null = null;
  try {
    tab = await chrome.tabs.create({ url: MESSAGING_URL, active: false });
    if (!tab?.id) throw new Error("no tab id");
    await waitTabComplete(tab.id, TAB_TIMEOUT_MS);
    // Let the conversation list hydrate.
    await new Promise((r) => setTimeout(r, 2500));
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "ISOLATED",
      func: scrapeInbox,
    });
    const threads = (result as InboxThread[]) || [];
    if (!threads.length) return { ok: true, conversations: 0 };
    return await syncInbox(threads);
  } catch (e: any) {
    return { ok: false, error: e?.message || "inbox sync failed" };
  } finally {
    if (tab?.id != null) { try { await chrome.tabs.remove(tab.id); } catch {} }
  }
}
