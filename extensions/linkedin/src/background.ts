/**
 * Background service worker.
 *
 * Acts as the single chokepoint for all Anker API calls so the bearer token
 * never leaks into content-script-land. Receives chrome.runtime messages from
 * the content scripts and popup, runs them through anker-client, replies.
 *
 * Message types:
 *   { type: "ingest", url, html, degree? }        -> ingest a profile
 *   { type: "draftByName", firstName, ... }       -> look up a drafted DM
 *   { type: "whoami" }                            -> verify configured token
 *   { type: "syncConnections", connections }      -> bulk-upsert people cards
 *   { type: "syncMutuals", personUrl, mutuals }   -> record mutual-connection edges
 *   { type: "context", urls }                     -> what Anker knows about profiles
 *   { type: "createDeal", ...profile }            -> add founder as sourced deal
 *   { type: "crawlStart" }                        -> begin polling the campaign crawl queue
 *   { type: "crawlStop"  }                        -> stop the crawl worker
 *   { type: "crawlStatus" }                       -> read current progress
 *   { type: "actionStart" }                       -> begin polling the outbound action queue (connect/message)
 *   { type: "actionStop"  }                       -> stop the action worker
 *   { type: "actionStatus" }                      -> read action-worker progress
 *   { type: "syncInbox" }                         -> scrape LinkedIn inbox → Anker Unibox
 *
 * Bulk capture is handled in the popup (it owns the tab orchestration),
 * not here.
 */
import { ingestProfile, draftByName, whoami, syncConnections, syncMutuals, getContext, createDealFromProfile, storage, KEYS } from "~lib/anker-client";
import { startCrawl, stopCrawl, status as crawlStatus } from "~lib/crawl-worker";
import { startActions, stopActions, status as actionStatus, onActionTick, ensureArmedIfRunning, ACTION_ALARM } from "~lib/action-worker";
import { syncInboxNow } from "~lib/inbox-sync";
import { syncInvitesNow } from "~lib/invites-sync";
import { refreshSelectors } from "~lib/selectors";

// The outbound worker runs one action per chrome.alarms tick (see action-worker).
// This listener is what wakes the (possibly terminated) service worker to do it.
chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === ACTION_ALARM) void onActionTick();
});

// Auto-resume the outbound action worker on browser startup / extension update
// when the user has opted in (Outreach tab → "Keep sending"). Only ever executes
// human-approved actions the server hands out, at a human cadence.
async function maybeAutoResume() {
  try {
    void refreshSelectors(); // keep the DOM selector map fresh
    // Re-arm a worker that was left running (preserves counters); alarms usually
    // persist on their own, but a reload can drop them.
    await ensureArmedIfRunning();
    // If the user opted into "keep sending" and it isn't running, cold-start it.
    const st = await actionStatus();
    if (!st.running && (await storage.get(KEYS.outreachAutoRun)) === "true") await startActions();
  } catch {}
}
chrome.runtime.onStartup?.addListener(() => { void maybeAutoResume(); });
chrome.runtime.onInstalled?.addListener(() => { void maybeAutoResume(); });

chrome.runtime.onMessage.addListener((msg: { type: string; [k: string]: any }, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "ingest") {
        sendResponse(await ingestProfile(msg.url, msg.html, msg.degree));
      } else if (msg.type === "draftByName") {
        sendResponse(await draftByName(msg));
      } else if (msg.type === "whoami") {
        sendResponse(await whoami());
      } else if (msg.type === "syncConnections") {
        const res = await syncConnections(msg.connections || []);
        if (res?.ok) await storage.set(KEYS.lastSyncAt, new Date().toISOString());
        sendResponse(res);
      } else if (msg.type === "syncMutuals") {
        sendResponse(await syncMutuals(msg.personUrl, msg.mutuals || []));
      } else if (msg.type === "context") {
        sendResponse(await getContext(msg.urls || []));
      } else if (msg.type === "createDeal") {
        sendResponse(await createDealFromProfile(msg));
      } else if (msg.type === "crawlStart") {
        sendResponse(await startCrawl());
      } else if (msg.type === "crawlStop") {
        sendResponse(stopCrawl());
      } else if (msg.type === "crawlStatus") {
        sendResponse(crawlStatus());
      } else if (msg.type === "actionStart") {
        sendResponse(await startActions());
      } else if (msg.type === "actionStop") {
        sendResponse(await stopActions());
      } else if (msg.type === "actionStatus") {
        sendResponse(await actionStatus());
      } else if (msg.type === "syncInbox") {
        sendResponse(await syncInboxNow());
      } else if (msg.type === "syncInvites") {
        sendResponse(await syncInvitesNow());
      } else {
        sendResponse({ error: `Unknown message type: ${msg.type}` });
      }
    } catch (e: any) {
      sendResponse({ error: e?.message || "Worker error" });
    }
  })();
  // Tell Chrome we'll respond async
  return true;
});
