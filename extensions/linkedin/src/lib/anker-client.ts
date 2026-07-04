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

export const DEFAULT_BASE = process.env.PLASMO_PUBLIC_ANKER_BASE_URL || "http://localhost:3000";

export async function getConfig(): Promise<{ baseUrl: string; token: string | null }> {
  const baseUrl = (await storage.get(KEYS.baseUrl)) || DEFAULT_BASE;
  const token = await storage.get(KEYS.token);
  return { baseUrl, token: token || null };
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
  return fetch(url, { ...init, headers });
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

export async function ingestProfile(url: string, html: string): Promise<IngestResult> {
  try {
    const r = await ankerFetch("/api/extension/ingest", {
      method: "POST",
      body: JSON.stringify({ url, html, source: "chrome-extension" }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `HTTP ${r.status}`, httpStatus: r.status };
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

// ── Connections ingest ─────────────────────────────────────────────────
//
// The content script on linkedin.com/mynetwork/.../connections/ scrapes
// every visible card and posts a batch here. Chunking is done in the
// content script (chunks of 50) so this call stays simple.

export interface ConnectionsIngestResult {
  ok?: boolean;
  inserted?: number;
  updated?: number;
  total?: number;
  error?: string;
}

export async function ingestConnections(connections: any[]): Promise<ConnectionsIngestResult> {
  try {
    const r = await ankerFetch("/api/extension/connections/ingest", {
      method: "POST",
      body: JSON.stringify({ connections }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: j.error || `HTTP ${r.status}` };
    return j;
  } catch (e: any) {
    return { error: e?.message || "Network error" };
  }
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
