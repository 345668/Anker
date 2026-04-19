import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ChatContent } from "@/components/tesseract/chat-content"
import { sql } from "@/lib/db"

export default async function ChatPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/login")
  }

  // Try to get user's startup for context
  let startup: { name: string; industry?: string } | null = null
  try {
    const startups = await sql`
      SELECT name, industry FROM startups WHERE owner_id = ${user.id} LIMIT 1
    `
    if (startups[0]) {
      startup = { name: startups[0].name, industry: startups[0].industry || undefined }
    }
  } catch {
    // Startup not found - that's okay
  }

  return <ChatContent user={user} startup={startup} />
}
