import type { Metadata } from "next"

// Onboarding uses the platform's Newsroom design language — Tailwind + the
// shared design tokens (foreground/background/muted, font-display/mono) — so it
// looks native to the rest of the app. The two persona accents (vermilion for
// Founder, cobalt for Fund) are the only added colors.

export const metadata: Metadata = {
  title: "Welcome to Anker — Onboarding",
  description: "Choose your path and set up your workspace.",
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
