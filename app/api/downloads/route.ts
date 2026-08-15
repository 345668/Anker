import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"

export const dynamic = "force-dynamic"

/**
 * Recent generated / uploaded documents for the signed-in user — the source for
 * the Carta-style "Downloads" tray in the app header. Best-effort: returns an
 * empty list rather than erroring if the table isn't present.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ downloads: [] })

    const rows = await sql`
      SELECT id, title, type, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS created_at
      FROM documents
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT 12`
    return NextResponse.json({ downloads: rows })
  } catch {
    return NextResponse.json({ downloads: [] })
  }
}
