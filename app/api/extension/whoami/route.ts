/**
 * GET /api/extension/whoami
 *
 * The extension's setup screen calls this to verify the pasted token works.
 * Returns the authenticated user's id + email. Bearer-token authed.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth";

export const runtime = "nodejs";

export async function OPTIONS() { return corsOptionsResponse(); }

export async function GET(req: NextRequest) {
  const auth = await authenticateExtension(req);
  if (!auth.ok) return auth.response;
  // Pull email from auth.users via Supabase admin
  const rows = await sql`
    select id, email, raw_user_meta_data->>'full_name' as full_name
    from auth.users where id = ${auth.userId} limit 1
  ` as Array<{ id: string; email: string; full_name: string | null }>;
  const u = rows[0];
  return NextResponse.json({
    userId: auth.userId,
    tokenId: auth.tokenId,
    email: u?.email ?? null,
    fullName: u?.full_name ?? null,
  }, { headers: corsHeaders() });
}
