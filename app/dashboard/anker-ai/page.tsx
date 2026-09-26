import { AnkerAiPage } from "@/components/anker-ai/anker-ai-page"

/**
 * Until 2026-09-26 this rendered PersonaAssistantPage — the same component as
 * /dashboard/assistant — so the nav advertised two products and delivered one.
 * The chat it was supposed to show existed but was imported by nothing.
 * Doc 28 phase 2.
 */
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Anker AI — conversation",
  description: "Talk things through with Anker AI. Multi-model chat; it has no access to your records.",
}

export default function AnkerAiRoute() { return <AnkerAiPage /> }
