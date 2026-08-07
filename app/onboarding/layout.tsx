import type { Metadata } from "next"
import { Bebas_Neue } from "next/font/google"
import "./onboarding.css"

// Condensed poster display face for the "Rebirth of Souls" onboarding skin.
// Scoped to /onboarding via the --font-bebas variable on the wrapper below.
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--font-bebas" })

export const metadata: Metadata = {
  title: "Welcome to Anker — Onboarding",
  description: "Choose your path and set up your workspace.",
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className={bebas.variable}>{children}</div>
}
