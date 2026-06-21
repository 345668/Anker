/**
 * GET /api/admin/news/providers
 *   Returns provider availability + region/topic vocabulary for the UI.
 */
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { listProviders } from "@/lib/news/providers"
import { REGIONS, REGION_META, TOPICS, TOPIC_LABEL } from "@/lib/news/regions"

export const runtime = "nodejs"

export async function GET() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  return NextResponse.json({
    providers: listProviders(),
    regions: REGIONS.map((id) => ({ id, ...REGION_META[id] })),
    topics: TOPICS.map((id) => ({ id, label: TOPIC_LABEL[id] })),
  })
}
