import { z } from "zod"
import { sql } from "@/lib/db"

export const waitlistSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  persona: z.enum(["founder", "investor", "lp", "other"]),
  company: z.string().trim().max(160).default(""),
  referralSource: z.string().trim().max(240).default("waitlist"),
  consent: z.literal(true, { errorMap: () => ({ message: "Confirm that we may email you about access." }) }),
  website: z.string().max(0).default(""),
})
export type WaitlistInput = z.input<typeof waitlistSchema>
export type WaitlistResult = { success: boolean; message: string }

export async function saveWaitlistRequest(raw: unknown): Promise<WaitlistResult> {
  const parsed = waitlistSchema.safeParse(raw)
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message || "Check the form and retry." }
  const data = parsed.data
  try {
    await sql`INSERT INTO early_access_requests
      (name,email,email_key,persona,company,referral_source,status,consent_at,consent_version)
      VALUES (${data.name},${data.email},${data.email},${data.persona},${data.company || null},
        ${data.referralSource || "waitlist"},'pending',now(),'waitlist-access-v1')
      ON CONFLICT (email_key) DO NOTHING`
    return { success: true, message: "Your request is on the list. We’ll email you when access is available for you." }
  } catch (error) {
    console.error("[waitlist] save failed", { code: (error as { code?: string })?.code })
    return { success: false, message: "We couldn’t save your request. Please try again, or contact us." }
  }
}
