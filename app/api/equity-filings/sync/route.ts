/**
 * POST /api/equity-filings/sync — sync statutory filing deadlines from Companies House
 * into the founder's equity-compliance register.
 *
 * Body: { companyNumber: string }
 * Fetches the company profile, derives the upcoming filings (confirmation statement,
 * annual accounts) with their due dates, and creates any not already in the register
 * (deduped by title). Inert with a clear message until COMPANIES_HOUSE_API_KEY is set.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"
import { listFilings, createFiling } from "@/lib/modules/carta-modules"
import { isCompaniesHouseConfigured, getCompanyProfile, deriveUpcomingFilings } from "@/lib/compliance/companies-house"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  if (!isCompaniesHouseConfigured()) {
    return NextResponse.json({ error: "Companies House is not configured. Set COMPANIES_HOUSE_API_KEY to enable sync.", configured: false }, { status: 400 })
  }

  const body = await req.json().catch(() => ({})) as { companyNumber?: string }
  if (!String(body.companyNumber ?? "").trim()) return NextResponse.json({ error: "Provide a 'companyNumber'." }, { status: 400 })

  const profileRes = await getCompanyProfile(String(body.companyNumber))
  if (!profileRes.ok) return NextResponse.json({ error: profileRes.error }, { status: profileRes.status ?? 502 })
  const profile = profileRes.data

  const upcoming = deriveUpcomingFilings(profile)
  if (!upcoming.length) {
    return NextResponse.json({ ok: true, company: profile.companyName, created: 0, skipped: 0, note: "No upcoming statutory filings found on the profile." })
  }

  const companyId = await resolveFounderCompanyId(user.id)
  const existing = await listFilings(companyId)
  const existingTitles = new Set(existing.map((f) => f.title.trim().toLowerCase()))

  let created = 0, skipped = 0
  const createdFilings = []
  for (const u of upcoming) {
    if (existingTitles.has(u.title.trim().toLowerCase())) { skipped++; continue }
    const filing = await createFiling({ companyId, userId: user.id, title: u.title, filingType: u.filingType, dueDate: u.dueDate })
    created++
    createdFilings.push(filing)
  }

  return NextResponse.json({
    ok: true,
    company: profile.companyName,
    companyNumber: profile.companyNumber,
    status: profile.status,
    created, skipped,
    filings: createdFilings,
  })
}
