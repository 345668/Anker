/**
 * Anker API client used by background SW + popup.
 *
 * Reads the base URL + bearer token from chrome.storage.local. The token is
 * minted from the Anker dashboard (POST /api/extension/tokens) and pasted
 * into the popup's Setup screen.
 */
import { Storage } from "@plasmohq/storage";

export const storage = new Storage({ area: "local" });

export const KEYS = {
  baseUrl: "ankerBaseUrl",
  token:   "ankerToken",
  bulkDelayMs: "ankerBulkDelayMs",
  lastCaptures: "ankerLastCaptures",
  lastSyncAt: "ankerLastSyncAt",
  // When true, the outbound action worker auto-resumes on browser startup so
  // approved outreach keeps flowing without re-opening the popup each launch.
  outreachAutoRun: "ankerOutreachAutoRun",
} as const;

export const DEFAULT_BASE = process.env.PLASMO_PUBLIC_ANKER_BASE_URL || "https://www.an-ker.de";

/**
 * Normalize whatever the user typed into a fetchable origin.
 *
 * Why so defensive: the CORS preflight dies on ANY redirect, and Vercel
 * 308-redirects both http->https and the apex an-ker.de -> www.an-ker.de
 * WITHOUT CORS headers — so "an-ker.de", "http://…", or a missing scheme
 * all surface as an opaque "Failed to fetch". Fix the URL before fetching
 * instead of asking users to type it perfectly.
 */
export function normalizeBaseUrl(raw: string | null | undefined): string {
  let s = String(raw || "").trim();
  if (!s) return DEFAULT_BASE;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  s = s.replace(/^http:\/\//i, "https://");
  s = s.replace(/\/+$/, "");
  // Apex domain redirects (308, no CORS headers) — go straight to www.
  s = s.replace(/^https:\/\/an-ker\.de/i, "https://www.an-ker.de");
  return s;
}

export async function getConfig(): Promise<{ baseUrl: string; token: string | null }> {
  const baseUrl = normalizeBaseUrl((await storage.get(KEYS.baseUrl)) || DEFAULT_BASE);
  const token = await storage.get(KEYS.token);
  return { baseUrl, token: (token || "").trim() || null };
}

async function ankerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { baseUrl, token } = await getConfig();
  if (!token) throw new Error("No Anker token set. Open the extension popup and paste your token in Setup.");
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };
  const url = baseUrl.replace(/\/$/, "") + path;
  try {
    return await fetch(url, { ...init, headers });
  } catch (e: any) {
    // Surface WHERE we tried to go — "Failed to fetch" alone is undebuggable.
    throw new Error(`${e?.message || "Failed to fetch"} (${url})`);
  }
}

export async function whoami(): Promise<{ ok: boolean; userId?: string; email?: string | null; error?: string }> {
  try {
    const r = await ankerFetch("/api/extension/whoami", { method: "GET" });
    if (!r.ok) {
      const txt = await r.text();
      return { ok: false, error: `HTTP ${r.status}: ${txt.slice(0, 200)}` };
    }
    const j = await r.json();
    return { ok: true, userId: j.userId, email: j.email };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

export interface IngestResult {
  ok: boolean;
  crmEntryId?: string;
  summary?: string | null;
  reason?: string;
  hint?: string;
  extracted?: { fullName?: string; title?: string; firm?: string; location?: string };
  error?: string;
  httpStatus?: number;
}

export async function ingestProfile(url: string, html: string, degree?: number): Promise<IngestResult> {
  try {
    const r = await ankerFetch("/api/extension/ingest", {
      method: "POST",
      body: JSON.stringify({ url, html, source: "chrome-extension", degree: degree ?? undefined }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}`, httpStatus: r.status };
    return j;
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

// ── Network graph capture ────────────────────────────────────────────────────

export interface ConnectionCard {
  url: string;
  name: string;
  headline?: string;
  company?: string;
  title?: string;
  location?: string;
  image?: string;
  degree?: number;
}

export interface SyncConnectionsResult {
  ok: boolean;
  inserted?: number;
  updated?: number;
  skipped?: number;
  received?: number;
  error?: string;
}

/** Bulk-upsert people cards scraped from the connections list / people search. */
export async function syncConnections(connections: ConnectionCard[]): Promise<SyncConnectionsResult> {
  try {
    const r = await ankerFetch("/api/extension/connections", {
      method: "POST",
      body: JSON.stringify({ connections }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return j;
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

/** Record "you and PERSON both know MUTUAL" edges from a profile page. */
export async function syncMutuals(
  personUrl: string,
  mutuals: Array<{ name: string; url?: string }>,
): Promise<{ ok: boolean; saved?: number; error?: string }> {
  try {
    const r = await ankerFetch("/api/extension/mutuals", {
      method: "POST",
      body: JSON.stringify({ personUrl, mutuals }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return j;
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

export interface DraftLookup {
  found: boolean;
  name?: string | null;
  crmEntryId?: string;
  campaignId?: string | null;
  subject?: string | null;
  body?: string | null;
  dm?: string | null;
  hint?: string;
  error?: string;
}

export async function draftByName(args: { firstName?: string; lastName?: string; linkedinUrl?: string; campaignId?: string | null }): Promise<DraftLookup> {
  const p = new URLSearchParams();
  if (args.firstName) p.set("firstName", args.firstName);
  if (args.lastName) p.set("lastName", args.lastName);
  if (args.linkedinUrl) p.set("linkedinUrl", args.linkedinUrl);
  if (args.campaignId) p.set("campaignId", args.campaignId);
  try {
    const r = await ankerFetch(`/api/extension/draft-by-name?${p.toString()}`, { method: "GET" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { found: false, error: j.error || `HTTP ${r.status}` };
    return j;
  } catch (e: any) {
    return { found: false, error: e?.message || "Network error" };
  }
}


// ── Intelligence back-feed ───────────────────────────────────────────────────

export interface UrlContext {
  known: "crm" | "network" | null;
  name: string | null;
  company: string | null;
  capturedAt: string | null;
  jobChange: { previousCompany: string | null; previousTitle: string | null; at: string } | null;
  introPaths: number;
  crm: { stage: string | null; score: number | null; tier: string | null } | null;
  outreach: { status: string | null; kind: string | null; sentAt: string | null; opens: number | null } | null;
  dealMatches: Array<{ id: string; company: string; stage: string }>;
}

/** What does Anker already know about these profiles? (max 25 per call) */
export async function getContext(urls: string[]): Promise<{ ok: boolean; contexts?: Record<string, UrlContext>; error?: string }> {
  try {
    const r = await ankerFetch(`/api/extension/context?urls=${encodeURIComponent(urls.slice(0, 25).join(","))}`, { method: "GET" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return j;
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

// ── Campaign crawl queue ─────────────────────────────────────────────────────
//
// The Anker campaign builder pushes T1 LinkedIn URLs into a server-side queue.
// The extension polls, opens each URL in a tab, captures HTML, ingests it via
// the existing /ingest endpoint, then marks the queue item done.

export interface CrawlQueueItem {
  id: string;
  campaignId: string;
  memberId: string;
  linkedinUrl: string;
}

export async function fetchCrawlQueue(limit = 5): Promise<{ ok: boolean; items?: CrawlQueueItem[]; error?: string }> {
  try {
    const r = await ankerFetch(`/api/extension/crawl-queue?limit=${limit}`, { method: "GET" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true, items: (j.items || []) as CrawlQueueItem[] };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

export async function completeCrawlItem(
  id: string,
  opts: { ok: boolean; error?: string; crmEntryId?: string | null } = { ok: true },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await ankerFetch(`/api/extension/crawl-queue/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      body: JSON.stringify(opts),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

// ── Outbound action queue (LinkedIn outreach automation) ─────────────────────
//
// The platform queues APPROVED outbound actions (connect / message). The
// extension polls, executes each on LinkedIn in the user's own browser, then
// reports the result. Only human-approved ('queued') actions are ever handed
// out — the approval gate lives server-side.

export type LiActionType = "connect_request" | "message" | "follow_up" | "view_profile" | "withdraw";

export interface LiActionItem {
  id: string;
  actionType: LiActionType;
  targetUrl: string;
  targetName: string | null;
  senderId: string | null;
  payload: { message?: string; [k: string]: unknown };
}

export async function fetchActionQueue(limit = 5): Promise<{ ok: boolean; items?: LiActionItem[]; error?: string }> {
  try {
    const r = await ankerFetch(`/api/extension/li-actions?limit=${limit}`, { method: "GET" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true, items: (j.items || []) as LiActionItem[] };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

export async function reportActionResult(
  id: string,
  outcome: { ok: boolean; error?: string; result?: Record<string, unknown> },
): Promise<{ ok: boolean; status?: string; error?: string }> {
  try {
    const r = await ankerFetch(`/api/extension/li-actions/${encodeURIComponent(id)}/report`, {
      method: "POST",
      body: JSON.stringify(outcome),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true, status: j.status };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

// ── Unibox sync ──────────────────────────────────────────────────────────────

export interface InboxThread {
  threadUrn?: string | null;
  participantUrl?: string | null;
  participantName?: string | null;
  unread?: boolean;
  lastMessageAt?: string | null;
  lastMessageText?: string | null;
  lastDirection?: "inbound" | "outbound" | null;
  messages?: Array<{ direction: "inbound" | "outbound"; body: string; sentAt?: string | null; externalId?: string | null }>;
}

/** Post scraped LinkedIn conversations to Anker's Unibox. */
export async function syncInbox(threads: InboxThread[]): Promise<{ ok: boolean; conversations?: number; repliesDetected?: number; error?: string }> {
  try {
    const r = await ankerFetch("/api/extension/li-inbox", { method: "POST", body: JSON.stringify({ threads }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true, conversations: j.conversations, repliesDetected: j.repliesDetected };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

// ── Remote selector config + invite (acceptance) sync ────────────────────────

/** Fetch the server-served LinkedIn selector map (cached by the caller). */
export async function fetchSelectors(): Promise<{ ok: boolean; selectors?: any; error?: string }> {
  try {
    const r = await ankerFetch("/api/extension/selectors", { method: "GET" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true, selectors: j.selectors };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

/** Report the still-pending sent-invitation URLs; server infers acceptances by absence. */
export async function syncInvites(pending: string[]): Promise<{ ok: boolean; marked?: number; error?: string }> {
  try {
    const r = await ankerFetch("/api/extension/li-invites", { method: "POST", body: JSON.stringify({ pending }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true, marked: j.marked };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

/** "Add as deal": create a sourced deal on the flagship fund from a profile. */
export async function createDealFromProfile(p: {
  url: string; name: string; company?: string; headline?: string;
  title?: string; location?: string; roundName?: string; notes?: string;
}): Promise<{ ok: boolean; dealId?: string; companyName?: string; error?: string }> {
  try {
    const r = await ankerFetch("/api/extension/deal", { method: "POST", body: JSON.stringify(p) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return j;
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}
