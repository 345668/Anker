import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { NewsApiKeysClient } from "@/components/admin/news-api-keys-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "News API keys — Anker" }

export default async function Page() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  return <NewsApiKeysClient />
}
