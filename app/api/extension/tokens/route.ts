/**
 * POST /api/extension/tokens   - mint a new extension token (returns plaintext ONCE)
 * GET  /api/extension/tokens   - list this user's active tokens (no plaintext)
 *
 * Cookie-auth: must be a signed-in Anker dashboard user.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { mintToken } from "@/lib/extension/auth";

export const runtime = "nodejs";

async function getUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return data.user.id;
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { label?: string } = {};
  try { body = await req.json(); } catch {}
  const label = (body.label || "").toString().slice(0, 64).trim() || "Extension";
  const { plaintext, hash, prefix } = mintToken();
  const rows = await sql`
    insert into extension_tokens (user_id, token_hash, prefix, label)
    values (${userId}, ${hash}, ${prefix}, ${label})
    returning id, created_at
  ` as Array<{ id: string; created_at: Date }>;
  return NextResponse.json({
    id: rows[0].id,
    label,
    prefix,
    createdAt: rows[0].created_at,
    token: plaintext,
    notice: "This is the only time you will see this token. Paste it into the Anker LinkedIn extension setup screen now.",
  });
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await sql`
    select id, prefix, label, created_at, last_used_at from extension_tokens
    where user_id = ${userId} and revoked_at is null
    order by created_at desc
  ` as Array<{ id: string; prefix: string; label: string; created_at: Date; last_used_at: Date | null }>;
  return NextResponse.json({ tokens: rows });
}
