/**
 * POST /api/portal/[token]/ask — the scoped LP analyst.
 *
 * Answers an LP's question using ONLY that LP's own materials (their capital
 * position history + published letters + document titles). The token is the
 * auth — no admin session. The prompt is hard-scoped and refuses anything
 * outside the LP's data, so one LP can never learn about another.
 *
 * Feature adapted from Hemrock Portfolio Reporting (Apache-2.0); see NOTICE.
 */
import { NextRequest, NextResponse } from "next/server"
import { verifyPortalToken, getPortalData, getPortalLetter, logPortalAccess } from "@/lib/portfolio/lp-portal"
import { sql } from "@/lib/db"
import { generate } from "@/lib/ai/provider"
import { sessionCookieName, sessionOk } from "@/lib/portfolio/lp-onboarding"
import { classifyRequest, submitRequest, KIND_LABEL } from "@/lib/portfolio/lp-requests"

export const runtime = "nodejs"
export const maxDuration = 90

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const lp = await verifyPortalToken(token)
  if (!lp) return NextResponse.json({ error: "Invalid or expired link." }, { status: 401 })
  if (!(await sessionOk(lp.tokenId, req.cookies.get(sessionCookieName(lp.tokenId))?.value))) return NextResponse.json({ error: "Please enter your code first." }, { status: 401 })

  let body: any = {}
  try { body = await req.json() } catch {}
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 500) : ""
  if (!question) return NextResponse.json({ error: "Ask a question." }, { status: 400 })

  await logPortalAccess(lp.tokenId, lp.lpId, "ask", req.headers.get("x-forwarded-for")?.split(",")[0] ?? null)

  // A question that asks the fund to DO something (withdraw, transfer, change details) is not answered as if it were done: it becomes a request the fund sees (docs/architecture/60 section 8).
  const asked = classifyRequest(question)
  if (asked) {
    try {
      const { propose } = await import("@/lib/actions/store")
      await submitRequest({ lpId: lp.lpId, fundId: lp.fundId }, { kind: asked, body: question, source: "assistant" }, propose as never)
      return NextResponse.json({ answer: `I cannot do that from here, and I have not changed anything. I have passed your request (${KIND_LABEL[asked].toLowerCase()}) to the fund team, in your own words, and they will get back to you.`, requestSent: true })
    } catch (e) {
      return NextResponse.json({ answer: (e as Error)?.message || "I could not pass that on just now. Please contact the fund team directly." })
    }
  }

  const data = await getPortalData(lp)
  // Pull letter bodies (scoped) so the analyst can answer from their content.
  const letterBodies = (await Promise.all(
    data.letters.slice(0, 6).map(async (l) => {
      const full = await getPortalLetter(lp.fundId, l.id)
      return full ? `LETTER — ${full.title}${full.quarter ? ` (${full.quarter})` : ""}:\n${full.contentMd.slice(0, 3000)}` : null
    }),
  )).filter(Boolean).join("\n\n")

  const context = `LP: ${data.lp.name}
Fund: ${data.fundName ?? ""}
Capital: commitment ${fmt(data.lp.commitment)}, called ${fmt(data.lp.called)}, distributed ${fmt(data.lp.distributed)}, NAV ${fmt(data.lp.nav)}, ownership ${data.lp.ownershipPct != null ? data.lp.ownershipPct + "%" : "n/a"}
Position history (as-of: commitment/called/distributed/NAV):
${data.positions.map((p) => `${p.asOf}: ${fmt(p.commitment)}/${fmt(p.called)}/${fmt(p.distributed)}/${fmt(p.nav)}`).join("\n") || "none"}
Documents on file: ${data.documents.map((d) => d.title).join(", ") || "none"}

${letterBodies}`

  const prompt = `You are the investor-relations analyst for ${data.fundName ?? "the fund"}, answering a question from the limited partner "${data.lp.name}".

You may ONLY use the materials below, which belong to THIS LP. If the answer isn't in them, say you don't have that information and suggest they contact the fund team. NEVER mention or infer anything about other LPs, the fund's other investors, or data not shown here. Be concise, precise with numbers, and professional.

=== THIS LP'S MATERIALS ===
${context}
=== END ===

Question: ${question}

Answer:`

  const answer = await generate(prompt, { task: "deep_research", maxTokens: 700, temperature: 0.3 })
  return NextResponse.json({ answer: (answer || "I don't have that information — please contact the fund team.").trim() })
}

function fmt(n: number | null): string {
  return n == null ? "—" : "$" + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })
}
