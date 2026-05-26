/**
 * POST /api/founder/critique-deck-doc
 *
 * Turns the pitch-deck critique JSON (DeckScores from analyze-deck) into
 * a downloadable Word document.  When a matching run summary is supplied
 * the doc becomes "results-aware": it includes a short matching overview
 * (qualified count, top firms) and ties the critique recommendations to
 * what the matcher actually saw.
 *
 * User-gated. No AI calls happen here — this is a deterministic render
 * of a critique you already ran.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { markdownToDocxBuffer } from "@/lib/ai/docx-export"

export const runtime = "nodejs"
export const maxDuration = 60

interface DeckScores {
  scores: Record<string, number>
  comments: Record<string, string>
  overall: number
  grade: string
  missing: string[]
  strengths: string[]
  redFlags: string[]
  suggestedNextSteps: string[]
  notes: string
}

interface RunSummary {
  thesis?: string
  totalFirms?: number
  totalContacts?: number
  withEmail?: number
  byType?: Record<string, number>
  topFirms?: { name: string; type?: string | null; score?: number | null }[]
}

const DIM_LABEL: Record<string, string> = {
  clarity: "Clarity & narrative",
  problem: "Problem framing",
  solution: "Solution & differentiation",
  market: "Market size (TAM/SAM/SOM)",
  traction: "Traction & metrics",
  team: "Team & founder-market fit",
  business_model: "Business model & unit economics",
  ask: "Ask & use of funds",
}

function tile(n: number): string {
  // 0-10 score → small block tile that renders cleanly in docx.
  const filled = Math.max(0, Math.min(10, Math.round(n)))
  return `${filled} / 10`
}

function buildMarkdown(result: DeckScores, filename: string | undefined, run: RunSummary | undefined): string {
  const lines: string[] = []
  const title = filename ? `Pitch deck critique — ${filename}` : "Pitch deck critique"
  lines.push(`# ${title}`, "")
  lines.push(`**Overall:** ${Math.round(result.overall ?? 0)} / 100  ·  **Grade:** ${result.grade ?? "—"}`, "")

  if (result.notes) {
    lines.push(`> ${result.notes.replace(/\n+/g, " ")}`, "")
  }

  // Scorecard table
  lines.push(`## Scorecard`, "")
  lines.push(`| Dimension | Score | Comment |`)
  lines.push(`|---|---|---|`)
  const dims = Object.keys(result.scores ?? {})
  for (const k of dims) {
    const lbl = DIM_LABEL[k] ?? k
    const sc = tile(Number(result.scores?.[k] ?? 0))
    const cm = String(result.comments?.[k] ?? "").replace(/\n+/g, " ").replace(/\|/g, "\\|")
    lines.push(`| ${lbl} | ${sc} | ${cm} |`)
  }
  lines.push("")

  if (result.strengths?.length) {
    lines.push(`## Strengths`, "")
    for (const s of result.strengths) lines.push(`- ${s}`)
    lines.push("")
  }
  if (result.redFlags?.length) {
    lines.push(`## Red flags`, "")
    for (const s of result.redFlags) lines.push(`- ${s}`)
    lines.push("")
  }
  if (result.missing?.length) {
    lines.push(`## Missing from the deck`, "")
    for (const s of result.missing) lines.push(`- ${s}`)
    lines.push("")
  }
  if (result.suggestedNextSteps?.length) {
    lines.push(`## Suggested next steps`, "")
    result.suggestedNextSteps.forEach((s, i) => lines.push(`${i + 1}. ${s}`))
    lines.push("")
  }

  // Results-aware section.
  if (run && (run.totalFirms || run.totalContacts || run.topFirms?.length)) {
    lines.push(`## What the matcher saw`, "")
    const bits: string[] = []
    if (run.totalFirms != null) bits.push(`**${run.totalFirms}** firms qualified`)
    if (run.totalContacts != null) bits.push(`**${run.totalContacts}** contacts`)
    if (run.withEmail != null) bits.push(`${run.withEmail} with email`)
    if (bits.length) lines.push(bits.join(" · "), "")

    if (run.byType && Object.keys(run.byType).length) {
      lines.push(`### By type`, "")
      lines.push(`| Type | Count |`)
      lines.push(`|---|---|`)
      for (const [t, n] of Object.entries(run.byType)) lines.push(`| ${t} | ${n} |`)
      lines.push("")
    }
    if (run.topFirms?.length) {
      lines.push(`### Top firms`, "")
      lines.push(`| Firm | Type | Score |`)
      lines.push(`|---|---|---|`)
      for (const f of run.topFirms.slice(0, 15)) {
        lines.push(`| ${escapeCell(f.name)} | ${escapeCell(f.type ?? "—")} | ${f.score == null ? "—" : String(f.score)} |`)
      }
      lines.push("")
    }

    lines.push(`### Recommendation`, "",
      `The deck scored **${Math.round(result.overall ?? 0)} / 100** and the matcher returned `
      + `**${run.totalFirms ?? "?"} qualified firms**. `
      + (result.redFlags?.length
          ? `Address the red flags above before reaching out — investors will see them first. `
          : `Focus the first round of outreach on the top-tier firms above. `)
      + (run.thesis ? `If thesis-fit reads thin, revisit the one-liner: "${run.thesis}".` : ""),
      "")
  }

  return lines.join("\n")
}

function escapeCell(s: string): string {
  return String(s ?? "").replace(/\n+/g, " ").replace(/\|/g, "\\|")
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const result = body?.result as DeckScores | undefined
    const filename = body?.filename as string | undefined
    const run = body?.runSummary as RunSummary | undefined
    if (!result || !result.scores || !result.comments) {
      return NextResponse.json({ error: "result (DeckScores) required" }, { status: 400 })
    }

    const md = buildMarkdown(result, filename, run)
    const buf = await markdownToDocxBuffer(md, filename ? `Pitch critique — ${filename}` : "Pitch critique")

    const outName = (filename ? filename.replace(/\.[^.]+$/, "") : "pitch-deck") + "-critique.docx"
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${outName}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e: any) {
    console.error("[critique-deck-doc] error:", e)
    return NextResponse.json({ error: e?.message ?? "doc build failed" }, { status: 500 })
  }
}
