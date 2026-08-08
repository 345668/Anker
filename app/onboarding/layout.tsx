import type { Metadata } from "next"
import { Fraunces } from "next/font/google"

// Carta-style onboarding: clean app UI with a high-contrast serif for headline
// accents. Fraunces (opsz/high-contrast transitional serif) ≈ Carta's editorial
// serif. Body/labels reuse the platform's DM Sans / JetBrains Mono from <body>.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
})

export const metadata: Metadata = {
  title: "Welcome to Anker — Onboarding",
  description: "Set up your workspace.",
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className={fraunces.variable}>{children}</div>
}
