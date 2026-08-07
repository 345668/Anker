import { PersonaChooser } from "@/components/onboarding/persona-chooser"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Choose your path — Anker",
  description: "Founder or Venture Fund — set up your Anker workspace.",
}

export default function OnboardingStep0() {
  return <PersonaChooser />
}
