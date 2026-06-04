"use server"

import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"
import { runMatchingEngine, saveMatches, getMatchesForStartup } from "@/lib/matching/engine"
import { revalidatePath } from "next/cache"

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

// Helper to get startup ID - auto-creates from user_settings if needed
async function getStartupId(userId: string): Promise<string | null> {
  try {
    // startups table uses founder_id, not owner_id
    const startups = await sql`SELECT id FROM startups WHERE founder_id = ${userId} LIMIT 1`
    
    if (startups.length) {
      return startups[0].id
    }
    
    // No startup found - try to create one from user_settings
    const settings = await sql`
      SELECT company_name, company_website, company_industry, company_stage, 
             company_description, company_one_liner, target_raise, current_arr
      FROM user_settings 
      WHERE user_id = ${userId}
      LIMIT 1
    `
    
    if (settings.length && settings[0].company_name) {
      // Create startup from user_settings - only use founder_id (owner_id doesn't exist)
      const newId = crypto.randomUUID()
      await sql`
        INSERT INTO startups (
          id, founder_id, name, website, niche_industry, stage, 
          description, tagline, funding_target, mrr, created_at, updated_at
        )
        VALUES (
          ${newId}, ${userId}, 
          ${settings[0].company_name},
          ${settings[0].company_website || null},
          ${settings[0].company_industry || null},
          ${settings[0].company_stage || null},
          ${settings[0].company_description || null},
          ${settings[0].company_one_liner || null},
          ${settings[0].target_raise ? String(settings[0].target_raise) : null},
          ${settings[0].current_arr || null},
          NOW(), NOW()
        )
      `
      return newId
    }
    
    return null
  } catch (error) {
    console.error("getStartupId error:", error)
    return null
  }
}

// Helper to get user type and profile
async function getUserTypeAndProfile(userId: string): Promise<{ userType: string | null; hasProfile: boolean }> {
  try {
    const settings = await sql`
      SELECT user_type, company_name, firm_name 
      FROM user_settings 
      WHERE user_id = ${userId}
      LIMIT 1
    `
    if (!settings.length) return { userType: null, hasProfile: false }
    
    const s = settings[0]
    const hasProfile = s.user_type === 'vc' ? !!s.firm_name : !!s.company_name
    return { userType: s.user_type, hasProfile }
  } catch {
    return { userType: null, hasProfile: false }
  }
}

// Helper to get or create fund profile for VCs
async function getOrCreateFundProfile(userId: string): Promise<string | null> {
  try {
    // Check if fund profile exists
    const existing = await sql`SELECT id FROM fund_profiles WHERE user_id = ${userId} LIMIT 1`
    if (existing.length) return existing[0].id
    
    // Get VC settings to create fund profile
    const settings = await sql`
      SELECT firm_name, firm_type, firm_aum, firm_thesis, preferred_stages, preferred_sectors, min_check, max_check
      FROM user_settings
      WHERE user_id = ${userId}
      LIMIT 1
    `
    
    if (!settings.length || !settings[0].firm_name) return null
    
    const s = settings[0]
    const fundId = crypto.randomUUID()
    
    await sql`
      INSERT INTO fund_profiles (
        id, user_id, fund_name, fund_type, target_fund_size, target_sectors, target_stages, created_at, updated_at
      )
      VALUES (
        ${fundId}, ${userId}, ${s.firm_name}, ${s.firm_type || 'Venture Capital'},
        ${s.firm_aum || null},
        ${s.preferred_sectors || null},
        ${s.preferred_stages || null},
        NOW(), NOW()
      )
    `
    
    return fundId
  } catch (error) {
    console.error("Error creating fund profile:", error)
    return null
  }
}

export async function runMatching(algorithm: MatchingAlgorithm = 'balanced') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }
  
  try {
    // First check user type to determine matching mode
    const { userType, hasProfile } = await getUserTypeAndProfile(user.id)
    
    // VC Mode: Match fund with LPs
    if (userType === 'vc') {
      const fundProfileId = await getOrCreateFundProfile(user.id)
      
      if (!fundProfileId) {
        return { 
          success: false, 
          error: "No fund profile found. Please go to Settings > Firm and fill in your firm name, type, and investment preferences to enable LP matching.",
          needsProfile: true,
          matchType: 'lp'
        }
      }
      
      // Import and run LP matching engine
      const { runLpMatching } = await import('@/lib/matching/lp-matchmaking')
      const lpMatches = await runLpMatching(fundProfileId, { algorithm })
      
      revalidatePath("/dashboard/discover")
      
      return { 
        success: true, 
        matchCount: lpMatches.firmMatches?.length || 0,
        contactCount: lpMatches.contactMatches?.length || 0,
        topScore: lpMatches.firmMatches?.[0]?.score || 0,
        algorithm,
        matchType: 'lp',
        sessionId: lpMatches.sessionId
      }
    }
    
    // Founder Mode: Match startup with investors
    const startupId = await getStartupId(user.id)
    
    if (!startupId) {
      return { 
        success: false, 
        error: "No startup profile found. Please go to Settings > Company and fill in your company name, industry, and stage to enable investor matching.",
        needsProfile: true,
        matchType: 'investor'
      }
    }
    
    // Run matching engine with selected algorithm
    const matches = await runMatchingEngine(startupId, algorithm)
    
    // Save top 100 matches
    await saveMatches(startupId, matches, 100)
    
    // Log the matching run
    try {
      await sql`
        INSERT INTO matching_runs (startup_id, algorithm, matches_generated, avg_score, created_at)
        VALUES (${startupId}, ${algorithm}, ${matches.length}, ${matches.length > 0 ? matches.reduce((s, m) => s + m.score, 0) / matches.length : 0}, NOW())
      `
    } catch {
      // Table might not exist, continue
    }
    
    revalidatePath("/dashboard/discover")
    
    return { 
      success: true, 
      matchCount: matches.length,
      topScore: matches[0]?.score || 0,
      algorithm,
      matchType: 'investor'
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
    const startupId = await getStartupId(user.id)
    
    if (!startupId) {
      return { success: false, error: "No startup profile found", matches: [] }
    }
    
    const matches = await getMatchesForStartup(startupId)
    
    return { success: true, matches }
  } catch (error) {
    console.error("Get matches error:", error)
    return { success: false, error: "Failed to fetch matches", matches: [] }
  }
}

// Accept a match - adds to pipeline automatically
export async function acceptMatch(matchId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }
  
  try {
    // Get the match
    const matches = await sql`
      SELECT investor_id, firm_id, startup_id FROM investor_matches WHERE id = ${matchId}
    `
    
    if (!matches.length) {
      return { success: false, error: "Match not found" }
    }

    const match = matches[0]

    // Update match status to accepted
    await sql`
      UPDATE investor_matches 
      SET status = 'accepted', accepted_at = NOW()
      WHERE id = ${matchId}
    `

    // Check if already in pipeline
    const existing = await sql`
      SELECT id FROM outreaches 
      WHERE startup_id = ${match.startup_id} 
        AND (investor_id = ${match.investor_id} OR firm_id = ${match.firm_id})
      LIMIT 1
    `

    if (existing.length === 0) {
      // Add to pipeline
      const outreachId = crypto.randomUUID()
      await sql`
        INSERT INTO outreaches (
          id, owner_id, startup_id, investor_id, firm_id, stage, notes, created_at, updated_at
        )
        VALUES (
          ${outreachId}, ${user.id}, ${match.startup_id}, 
          ${match.investor_id || null}, ${match.firm_id || null}, 
          'draft', 'Added from AI Match (Accepted)', NOW(), NOW()
        )
      `
    }
    
    revalidatePath("/dashboard/discover")
    revalidatePath("/dashboard/crm")
    
    return { success: true }
  } catch (error) {
    console.error("Accept match error:", error)
    return { success: false, error: "Failed to accept match" }
  }
}

// Reject a match with optional reason
export async function rejectMatch(matchId: string, reason?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }
  
  try {
    await sql`
      UPDATE investor_matches 
      SET status = 'rejected', 
          rejected_at = NOW(),
          rejection_reason = ${reason || null}
      WHERE id = ${matchId}
    `
    
    revalidatePath("/dashboard/discover")
    
    return { success: true }
  } catch (error) {
    console.error("Reject match error:", error)
    return { success: false, error: "Failed to reject match" }
  }
}

// Bulk accept matches
export async function bulkAcceptMatches(matchIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }
  
  let acceptedCount = 0
  
  for (const matchId of matchIds) {
    const result = await acceptMatch(matchId)
    if (result.success) acceptedCount++
  }
  
  return { success: true, acceptedCount }
}

// Bulk reject matches
export async function bulkRejectMatches(matchIds: string[], reason?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }
  
  let rejectedCount = 0
  
  for (const matchId of matchIds) {
    const result = await rejectMatch(matchId, reason)
    if (result.success) rejectedCount++
  }
  
  return { success: true, rejectedCount }
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
    const startupId = await getStartupId(user.id)
    
    if (!startupId) {
      return { success: false, error: "No startup profile found" }
    }

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
    const startupId = await getStartupId(user.id)
    
    if (!startupId) {
      return { success: false, error: "No startup profile found" }
    }

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
