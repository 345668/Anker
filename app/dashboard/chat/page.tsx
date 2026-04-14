import { createClient } from "@/lib/supabase/server"
import { ChatContent } from "@/components/tesseract/chat-content"

export default async function ChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <ChatContent user={user!} />
}
