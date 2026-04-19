"use server"

import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { runMatchingEngine, saveMatches, getMatchesForStartup } from "@/lib/matching/engine"
import { revalidatePath } from "next/cache"

export async function runMatching() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }
  
  try {
    // Get startup for this user
    const startups = await sql`
      SELECT id FROM startups WHERE founder_id = ${user.id} LIMIT 1
    `
    
    if (!startups.length) {
      return { success: false, error: "No startup profile found. Please complete your company profile first." }
    }
    
    const startupId = startups[0].id
    
    // Run matching engine
    const matches = await runMatchingEngine(startupId)
    
    // Save top 100 matches
    await saveMatches(startupId, matches, 100)
    
    revalidatePath("/dashboard/discover")
    
    return { 
      success: true, 
      matchCount: matches.length,
      topScore: matches[0]?.score || 0
    }
  } catch (error) {
    console.error("Matching error:", error)
    return { success: false, error: "Failed to run matching. Please try again." }
  }
}

export async function getMatches() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { success: false, error: "Not authenticated", matches: [] }
  }
  
  try {
    // Get startup for this user
    const startups = await sql`
      SELECT id FROM startups WHERE founder_id = ${user.id} LIMIT 1
    `
    
    if (!startups.length) {
      return { success: false, error: "No startup profile found", matches: [] }
    }
    
    const matches = await getMatchesForStartup(startups[0].id)
    
    return { success: true, matches }
  } catch (error) {
    console.error("Get matches error:", error)
    return { success: false, error: "Failed to fetch matches", matches: [] }
  }
}

export async function updateMatchStatus(matchId: string, status: 'pending' | 'contacted' | 'interested' | 'passed') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }
  
  try {
    await sql`
      UPDATE investor_matches 
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${matchId}
    `
    
    revalidatePath("/dashboard/discover")
    
    return { success: true }
  } catch (error) {
    console.error("Update match status error:", error)
    return { success: false, error: "Failed to update status" }
  }
}

export async function addToOutreach(matchId: string, firmId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }
  
  try {
    // Get startup
    const startups = await sql`
      SELECT id FROM startups WHERE founder_id = ${user.id} LIMIT 1
    `
    
    if (!startups.length) {
      return { success: false, error: "No startup profile found" }
    }
    
    // Create outreach record
    await sql`
      INSERT INTO outreaches (startup_id, firm_id, status, created_at)
      VALUES (${startups[0].id}, ${firmId}, 'draft', NOW())
      ON CONFLICT (startup_id, firm_id) DO NOTHING
    `
    
    // Update match status
    await sql`
      UPDATE investor_matches 
      SET status = 'contacted', updated_at = NOW()
      WHERE id = ${matchId}
    `
    
    revalidatePath("/dashboard/discover")
    revalidatePath("/dashboard/pipeline")
    
    return { success: true }
  } catch (error) {
    console.error("Add to outreach error:", error)
    return { success: false, error: "Failed to add to outreach" }
  }
}
