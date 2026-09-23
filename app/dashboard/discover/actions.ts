"use server"

/**
 * What remains of the legacy Discover actions.
 *
 * Saving to the CRM now goes through `POST /api/discovery/save`, and matching
 * through the founder and LP engines. The three stubs below are still called
 * by the legacy match pipeline (`components/tesseract/pipeline-content.tsx`)
 * and tell the user where the work moved; `runMatching` routes an older client
 * to its persona's matching page. Everything else was removed with Discover v2
 * (docs/architecture/10 DS10), including the reader for the `matching_algorithms`
 * table, which no engine has used since v2.
 */
import { redirect } from "next/navigation"
import { resolveActiveMembership } from "@/lib/org/active"
import { createClient } from "@/lib/supabase/server"

const RETIRED = "This legacy workflow is retired. Open Find Investors or LP Matchmaking in your active workspace and save reviewed matches to CRM."

/** Older clients are sent to the workspace-aware, reviewed matching flow. */
export async function runMatching(_algorithm: string = "balanced") {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) redirect("/auth/login")
  const { active } = await resolveActiveMembership(user.id)
  redirect(!active?.persona ? "/onboarding" : active.persona === "founder" ? "/dashboard/find-investors" : active.persona === "vc" ? "/dashboard/matchmaking" : "/lp")
}

export async function acceptMatch(_matchId: string) {
  return { success: false, error: RETIRED }
}

export async function rejectMatch(_matchId: string, _reason?: string) {
  return { success: false, error: RETIRED }
}

export async function addMatchToOutreach(_matchId: string) {
  return { success: false, error: RETIRED }
}
