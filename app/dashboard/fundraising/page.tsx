import { FundraisingContent } from "@/components/tesseract/fundraising-content"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function FundraisingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  return <FundraisingContent user={user} />
}
