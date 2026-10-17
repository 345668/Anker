import { cookies, headers } from "next/headers"
import { verifyPortalToken, getPortalData, logPortalAccess } from "@/lib/portfolio/lp-portal"
import { lpEmail, maskEmail, onboardingView, sessionCookieName, sessionOk } from "@/lib/portfolio/lp-onboarding"
import { LpPortalClient } from "@/components/portfolio/lp-portal-client"
import { LpCodeGate } from "@/components/portfolio/lp-code-gate"
import { lpSubscriptionView } from "@/lib/portfolio/lp-subscription"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Investor Portal — Anker",
  robots: { index: false, follow: false },   // never index a magic-link page
}

/**
 * /portal/[token] — the LP-facing portal. The link identifies one investor; a six-digit code sent to that investor's own address opens it (docs/architecture/60).
 * Until the code is entered the page shows the fund's name and a masked address, nothing else. No Supabase account is needed.
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

  const jar = await cookies()
  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0] ?? null
  if (!(await sessionOk(lp.tokenId, jar.get(sessionCookieName(lp.tokenId))?.value))) {
    const who = await lpEmail(lp.lpId)
    return <LpCodeGate token={token} fundName={lp.fundName} maskedEmail={who?.email ? maskEmail(who.email) : null} />
  }

  await logPortalAccess(lp.tokenId, lp.lpId, "home", ip)
  const [data, onboarding, subscription] = await Promise.all([getPortalData(lp), onboardingView(lp.lpId), lpSubscriptionView(lp.lpId)])
  return <LpPortalClient token={token} data={data} onboarding={onboarding} subscription={subscription} />
}
