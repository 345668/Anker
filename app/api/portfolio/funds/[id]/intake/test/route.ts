/**
 * POST /api/portfolio/funds/[id]/intake/test   { config?, submission }
 * A dry run: what the engine would do with a sample submission under the config in the editor (saved or not).
 * Writes nothing, creates no deal, sends nothing.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireFundAccess } from "@/lib/auth/fund-access"
import { getConfig } from "@/lib/intake/store"
import { assess } from "@/lib/intake/engine"
import { configSchema } from "@/lib/intake/model"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { z, ZodError } from "zod"

export const runtime = "nodejs"
export const maxDuration = 120

const submissionSchema = z.object({
  companyName: z.string().trim().min(1).max(200), website: z.string().max(300).nullish(), oneLiner: z.string().max(400).nullish(),
  stage: z.string().max(60).nullish(), sectors: z.array(z.string().max(60)).max(20).default([]), location: z.string().max(160).nullish(),
  raiseAmount: z.number().nonnegative().nullish(), chequeAsk: z.number().nonnegative().nullish(),
  answers: z.record(z.string(), z.string().max(1500)).default({}), deckSummary: z.string().max(4000).nullish(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireFundAccess((await ctx.params).id)
  if (guard instanceof NextResponse) return guard
  const rl = rateLimit(`intake-test:${guard.id}`, { limit: 20, windowMs: 60 * 60_000 })
  if (!rl.ok) return rateLimitResponse(rl)
  try {
    const body = await req.json()
    const stored = await getConfig(guard.fund.id)
    const config = body.config ? configSchema.parse(body.config) : stored.config
    const submission = submissionSchema.parse(body.submission)
    const result = await assess(config, stored.version, submission as any)
    return NextResponse.json({ result })
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 })
    return NextResponse.json({ error: "Test failed" }, { status: 500 })
  }
}
