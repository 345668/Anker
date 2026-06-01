import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AssistantContent } from "@/components/tesseract/assistant-content"

export const dynamic = "force-dynamic"

export default async function AssistantPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  return <AssistantContent />
}
