"use client"

import { useEffect, useState } from "react"
import { Analytics } from "@vercel/analytics/next"
import { readConsent } from "@/lib/consent"

/**
 * Loads Vercel Analytics ONLY after the user has granted the "analytics"
 * category. Listens for consent changes so it starts/stops without a reload.
 * This is what keeps us opt-in (GDPR/ePrivacy): no measurement script runs
 * before an explicit yes.
 */
export function ConsentedAnalytics() {
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    const sync = () => setAllowed(!!readConsent()?.analytics)
    sync()
    window.addEventListener("anker:consent-changed", sync)
    return () => window.removeEventListener("anker:consent-changed", sync)
  }, [])

  if (!allowed) return null
  return <Analytics />
}
