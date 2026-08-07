import type { Metadata } from "next"
import "./onboarding.css"

// Onboarding uses the platform's own type system (Outfit / DM Sans / JetBrains
// Mono) — those font variables are already set on <body> by the root layout, so
// no extra font import is needed here. The manga-ink skin lives in onboarding.css.

export const metadata: Metadata = {
  title: "Welcome to Anker — Onboarding",
  description: "Choose your path and set up your workspace.",
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
