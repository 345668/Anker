/**
 * Unibox sync.
 *
 * Scrapes the LinkedIn messaging inbox and posts it to Anker's Unibox. Two
 * passes: (1) the conversation LIST (participant, snippet, unread, direction),
 * then (2) DEEP sync — opens the top N threads and captures their message
 * history. Selectors come from the remote map (getSelectors) with inline
 * fallback. Best-effort DOM; everything downstream is stable regardless.
 *
 * Deep-message direction is best-effort (LinkedIn doesn't cleanly mark "you" in
 * the thread DOM); the list-snippet direction remains authoritative for the
 * server's reply-stop.
 */
import { syncInbox, type InboxThread } from "./anker-client";
import { getSelectors } from "./selectors";

const MESSAGING_URL = "https://www.linkedin.com/messaging/";
const TAB_TIMEOUT_MS = 30_000;
const DEEP_THREADS = 6; // cap how many threads we open for full history

type InboxSel = { listItem: string; threadLink: string; participantName: string; snippet: string; time: string; unread: string };
type ThreadSel = { threadMessage: string; threadBody: string; threadSender: string; threadTime: string };

const INBOX_FALLBACK: InboxSel = {
  listItem: "li.msg-conversation-listitem, .msg-conversations-container__convo-item",
  threadLink: "a.msg-conversation-listitem__link, a[href*='/messaging/thread/']",
  participantName: ".msg-conversation-listitem__participant-names, .msg-conversation-card__participant-names",
  snippet: ".msg-conversation-card__message-snippet, .msg-conversation-listitem__message-snippet-body",
  time: "time, .msg-conversation-listitem__time-stamp",
  unread: ".notification-badge--show, .msg-conversation-card__unread-count, [class*='unread']",
};
const THREAD_FALLBACK: ThreadSel = {
  threadMessage: ".msg-s-event-listitem, li.msg-s-message-list__event",
  threadBody: ".msg-s-event-listitem__body, .msg-s-event__content",
  threadSender: ".msg-s-message-group__name, .msg-s-event-listitem__name",
  threadTime: "time, .msg-s-message-group__timestamp",
};

function waitTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err?: Error) => { if (done) return; done = true; clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); err ? reject(err) : resolve(); };
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => { if (id === tabId && info.status === "complete") finish(); };
    const timer = setTimeout(() => finish(new Error("tab load timeout")), timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/** Injected: scrape the conversation list. */
function scrapeInbox(sel: InboxSel): InboxThread[] {
  const threads: InboxThread[] = [];
  for (const li of Array.from(document.querySelectorAll<HTMLElement>(sel.listItem))) {
    try {
      const link = li.querySelector<HTMLAnchorElement>(sel.threadLink);
      const href = link?.getAttribute("href") || "";
      const threadUrn = (href.match(/thread\/([^/?#]+)/)?.[1]) || href || null;
      const participantName = li.querySelector<HTMLElement>(sel.participantName)?.innerText?.trim() || null;
      const snippet = li.querySelector<HTMLElement>(sel.snippet)?.innerText?.trim() || null;
      const timeEl = li.querySelector<HTMLElement>(sel.time);
      const unread = !!li.querySelector(sel.unread);
      const lastDirection: "inbound" | "outbound" | null = snippet ? (/^you:\s/i.test(snippet) ? "outbound" : "inbound") : null;
      if (!threadUrn && !participantName) continue;
      threads.push({
        threadUrn, participantName, participantUrl: null,
        lastMessageText: snippet ? snippet.replace(/^you:\s/i, "") : null,
        lastMessageAt: timeEl?.getAttribute("datetime") || null, lastDirection, unread,
      });
    } catch { /* skip */ }
  }
  return threads;
}

/** Injected: scrape an open thread's messages (best-effort direction). */
function scrapeThread(sel: ThreadSel, urn: string): InboxThread["messages"] {
  const out: NonNullable<InboxThread["messages"]> = [];
  const bubbles = Array.from(document.querySelectorAll<HTMLElement>(sel.threadMessage));
  let i = 0;
  for (const b of bubbles) {
    const body = b.querySelector<HTMLElement>(sel.threadBody)?.innerText?.trim();
    if (!body) continue;
    // Best-effort direction: LinkedIn tends to tag your own bubbles; fall back to inbound.
    const cls = b.className || "";
    const direction: "inbound" | "outbound" = /--self|--outgoing|msg-s-event-listitem--sending/i.test(cls) ? "outbound" : "inbound";
    const sentAt = b.querySelector<HTMLElement>(sel.threadTime)?.getAttribute("datetime") || null;
    out.push({ direction, body, sentAt, externalId: `${urn}:${i++}` });
  }
  return out;
}

export async function syncInboxNow(): Promise<{ ok: boolean; conversations?: number; repliesDetected?: number; error?: string }> {
  let tab: chrome.tabs.Tab | null = null;
  try {
    const map = await getSelectors().catch(() => null);
    const inboxSel: InboxSel = { ...INBOX_FALLBACK, ...(map?.inbox || {}) };
    const threadSel: ThreadSel = { ...THREAD_FALLBACK, ...(map?.inbox || {}) };

    tab = await chrome.tabs.create({ url: MESSAGING_URL, active: false });
    if (!tab?.id) throw new Error("no tab id");
    await waitTabComplete(tab.id, TAB_TIMEOUT_MS);
    await new Promise((r) => setTimeout(r, 2500));

    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "ISOLATED", func: scrapeInbox, args: [inboxSel] });
    const threads = (result as InboxThread[]) || [];
    if (!threads.length) { return { ok: true, conversations: 0 }; }

    // Deep pass: open the top N threads (in the same tab) and capture history.
    const withUrn = threads.filter((t) => t.threadUrn).slice(0, DEEP_THREADS);
    for (const t of withUrn) {
      try {
        await chrome.tabs.update(tab.id, { url: `https://www.linkedin.com/messaging/thread/${t.threadUrn}/` });
        await waitTabComplete(tab.id, TAB_TIMEOUT_MS);
        await new Promise((r) => setTimeout(r, 1800));
        const [{ result: msgs }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "ISOLATED", func: scrapeThread, args: [threadSel, String(t.threadUrn)] });
        if (Array.isArray(msgs) && msgs.length) t.messages = msgs;
      } catch { /* skip this thread */ }
    }

    return await syncInbox(threads);
  } catch (e: any) {
    return { ok: false, error: e?.message || "inbox sync failed" };
  } finally {
    if (tab?.id != null) { try { await chrome.tabs.remove(tab.id); } catch {} }
  }
}
