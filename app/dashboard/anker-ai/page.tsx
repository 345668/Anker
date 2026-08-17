import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AnkerAiChat } from "@/components/anker-ai/anker-ai-chat"
import { resolveActiveMembership } from "@/lib/org/active"
import { isOwner } from "@/lib/auth/admin"
import { agentForPersona } from "@/lib/agents/personas"

export const dynamic = "force-dynamic"

/**
 * /dashboard/anker-ai — ANKER AI, a Claude-style chatbot over the full model
 * catalog (Qwen3.x, GLM-5.2, DeepSeek, Kimi, …) with streaming responses.
 * Persona-scoped suggestions per the active agent (Founder / Fund / Investor).
 */
export default async function AnkerAiPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const persona = isOwner(user.email) ? null : (await resolveActiveMembership(user.id)).active?.persona ?? null
  const agent = agentForPersona(persona)
  return <AnkerAiChat suggestions={agent.suggestions} agentLabel={agent.label} />
}
