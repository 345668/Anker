/**
 * GET /api/health — is the app up, and is the database where the code expects it to be (docs/architecture/59 R3).
 * Public and read-only. It reveals whether the database answers and how many migrations are missing: never their names, never any data.
 */
import { NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { schemaBehind } from "@/lib/migrations/schema-state"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const headers = { "Cache-Control": "no-store" }

export async function GET() {
  try {
    await sql`SELECT 1`
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503, headers })
  }
  let behind: number | null = null
  try { behind = (await schemaBehind()).length } catch { /* ledger unreadable: reported as unknown, not as a failure of the app */ }
  return NextResponse.json({ ok: behind === 0, db: true, schemaBehind: behind }, { headers })
}
