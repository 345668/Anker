import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { listProviders, primeNewsKeyCache } from "@/lib/news/providers"
import { REGIONS, REGION_META, TOPICS, TOPIC_LABEL } from "@/lib/news/regions"
import { NewsSourcesClient } from "@/components/admin/news-sources-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "News sources — Anker" }

export default async function Page() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")
  await primeNewsKeyCache()
  return (
    <NewsSourcesClient
      providers={listProviders()}
      regions={REGIONS.map((id) => ({ id, ...REGION_META[id] }))}
      topics={TOPICS.map((id) => ({ id, label: TOPIC_LABEL[id] }))}
    />
  )
}
