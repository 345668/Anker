/**
 * Remote selector cache.
 *
 * Pulls the LinkedIn DOM selector map from Anker (GET /api/extension/selectors)
 * and caches it in chrome.storage, so LinkedIn DOM changes are fixed by a server
 * edit rather than a Web Store re-publish. Executors/scrapers call getSelectors()
 * and fall back to their own inline defaults if the map isn't available yet.
 */
import { Storage } from "@plasmohq/storage";
import { fetchSelectors } from "./anker-client";

const storage = new Storage({ area: "local" });
const KEY = "ankerSelectors";
const TS_KEY = "ankerSelectorsAt";
const TTL_MS = 6 * 60 * 60 * 1000; // refresh at most every 6h

/** Return the cached selector map (any shape), refreshing in the background if stale. */
export async function getSelectors(): Promise<any | null> {
  let map: any = null;
  try { map = await storage.get(KEY); } catch {}
  const at = Number((await storage.get(TS_KEY).catch(() => 0)) || 0);
  if (!map || Date.now() - at > TTL_MS) {
    // Refresh (await when we have nothing cached; otherwise fire-and-forget).
    if (!map) { await refreshSelectors(); try { map = await storage.get(KEY); } catch {} }
    else { void refreshSelectors(); }
  }
  return map || null;
}

/** Force a refresh from the server. Safe to call on worker start. */
export async function refreshSelectors(): Promise<boolean> {
  const r = await fetchSelectors();
  if (r.ok && r.selectors) {
    try {
      await storage.set(KEY, r.selectors);
      await storage.set(TS_KEY, String(Date.now()));
    } catch {}
    return true;
  }
  return false;
}
