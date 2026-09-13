import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"

export const runtime = "nodejs"

/** User-scoped durable delivery history for approved reply drafts. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  try {
    const deliveries = await sql`
      SELECT outreach_message_id AS "outreachMessageId", status, first_attempt_at AS "firstAttemptAt",
             updated_at AS "updatedAt", last_error AS "lastError"
      FROM outreach_reply_deliveries
      WHERE user_id = ${user.id}
      ORDER BY updated_at DESC
      LIMIT 100
    `
    return NextResponse.json({ deliveries })
  } catch (error) {
    console.error("[outreach/delivery-status] read failed", error)
    return NextResponse.json({ error: "Delivery monitoring is not available yet" }, { status: 503 })
  }
}
