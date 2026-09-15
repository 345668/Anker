import { z } from "zod"

export const MAX_TRANSCRIPT = 60000
export const callInput = z.object({
  title: z.string().trim().max(200).default("Untitled call"),
  investorName: z.string().trim().max(200).optional(),
  transcript: z.string().trim().min(20, "Add at least 20 characters of transcript.").max(MAX_TRANSCRIPT),
  crmEntryId: z.string().max(100).nullable().optional(),
  occurredAt: z.string().datetime().optional(),
  externalId: z.string().uuid(),
  consent: z.literal(true, { errorMap: () => ({ message: "Confirm that you may upload this transcript." }) }),
}).strict()

export const CALL_CONTEXT = {
  founder: { label: "Founder", description: "Review fundraising, customer and board conversations. Separate expressed interest from committed capital.", instruction: "Support a founder reviewing fundraising, customer or board discussions. Do not infer an investment commitment from positive language." },
  vc: { label: "Fund manager", description: "Review founder diligence, portfolio and LP conversations. Keep evidence, open questions and next decisions visible.", instruction: "Support a fund manager reviewing diligence, portfolio or LP discussions. Separate reported claims from verified evidence. Do not infer IC approval or a closed investment." },
  lp: { label: "Limited partner", description: "Keep private notes on manager discussions, reporting questions and follow-up requests.", instruction: "Support an LP reviewing manager discussions and fund reporting. Do not infer a capital commitment, payment acknowledgement or investment approval." },
} as const
