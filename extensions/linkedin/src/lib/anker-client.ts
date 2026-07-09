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
