/**
 * Sent-invitations sync (connection-acceptance detection).
 *
 * Opens LinkedIn's "Sent invitations" page, scrapes the profile URLs of invites
 * still PENDING, and reports them. The server infers acceptances by absence: a
 * member we sent a connect to who is no longer pending has accepted — which
 * unlocks 'if_accepted' sequence steps and the funnel's "accepted" metric.
 *
 * Best-effort DOM (tunable via the remote selector map); everything downstream
 * (ingest, if_accepted, analytics) is stable regardless.
 */
import { syncInvites } from "./anker-client";
import { getSelectors } from "./selectors";

const SENT_URL = "https://www.linkedin.com/mynetwork/invitation-manager/sent/";
const TAB_TIMEOUT_MS = 30_000;

function waitTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true; clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener);
      err ? reject(err) : resolve();
    };
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => { if (id === tabId && info.status === "complete") finish(); };
    const timer = setTimeout(() => finish(new Error("tab load timeout")), timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/** Injected: collect pending-invite profile URLs. Uses passed selectors w/ fallback. */
function scrapePending(sel: { listItem: string; profileLink: string }): string[] {
  const urls = new Set<string>();
  const items = Array.from(document.querySelectorAll<HTMLElement>(sel.listItem));
  const scope = items.length ? items : [document.body];
  for (const root of scope) {
    for (const a of Array.from(root.querySelectorAll<HTMLAnchorElement>(sel.profileLink))) {
      const href = a.getAttribute("href") || "";
      const m = href.match(/\/in\/[^/?#]+/);
      if (m) urls.add("https://www.linkedin.com" + m[0]);
    }
  }
  return Array.from(urls);
}

export async function syncInvitesNow(): Promise<{ ok: boolean; marked?: number; pending?: number; error?: string }> {
  let tab: chrome.tabs.Tab | null = null;
  try {
    const map = await getSelectors().catch(() => null);
    const sel = {
      listItem: map?.invites?.listItem || "li.invitation-card, .mn-invitation-list li, [componentkey*='invitation']",
      profileLink: map?.invites?.profileLink || "a[href*='/in/']",
    };

    tab = await chrome.tabs.create({ url: SENT_URL, active: false });
    if (!tab?.id) throw new Error("no tab id");
    await waitTabComplete(tab.id, TAB_TIMEOUT_MS);
    await new Promise((r) => setTimeout(r, 2500)); // let the list hydrate

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, world: "ISOLATED", func: scrapePending, args: [sel],
    });
    const pending = (result as string[]) || [];
    const res = await syncInvites(pending); // empty array is meaningful (all accepted)
    return { ok: res.ok, marked: res.marked, pending: pending.length, error: res.error };
  } catch (e: any) {
    return { ok: false, error: e?.message || "invites sync failed" };
  } finally {
    if (tab?.id != null) { try { await chrome.tabs.remove(tab.id); } catch {} }
  }
}
