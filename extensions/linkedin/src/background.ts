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
 *
 * Bulk capture is handled in the popup (it owns the tab orchestration),
 * not here.
 */
import { ingestProfile, draftByName, whoami, syncConnections, syncMutuals } from "~lib/anker-client";

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
        sendResponse(await syncConnections(msg.connections || []));
      } else if (msg.type === "syncMutuals") {
        sendResponse(await syncMutuals(msg.personUrl, msg.mutuals || []));
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
