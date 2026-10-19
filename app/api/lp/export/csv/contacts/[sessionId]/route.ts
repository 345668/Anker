import { NextRequest, NextResponse } from "next/server"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { contactsCsv, loadSessionResult, slugify } from "@/lib/matching/lp/session-result"

export const runtime = "nodejs"

/** The run's contacts as CSV: rank first, the stable key last. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params
    const context = await matchingContext("vc")
    const loaded = await loadSessionResult(context.orgId, sessionId)
    if (!loaded) return NextResponse.json({ error: "Session not found in this workspace." }, { status: 404 })
    return new NextResponse("﻿" + contactsCsv(loaded.result), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slugify(loaded.fund.name)}-contacts.csv"` },
    })
  } catch (error) { return matchingFailure(error, "Export is temporarily unavailable.") }
}
