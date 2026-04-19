"use server"

import { revalidatePath } from "next/cache"
import { sql } from "@/lib/db"

export async function updateOutreachStageAction(outreachId: string, newStage: string) {
  try {
    await sql`
      UPDATE outreaches 
      SET stage = ${newStage}, updated_at = NOW()
      WHERE id = ${outreachId}
    `
    revalidatePath('/dashboard/crm')
    return { success: true }
  } catch (error) {
    console.error('Failed to update outreach stage:', error)
    return { success: false, error: 'Failed to update stage' }
  }
}

export async function deleteOutreachAction(outreachId: string) {
  try {
    await sql`DELETE FROM outreaches WHERE id = ${outreachId}`
    revalidatePath('/dashboard/crm')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete outreach:', error)
    return { success: false, error: 'Failed to delete outreach' }
  }
}

export async function createOutreachAction(data: {
  owner_id: string
  startup_id: string
  investor_id?: string
  firm_id?: string
  stage?: string
  notes?: string
  email_subject?: string
  email_body?: string
}) {
  try {
    const id = crypto.randomUUID()
    await sql`
      INSERT INTO outreaches (
        id, owner_id, startup_id, investor_id, firm_id, 
        stage, notes, email_subject, email_body, created_at, updated_at
      )
      VALUES (
        ${id}, ${data.owner_id}, ${data.startup_id}, 
        ${data.investor_id || null}, ${data.firm_id || null},
        ${data.stage || 'draft'}, ${data.notes || null},
        ${data.email_subject || null}, ${data.email_body || null},
        NOW(), NOW()
      )
    `
    revalidatePath('/dashboard/crm')
    return { success: true, id }
  } catch (error) {
    console.error('Failed to create outreach:', error)
    return { success: false, error: 'Failed to create outreach' }
  }
}

export async function markOutreachSentAction(outreachId: string) {
  try {
    await sql`
      UPDATE outreaches 
      SET sent_at = NOW(), stage = 'sent', updated_at = NOW()
      WHERE id = ${outreachId}
    `
    revalidatePath('/dashboard/crm')
    return { success: true }
  } catch (error) {
    console.error('Failed to mark outreach as sent:', error)
    return { success: false, error: 'Failed to update' }
  }
}

export async function scheduleCallAction(outreachId: string, callDate: string) {
  try {
    await sql`
      UPDATE outreaches 
      SET scheduled_call_at = ${callDate}, stage = 'meeting_scheduled', updated_at = NOW()
      WHERE id = ${outreachId}
    `
    revalidatePath('/dashboard/crm')
    return { success: true }
  } catch (error) {
    console.error('Failed to schedule call:', error)
    return { success: false, error: 'Failed to schedule call' }
  }
}
