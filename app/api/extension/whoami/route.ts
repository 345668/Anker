/**
 * GET /api/extension/whoami
 *
 * The extension's setup screen calls this to verify the pasted token works.
 * Returns the authenticated user's id + (best-effort) email/name. Bearer-token
 * authed — a valid token is proof of identity on its own.
 *
 * Note: the app's data DB (Neon) is separate from Supabase Auth, so `auth.users`
 * is NOT reachable here. We resolve the email best-effort from the Neon-resident
 * `profiles` / `users` tables and fall back to null. The email is decorative —
 * this endpoint must never 500 on a valid token, or "Test connection" breaks.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth";

export const runtime = "nodejs";

export async function OPTIONS() { return corsOptionsResponse(); }

async function lookupIdentity(userId: string): Promise<{ email: string | null; fullName: string | null }> {
  // Try profiles first (id, email, full_name), then users (id, email, names).
  try {
    const p = (await sql`
      select email, full_name from profiles where id = ${userId} limit 1
    `) as Array<{ email: string | null; full_name: string | null }>;
    if (p[0]?.email || p[0]?.full_name) {
      return { email: p[0].email ?? null, fullName: p[0].full_name ?? null };
    }
  } catch {
    /* profiles may not exist in some environments — ignore */
  }
  try {
    const u = (await sql`
      select email, first_name, last_name from users where id = ${userId} limit 1
    `) as Array<{ email: string | null; first_name: string | null; last_name: string | null }>;
    if (u[0]) {
      const name = [u[0].first_name, u[0].last_name].filter(Boolean).join(" ").trim();
      return { email: u[0].email ?? null, fullName: name || null };
    }
  } catch {
    /* users table may differ — ignore */
  }
  return { email: null, fullName: null };
}

export async function GET(req: NextRequest) {
  const auth = await authenticateExtension(req);
  if (!auth.ok) return auth.response;

  const { email, fullName } = await lookupIdentity(auth.userId);

  return NextResponse.json(
    {
      ok: true,
      userId: auth.userId,
      tokenId: auth.tokenId,
      email,
      fullName,
    },
    { headers: corsHeaders() },
  );
}
