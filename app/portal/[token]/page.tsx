import { headers } from "next/headers"
import { verifyPortalToken, getPortalData, logPortalAccess } from "@/lib/portfolio/lp-portal"
import { LpPortalClient } from "@/components/portfolio/lp-portal-client"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Investor Portal — Anker",
  robots: { index: false, follow: false },   // never index a magic-link page
}

/**
 * /portal/[token] — the LP-facing portal. The token is the auth: no login,
 * no Supabase account. Resolves to a single LP and shows ONLY their
 * materials. Feature adapted from Hemrock Portfolio Reporting (Apache-2.0).
 */
export default async function LpPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const lp = await verifyPortalToken(token)

  if (!lp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center">
          <h1 className="font-display text-2xl mb-2">This link isn&apos;t valid</h1>
          <p className="text-sm text-muted-foreground">
            Your investor-portal link may have expired or been revoked. Please contact the fund team for a new one.
          </p>
        </div>
      </div>
    )
  }

  const h = await headers()
  await logPortalAccess(lp.tokenId, lp.lpId, "home", h.get("x-forwarded-for")?.split(",")[0] ?? null)
  const data = await getPortalData(lp)

  return <LpPortalClient token={token} data={data} />
}
