/**
 * /dashboard/pipeline — DEPRECATED (July 2026).
 *
 * This route duplicated the GP deal board. Its useful features (search,
 * stage kanban) were ported to /dashboard/portfolio/fund/deals, which is
 * also where public founder submissions (/pitch) land for review. The
 * old founder-side view over the legacy `deals` table is superseded by
 * the deal_opportunities pipeline.
 *
 * Kept as a redirect so bookmarks and old links keep working.
 */
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default function DeprecatedPipelinePage() {
  redirect("/dashboard/portfolio/fund/deals")
}
