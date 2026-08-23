/**
 * GET /api/notifications — the current user's notification feed + unread count.
 * Query: ?unread=1 (unread only), ?limit=N.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { listNotifications, unreadCount } from "@/lib/notifications/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const url = new URL(req.url)
  const unreadOnly = url.searchParams.get("unread") === "1"
  const limit = Number(url.searchParams.get("limit")) || 30

  const [notifications, unread] = await Promise.all([
    listNotifications(user.id, { limit, unreadOnly }),
    unreadCount(user.id),
  ])
  return NextResponse.json({ notifications, unread })
}
