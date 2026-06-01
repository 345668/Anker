import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ApiKeysContent } from "@/components/tesseract/api-keys-content"

export const dynamic = "force-dynamic"

export default async function ApiKeysPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const role = (user.user_metadata as any)?.role || (user.app_metadata as any)?.role || "founder"
  return <ApiKeysContent isAdmin={role === "admin"} />
}
