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
      topScore: matches[0]?.composite_score || 0
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
      SET status = ${status}, status_updated_at = NOW()
      WHERE id = ${matchId}
    `
    
    revalidatePath("/dashboard/discover")
    
    return { success: true }
  } catch (error) {
    console.error("Update match status error:", error)
    return { success: false, error: "Failed to update status" }
  }
}

export async function addToOutreach(entityId: string, type: 'investor' | 'firm') {
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

    const startupId = startups[0].id
    const outreachId = crypto.randomUUID()

    if (type === 'investor') {
      // Get investor details
      const investors = await sql`
        SELECT id, firm_id, email FROM investors WHERE id = ${entityId}
      `
      
      if (!investors.length) {
        return { success: false, error: "Investor not found" }
      }

      const investor = investors[0]

      // Check if outreach already exists
      const existing = await sql`
        SELECT id FROM outreaches 
        WHERE startup_id = ${startupId} AND investor_id = ${entityId}
        LIMIT 1
      `

      if (existing.length > 0) {
        return { success: true, message: "Already in pipeline" }
      }

      // Create outreach record for investor
      await sql`
        INSERT INTO outreaches (
          id, owner_id, startup_id, investor_id, firm_id, stage, created_at, updated_at
        )
        VALUES (
          ${outreachId}, ${user.id}, ${startupId}, ${entityId}, 
          ${investor.firm_id || null}, 'draft', NOW(), NOW()
        )
      `
    } else {
      // Check if outreach already exists for firm
      const existing = await sql`
        SELECT id FROM outreaches 
        WHERE startup_id = ${startupId} AND firm_id = ${entityId}
        LIMIT 1
      `

      if (existing.length > 0) {
        return { success: true, message: "Already in pipeline" }
      }

      // Create outreach record for firm
      await sql`
        INSERT INTO outreaches (
          id, owner_id, startup_id, firm_id, stage, created_at, updated_at
        )
        VALUES (
          ${outreachId}, ${user.id}, ${startupId}, ${entityId}, 'draft', NOW(), NOW()
        )
      `
    }
    
    revalidatePath("/dashboard/discover")
    revalidatePath("/dashboard/crm")
    
    return { success: true, outreachId }
  } catch (error) {
    console.error("Add to outreach error:", error)
    return { success: false, error: "Failed to add to pipeline" }
  }
}

export async function addMatchToOutreach(matchId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }
  
  try {
    // Get the match details
    const matches = await sql`
      SELECT investor_id, firm_id, startup_id FROM investor_matches WHERE id = ${matchId}
    `
    
    if (!matches.length) {
      return { success: false, error: "Match not found" }
    }

    const match = matches[0]
    const outreachId = crypto.randomUUID()

    // Check if already in pipeline
    const existing = await sql`
      SELECT id FROM outreaches 
      WHERE startup_id = ${match.startup_id} 
        AND (investor_id = ${match.investor_id} OR firm_id = ${match.firm_id})
      LIMIT 1
    `

    if (existing.length > 0) {
      return { success: true, message: "Already in pipeline" }
    }

    // Create outreach from match
    await sql`
      INSERT INTO outreaches (
        id, owner_id, startup_id, investor_id, firm_id, stage, notes, created_at, updated_at
      )
      VALUES (
        ${outreachId}, ${user.id}, ${match.startup_id}, 
        ${match.investor_id || null}, ${match.firm_id || null}, 
        'draft', 'Added from AI Match', NOW(), NOW()
      )
    `

    // Update match status
    await sql`
      UPDATE investor_matches 
      SET status = 'contacted', status_updated_at = NOW()
      WHERE id = ${matchId}
    `
    
    revalidatePath("/dashboard/discover")
    revalidatePath("/dashboard/crm")
    
    return { success: true, outreachId }
  } catch (error) {
    console.error("Add match to outreach error:", error)
    return { success: false, error: "Failed to add to pipeline" }
  }
}

// Bulk add investors to pipeline
export async function bulkAddToOutreach(investorIds: string[]) {
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

    const startupId = startups[0].id
    let addedCount = 0

    for (const investorId of investorIds) {
      try {
        // Get investor details
        const investors = await sql`
          SELECT id, firm_id FROM investors WHERE id = ${investorId}
        `
        
        if (!investors.length) continue

        const investor = investors[0]
        const outreachId = crypto.randomUUID()

        // Check if already exists
        const existing = await sql`
          SELECT id FROM outreaches 
          WHERE startup_id = ${startupId} AND investor_id = ${investorId}
          LIMIT 1
        `

        if (existing.length > 0) continue

        // Create outreach
        await sql`
          INSERT INTO outreaches (
            id, owner_id, startup_id, investor_id, firm_id, stage, created_at, updated_at
          )
          VALUES (
            ${outreachId}, ${user.id}, ${startupId}, ${investorId}, 
            ${investor.firm_id || null}, 'draft', NOW(), NOW()
          )
        `
        addedCount++
      } catch {
        // Skip individual failures
        continue
      }
    }
    
    revalidatePath("/dashboard/discover")
    revalidatePath("/dashboard/crm")
    
    return { success: true, addedCount }
  } catch (error) {
    console.error("Bulk add error:", error)
    return { success: false, error: "Failed to add investors" }
  }
}
