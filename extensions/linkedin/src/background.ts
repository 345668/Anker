/**
 * Background service worker.
 *
 * Acts as the single chokepoint for all Anker API calls so the bearer token
 * never leaks into content-script-land. Receives chrome.runtime messages from
 * the content scripts and popup, runs them through anker-client, replies.
 *
 * Message types:
 *   { type: "ingest", url, html }                 -> ingest a profile
 *   { type: "draftByName", firstName, ... }       -> look up a drafted DM
 *   { type: "whoami" }                            -> verify configured token
 *
 * Bulk capture is handled in the popup (it owns the tab orchestration),
 * not here.
 */
import { ingestProfile, draftByName, whoami } from "~lib/anker-client";

chrome.runtime.onMessage.addListener((msg: { type: string; [k: string]: any }, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "ingest") {
        sendResponse(await ingestProfile(msg.url, msg.html));
      } else if (msg.type === "draftByName") {
        sendResponse(await draftByName(msg));
      } else if (msg.type === "whoami") {
        sendResponse(await whoami());
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
