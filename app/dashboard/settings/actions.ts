"use server"

import { sql } from "@/lib/db"
import { decryptSecret, encryptSecret } from "@/lib/db/secrets"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// API-key fields are encrypted at rest with AES-256-GCM (lib/db/secrets.ts).
const SECRET_FIELDS = [
  "openai_api_key",
  "anthropic_api_key",
  "mistral_api_key",
  "sendgrid_api_key",
] as const

function decryptRow<T extends Record<string, any>>(row: T | null | undefined): T | null {
  if (!row) return null
  const out: any = { ...row }
  for (const f of SECRET_FIELDS) {
    if (out[f] != null) out[f] = decryptSecret(out[f])
  }
  return out
}

export type UserSettings = {
  id: string
  user_id: string
  user_type: 'founder' | 'vc'
  // API Keys
  openai_api_key: string | null
  anthropic_api_key: string | null
  mistral_api_key: string | null
  sendgrid_api_key: string | null
  sender_email: string | null
  sender_name: string | null
  // Founder Company Info
  company_name: string | null
  company_website: string | null
  company_industry: string | null
  company_stage: string | null
  company_description: string | null
  company_one_liner: string | null
  target_raise: number | null
  current_arr: number | null
  // VC Firm Info
  firm_name: string | null
  firm_type: string | null
  firm_aum: number | null
  investment_thesis: string | null
  preferred_stages: string[] | null
  preferred_sectors: string[] | null
  check_size_min: number | null
  check_size_max: number | null
  // Notifications
  notification_email: boolean
  notification_matches: boolean
  notification_deals: boolean
  notification_documents: boolean
  notification_weekly: boolean
  created_at: string
  updated_at: string
}

export async function getUserSettings(): Promise<{ success: boolean; settings: UserSettings | null; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { success: false, settings: null, error: "Not authenticated" }
  }
  
  try {
    const result = await sql`
      SELECT * FROM user_settings WHERE user_id = ${user.id}
    `
    
    if (result.length === 0) {
      // Create default settings
      const newSettings = await sql`
        INSERT INTO user_settings (user_id, user_type)
        VALUES (${user.id}, 'founder')
        RETURNING *
      `
      return { success: true, settings: decryptRow(newSettings[0]) as UserSettings }
    }

    return { success: true, settings: decryptRow(result[0]) as UserSettings }
  } catch (error) {
    console.error('Error fetching user settings:', error)
    return { success: false, settings: null, error: "Failed to fetch settings" }
  }
}

export async function saveUserSettings(data: Partial<UserSettings>): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    console.log("[v0] saveUserSettings: Not authenticated")
    return { success: false, error: "Not authenticated" }
  }
  
  console.log("[v0] saveUserSettings for user:", user.id, "data:", JSON.stringify(data).slice(0, 200))
  
  try {
    // Check if settings exist
    const existing = await sql`SELECT id FROM user_settings WHERE user_id = ${user.id}`
    
<<<<<<< HEAD
    console.log("[v0] Existing settings:", existing.length > 0 ? "found" : "not found")
    
=======
    // Encrypt API keys before storing
    const encOpenai = data.openai_api_key ? encryptSecret(data.openai_api_key) : null
    const encAnthropic = data.anthropic_api_key ? encryptSecret(data.anthropic_api_key) : null
    const encMistral = data.mistral_api_key ? encryptSecret(data.mistral_api_key) : null
    const encSendgrid = data.sendgrid_api_key ? encryptSecret(data.sendgrid_api_key) : null

>>>>>>> 1b7b1a42aaa812ac35eab39b4f1bcfb2161d299b
    if (existing.length === 0) {
      console.log("[v0] Creating new user_settings record")
      // Insert new settings
      await sql`
        INSERT INTO user_settings (
          user_id, user_type,
          openai_api_key, anthropic_api_key, mistral_api_key, sendgrid_api_key,
          sender_email, sender_name,
          company_name, company_website, company_industry, company_stage,
          company_description, company_one_liner, target_raise, current_arr,
          firm_name, firm_type, firm_aum, investment_thesis,
          preferred_stages, preferred_sectors, check_size_min, check_size_max,
          notification_email, notification_matches, notification_deals,
          notification_documents, notification_weekly
        ) VALUES (
          ${user.id}, ${data.user_type || 'founder'},
          ${encOpenai}, ${encAnthropic},
          ${encMistral}, ${encSendgrid},
          ${data.sender_email || null}, ${data.sender_name || null},
          ${data.company_name || null}, ${data.company_website || null},
          ${data.company_industry || null}, ${data.company_stage || null},
          ${data.company_description || null}, ${data.company_one_liner || null},
          ${data.target_raise || null}, ${data.current_arr || null},
          ${data.firm_name || null}, ${data.firm_type || null},
          ${data.firm_aum || null}, ${data.investment_thesis || null},
          ${data.preferred_stages || null}, ${data.preferred_sectors || null},
          ${data.check_size_min || null}, ${data.check_size_max || null},
          ${data.notification_email ?? true}, ${data.notification_matches ?? true},
          ${data.notification_deals ?? true}, ${data.notification_documents ?? false},
          ${data.notification_weekly ?? true}
        )
      `
    } else {
      // Update existing settings — only encrypt if the field is present
      await sql`
        UPDATE user_settings SET
          user_type = COALESCE(${data.user_type}, user_type),
          openai_api_key = COALESCE(${encOpenai}, openai_api_key),
          anthropic_api_key = COALESCE(${encAnthropic}, anthropic_api_key),
          mistral_api_key = COALESCE(${encMistral}, mistral_api_key),
          sendgrid_api_key = COALESCE(${encSendgrid}, sendgrid_api_key),
          sender_email = COALESCE(${data.sender_email}, sender_email),
          sender_name = COALESCE(${data.sender_name}, sender_name),
          company_name = COALESCE(${data.company_name}, company_name),
          company_website = COALESCE(${data.company_website}, company_website),
          company_industry = COALESCE(${data.company_industry}, company_industry),
          company_stage = COALESCE(${data.company_stage}, company_stage),
          company_description = COALESCE(${data.company_description}, company_description),
          company_one_liner = COALESCE(${data.company_one_liner}, company_one_liner),
          target_raise = COALESCE(${data.target_raise}, target_raise),
          current_arr = COALESCE(${data.current_arr}, current_arr),
          firm_name = COALESCE(${data.firm_name}, firm_name),
          firm_type = COALESCE(${data.firm_type}, firm_type),
          firm_aum = COALESCE(${data.firm_aum}, firm_aum),
          investment_thesis = COALESCE(${data.investment_thesis}, investment_thesis),
          preferred_stages = COALESCE(${data.preferred_stages}, preferred_stages),
          preferred_sectors = COALESCE(${data.preferred_sectors}, preferred_sectors),
          check_size_min = COALESCE(${data.check_size_min}, check_size_min),
          check_size_max = COALESCE(${data.check_size_max}, check_size_max),
          notification_email = COALESCE(${data.notification_email}, notification_email),
          notification_matches = COALESCE(${data.notification_matches}, notification_matches),
          notification_deals = COALESCE(${data.notification_deals}, notification_deals),
          notification_documents = COALESCE(${data.notification_documents}, notification_documents),
          notification_weekly = COALESCE(${data.notification_weekly}, notification_weekly),
          updated_at = NOW()
        WHERE user_id = ${user.id}
      `
    }
    
    console.log("[v0] Settings saved successfully")
    revalidatePath('/dashboard/settings')
    return { success: true }
  } catch (error) {
    console.error('[v0] Error saving user settings:', error)
    return { success: false, error: `Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}

export async function saveApiKeys(keys: {
  openai_api_key?: string
  anthropic_api_key?: string
  mistral_api_key?: string
  sendgrid_api_key?: string
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return { success: false, error: "Not authenticated" }
  }
  
  try {
    const existing = await sql`SELECT id FROM user_settings WHERE user_id = ${user.id}`
    
    const encOpenai = keys.openai_api_key ? encryptSecret(keys.openai_api_key) : null
    const encAnthropic = keys.anthropic_api_key ? encryptSecret(keys.anthropic_api_key) : null
    const encMistral = keys.mistral_api_key ? encryptSecret(keys.mistral_api_key) : null
    const encSendgrid = keys.sendgrid_api_key ? encryptSecret(keys.sendgrid_api_key) : null

    if (existing.length === 0) {
      await sql`
        INSERT INTO user_settings (user_id, openai_api_key, anthropic_api_key, mistral_api_key, sendgrid_api_key)
        VALUES (${user.id}, ${encOpenai}, ${encAnthropic}, ${encMistral}, ${encSendgrid})
      `
    } else {
      await sql`
        UPDATE user_settings SET
          openai_api_key = COALESCE(${encOpenai}, openai_api_key),
          anthropic_api_key = COALESCE(${encAnthropic}, anthropic_api_key),
          mistral_api_key = COALESCE(${encMistral}, mistral_api_key),
          sendgrid_api_key = COALESCE(${encSendgrid}, sendgrid_api_key),
          updated_at = NOW()
        WHERE user_id = ${user.id}
      `
    }
    
    revalidatePath('/dashboard/settings')
    return { success: true }
  } catch (error) {
    console.error('Error saving API keys:', error)
    return { success: false, error: "Failed to save API keys" }
  }
}

export async function getApiKey(keyName: 'anthropic_api_key' | 'mistral_api_key' | 'openai_api_key' | 'sendgrid_api_key'): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null
  
  try {
    // sql.unsafe avoids interpolating an identifier through the tagged
    // template (which doesn't support raw column names). The keyName is
    // hard-typed by the function signature so it's safe.
    const result = await (sql as any).unsafe(
      `SELECT ${keyName} FROM user_settings WHERE user_id = $1`,
      [user.id],
    )
    const stored = result?.[0]?.[keyName] ?? null
    return stored ? decryptSecret(stored) : null
  } catch {
    return null
  }
}

export async function saveCompanyProfile(data: {
  company_name: string
  company_website?: string
  company_industry: string
  company_stage: string
  company_description?: string
  company_one_liner?: string
  target_raise?: number
  current_arr?: number
}): Promise<{ success: boolean; error?: string }> {
  return saveUserSettings({
    ...data,
    user_type: 'founder'
  })
}

export async function saveFirmProfile(data: {
  firm_name: string
  firm_type: string
  firm_aum?: number
  investment_thesis?: string
  preferred_stages?: string[]
  preferred_sectors?: string[]
  check_size_min?: number
  check_size_max?: number
}): Promise<{ success: boolean; error?: string }> {
  return saveUserSettings({
    ...data,
    user_type: 'vc'
  })
}

export async function saveNotificationPreferences(data: {
  notification_email: boolean
  notification_matches: boolean
  notification_deals: boolean
  notification_documents: boolean
  notification_weekly: boolean
}): Promise<{ success: boolean; error?: string }> {
  return saveUserSettings(data)
}
