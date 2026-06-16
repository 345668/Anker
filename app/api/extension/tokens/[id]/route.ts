/** DELETE /api/extension/tokens/[id] - revoke a token */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id || null;
  } catch {}
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await sql`
    update extension_tokens set revoked_at = now()
    where id = ${id} and user_id = ${userId} and revoked_at is null
  `;
  return NextResponse.json({ ok: true });
}
