import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AnkerAiChat } from "@/components/anker-ai/anker-ai-chat"

export const dynamic = "force-dynamic"

/**
 * /dashboard/anker-ai — ANKER AI, a Claude-style chatbot over the full model
 * catalog (Qwen3.x, GLM-5.2, DeepSeek, Kimi, …) with streaming responses.
 */
export default async function AnkerAiPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  return <AnkerAiChat />
}
