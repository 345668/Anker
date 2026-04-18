import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DocumentsContent } from "@/components/tesseract/documents-content"

export default async function DocumentsPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/auth/login")
  }

  return <DocumentsContent user={user} />
}
