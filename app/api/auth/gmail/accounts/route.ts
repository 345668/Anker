/**
 * GET    /api/auth/gmail/accounts          — list user's connected Gmail accounts
 * DELETE /api/auth/gmail/accounts?id=...   — remove a connection (revoked locally)
 * PATCH  /api/auth/gmail/accounts          — { id, is_default? } toggle default account
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const rows = await sql`
    SELECT id, provider, email, display_name, is_default, status, last_error,
           last_used_at, created_at, scopes
    FROM email_oauth_accounts
    WHERE user_id = ${user.id}
    ORDER BY is_default DESC, created_at DESC
  ` as any[]
  return NextResponse.json({ accounts: rows })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const result = await sql`DELETE FROM email_oauth_accounts WHERE id=${id} AND user_id=${user.id} RETURNING id` as any[]
  if (!result.length) return NextResponse.json({ error: "Account not found" }, { status: 404 })
  return NextResponse.json({ deleted: true })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = String(body?.id ?? "")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  if (body?.is_default === true) {
    // Flip to default: clear other defaults first.
    await sql`UPDATE email_oauth_accounts SET is_default=false, updated_at=NOW() WHERE user_id=${user.id} AND is_default=true`
    await sql`UPDATE email_oauth_accounts SET is_default=true, updated_at=NOW() WHERE id=${id} AND user_id=${user.id}`
  } else if (body?.is_default === false) {
    await sql`UPDATE email_oauth_accounts SET is_default=false, updated_at=NOW() WHERE id=${id} AND user_id=${user.id}`
  }
  const [row] = await sql`SELECT id, provider, email, display_name, is_default, status FROM email_oauth_accounts WHERE id=${id} AND user_id=${user.id}` as any[]
  if (!row) return NextResponse.json({ error: "Account not found" }, { status: 404 })
  return NextResponse.json({ account: row })
}
