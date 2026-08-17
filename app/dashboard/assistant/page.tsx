import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AssistantPowerhouse } from "@/components/assistant/assistant-powerhouse"
import { resolveActiveMembership } from "@/lib/org/active"
import { isOwner } from "@/lib/auth/admin"
import { agentForPersona } from "@/lib/agents/personas"

export const dynamic = "force-dynamic"

export default async function AssistantPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")

  const persona = isOwner(user.email) ? null : (await resolveActiveMembership(user.id)).active?.persona ?? null
  const agent = agentForPersona(persona)

  return <AssistantPowerhouse agentLabel={agent.label} agentTagline={agent.tagline} suggestions={agent.suggestions} />
}
