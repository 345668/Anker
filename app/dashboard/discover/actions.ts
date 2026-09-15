"use server"

import { redirect } from "next/navigation"
import { resolveActiveMembership } from "@/lib/org/active"
import { saveDiscoveryContact } from "@/lib/crm/discovery"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"

// Available matching algorithms
export type MatchingAlgorithm =
  | 'balanced'
  | 'industry-first'
  | 'stage-first'
  | 'check-size'
  | 'local'
  | 'fund-i'
  | 'fund-iii-iv'
  | 'venture-studio'

/** Older clients are sent to the workspace-aware, reviewed matching flow. */
export async function runMatching(_algorithm: MatchingAlgorithm = 'balanced') {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) redirect("/auth/login")
  const { active } = await resolveActiveMembership(user.id)
  redirect(!active?.persona ? "/onboarding" : active.persona === "founder" ? "/dashboard/find-investors" : active.persona === "vc" ? "/dashboard/matchmaking" : "/lp")
}

export async function getMatches() {
  return { success: false, error: "Open Find Investors or LP Matchmaking in your active workspace to review current matches.", matches: [] }
}

// Accept a match - adds to pipeline automatically
export async function acceptMatch(matchId: string) {
  return { success: false, error: "This legacy workflow is retired. Open Find Investors or LP Matchmaking in your active workspace and save reviewed matches to CRM." }
}

// Reject a match with optional reason
export async function rejectMatch(matchId: string, reason?: string) {
  return { success: false, error: "This legacy workflow is retired. Open Find Investors or LP Matchmaking in your active workspace and save reviewed matches to CRM." }
}

// Bulk accept matches
export async function bulkAcceptMatches(matchIds: string[]) {
  return { success: false, error: "This legacy workflow is retired. Open Find Investors or LP Matchmaking in your active workspace and save reviewed matches to CRM.", acceptedCount: 0 }
}

// Bulk reject matches
export async function bulkRejectMatches(matchIds: string[], reason?: string) {
  return { success: false, error: "This legacy workflow is retired. Open Find Investors or LP Matchmaking in your active workspace and save reviewed matches to CRM.", rejectedCount: 0 }
}

export async function updateMatchStatus(matchId: string, status: 'pending' | 'contacted' | 'interested' | 'passed') {
  return { success: false, error: "This legacy workflow is retired. Open Find Investors or LP Matchmaking in your active workspace and save reviewed matches to CRM." }
}

export async function addToOutreach(entityId: string, type: 'investor' | 'firm') {
  try { return await saveDiscoveryContact(entityId, type) }
  catch (error) { return { success: false as const, error: error instanceof WorkspaceError ? error.message : "Could not save this record to your CRM. Please retry." } }
}

export async function addMatchToOutreach(matchId: string) {
  return { success: false, error: "This legacy workflow is retired. Open Find Investors or LP Matchmaking in your active workspace and save reviewed matches to CRM." }
}

// Bulk add investors to pipeline
export async function bulkAddToOutreach(investorIds: string[]) {
  return { success: false, error: "This legacy workflow is retired. Open Find Investors or LP Matchmaking in your active workspace and save reviewed matches to CRM.", addedCount: 0 }
}

// Get available matching algorithms
export async function getMatchingAlgorithms() {
  try {
    const algorithms = await sql`
      SELECT id, name, description,
             weight_industry, weight_stage, weight_geography,
             weight_check_size, weight_investor_type, weight_team_signals
      FROM matching_algorithms
      WHERE is_active = true
      ORDER BY id
    `
    return { success: true, algorithms }
  } catch {
    // Return defaults if table doesn't exist
    return {
      success: true,
      algorithms: [
        { id: 'balanced', name: 'Balanced', description: 'Equal weighting across all factors' },
        { id: 'industry-first', name: 'Industry Focus', description: 'Prioritizes industry alignment' },
        { id: 'stage-first', name: 'Stage Focus', description: 'Prioritizes stage fit' },
        { id: 'check-size', name: 'Check Size Focus', description: 'Optimizes for check size match' },
        { id: 'local', name: 'Local Investors', description: 'Emphasizes geographic proximity' },
        { id: 'fund-i', name: 'Fund I/II (Emerging)', description: 'Optimized for emerging fund managers' },
        { id: 'fund-iii-iv', name: 'Fund III/IV (Institutional)', description: 'Optimized for institutional investors' },
        { id: 'venture-studio', name: 'Venture Studio', description: 'Optimized for venture studios' },
      ]
    }
  }
}
