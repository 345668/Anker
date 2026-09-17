import { z } from "zod"
import { sql } from "@/lib/db"

/**
 * Ad attribution, kept field-by-field.
 *
 * The form used to join utm_source/medium/campaign into one " / " string and
 * drop utm_id, utm_content and utm_term. A joined label cannot be grouped or
 * filtered, so paid-campaign reporting was impossible. Each field is bounded
 * and optional — these come from a query string and are attacker-supplied.
 */
const attributionField = z.string().trim().max(120).optional()
export const attributionSchema = z.object({
  utm_source: attributionField,
  utm_medium: attributionField,
  utm_campaign: attributionField,
  utm_id: attributionField,
  utm_content: attributionField,
  utm_term: attributionField,
  /** Where the click came from, when the browser discloses it. */
  referrer: z.string().trim().max(500).optional(),
  /** The page the visitor actually landed on, for multi-entry campaigns. */
  landingPath: z.string().trim().max(300).optional(),
}).partial()
export type WaitlistAttribution = z.infer<typeof attributionSchema>

export const waitlistSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  persona: z.enum(["founder", "investor", "lp", "other"]),
  company: z.string().trim().max(160).default(""),
  referralSource: z.string().trim().max(240).default("waitlist"),
  attribution: attributionSchema.default({}),
  consent: z.literal(true, { errorMap: () => ({ message: "Confirm that we may email you about access." }) }),
  website: z.string().max(0).default(""),
})

/** Drop empties so a visitor with no campaign params stores NULL, not {}. */
function cleanAttribution(a: WaitlistAttribution): WaitlistAttribution | null {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(a ?? {})) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim()
  }
  return Object.keys(out).length ? out : null
}
export type WaitlistInput = z.input<typeof waitlistSchema>
export type WaitlistResult = { success: boolean; message: string }

export async function saveWaitlistRequest(raw: unknown): Promise<WaitlistResult> {
  const parsed = waitlistSchema.safeParse(raw)
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message || "Check the form and retry." }
  const data = parsed.data
  try {
    const attribution = cleanAttribution(data.attribution)
    await sql`INSERT INTO early_access_requests
      (name,email,email_key,persona,company,referral_source,attribution,status,consent_at,consent_version)
      VALUES (${data.name},${data.email},${data.email},${data.persona},${data.company || null},
        ${data.referralSource || "waitlist"},${attribution ? JSON.stringify(attribution) : null}::jsonb,
        'pending',now(),'waitlist-access-v1')
      ON CONFLICT (email_key) DO UPDATE SET
        -- A returning applicant used to hit DO NOTHING, so a legacy row with no
        -- consent record stayed without one even though they had just consented
        -- again. Backfill it, but never refresh an existing consent timestamp:
        -- the evidence should show when consent was FIRST given.
        consent_at      = COALESCE(early_access_requests.consent_at, EXCLUDED.consent_at),
        consent_version = COALESCE(early_access_requests.consent_version, EXCLUDED.consent_version),
        -- First touch wins: the campaign that actually brought them in.
        attribution     = COALESCE(early_access_requests.attribution, EXCLUDED.attribution),
        updated_at      = now()
      -- status is deliberately absent. Re-submitting must never reset an
      -- invited or approved applicant back to pending.
      `
    return { success: true, message: "Your request is on the list. We’ll email you when access is available for you." }
  } catch (error) {
    console.error("[waitlist] save failed", { code: (error as { code?: string })?.code })
    return { success: false, message: "We couldn’t save your request. Please try again, or contact us." }
  }
}
