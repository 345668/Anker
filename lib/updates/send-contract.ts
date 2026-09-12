import { z } from "zod"
export const updateContent = z.object({ title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(50000), asks: z.string().max(10000).default("") })
export const sendRequest = z.object({ revision: z.number().int().min(0), content: updateContent.optional(),
  recipients: z.array(z.object({ crmEntryId: z.string().max(200).optional(), email: z.string().trim().email().max(320), name: z.string().max(300).optional() })).min(1).max(200).optional() })
export type SendSnapshot = { title: string; body: string; asks: string; startedAt: string; recipients: { crmEntryId?: string; email: string; name?: string; trackingId: string }[] }
