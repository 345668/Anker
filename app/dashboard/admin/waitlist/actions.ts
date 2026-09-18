"use server"
import { revalidatePath } from "next/cache"
import { isAdminUser } from "@/lib/auth/require-admin"
import { runWaitlistAction, type ActionResult, type WaitlistAction } from "@/lib/marketing/waitlist-admin"

/**
 * Owner actions on the early-access queue.
 *
 * Thin: the lifecycle itself lives in lib/marketing/waitlist-admin.ts, shared
 * with /api/admin/waitlist so the staff portal drives exactly the same rules.
 * This layer only checks the session and refreshes the page.
 */

export type WaitlistActionResult = ActionResult

const REVALIDATE = "/dashboard/admin/waitlist"

export async function runFromConsole(
  action: WaitlistAction, requestId: string, ttlDays?: number,
): Promise<WaitlistActionResult> {
  if (!(await isAdminUser()).isAdmin) return { ok: false, message: "Not authorised." }
  const result = await runWaitlistAction(action, requestId, { ttlDays })
  revalidatePath(REVALIDATE)
  return result
}
