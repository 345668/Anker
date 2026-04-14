import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { HelpContent } from "@/components/tesseract/help-content"

export default async function HelpPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  return <HelpContent user={user} />
}
