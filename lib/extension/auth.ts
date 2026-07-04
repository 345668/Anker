/**
 * Bearer-token auth for the Anker LinkedIn extension.
 *
 * The extension stores a plaintext token in chrome.storage.local and sends it
 * on every request as `Authorization: Bearer ank_<base64url>`. The server hashes
 * the token and looks it up in `extension_tokens`. Successful lookups update
 * `last_used_at`.
 *
 * Use:
 *   const auth = await authenticateExtension(req);
 *   if (!auth.ok) return auth.response;
 *   const userId = auth.userId;
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { createHash, randomBytes } from "node:crypto";

export const TOKEN_PREFIX = "ank_";

export function mintToken(): { plaintext: string; hash: string; prefix: string } {
  // ank_ + 32 random bytes -> base64url -> 43 chars
  const raw = randomBytes(32).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const plaintext = TOKEN_PREFIX + raw;
  const hash = createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, hash, prefix: plaintext.slice(0, 12) };
}

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export interface ExtensionAuthOk { ok: true; userId: string; tokenId: string; }
export interface ExtensionAuthErr { ok: false; response: NextResponse; }
export type ExtensionAuthResult = ExtensionAuthOk | ExtensionAuthErr;

export async function authenticateExtension(req: NextRequest): Promise<ExtensionAuthResult> {
  const hdr = req.headers.get("authorization") || "";
  const m = hdr.match(/^Bearer\s+(\S+)$/i);
  if (!m) {
    return { ok: false, response: NextResponse.json({ error: "Missing Bearer token" }, { status: 401, headers: corsHeaders() }) };
  }
  const plaintext = m[1];
  if (!plaintext.startsWith(TOKEN_PREFIX)) {
    return { ok: false, response: NextResponse.json({ error: "Invalid token format" }, { status: 401, headers: corsHeaders() }) };
  }
  const hash = hashToken(plaintext);
  const rows = await sql`
    select id, user_id from extension_tokens
    where token_hash = ${hash} and revoked_at is null
    limit 1
  ` as Array<{ id: string; user_id: string }>;
  if (!rows.length) {
    return { ok: false, response: NextResponse.json({ error: "Unknown or revoked token" }, { status: 401, headers: corsHeaders() }) };
  }
  // Update last_used_at (fire and forget — don't block the request)
  sql`update extension_tokens set last_used_at = now() where id = ${rows[0].id}`.catch(() => {});
  return { ok: true, userId: rows[0].user_id, tokenId: rows[0].id };
}

/** CORS headers for chrome-extension:// origins. Tokens make wide-open OK. */
export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function corsOptionsResponse(): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
