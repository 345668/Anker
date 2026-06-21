import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { listProviders } from "@/lib/news/providers"
import { REGIONS, REGION_META, TOPICS, TOPIC_LABEL } from "@/lib/news/regions"
import { NewsSourcesClient } from "@/components/admin/news-sources-client"

export const dynamic = "force-dynamic"

/**
 * /dashboard/admin/newsroom/sources — News pull from the configured providers.
 *
 * Region picker + topic chips + provider toggles. Server hands the initial
 * provider availability + vocabulary to the client so it doesn't have to
 * round-trip on first paint.
 */
export default async function NewsSourcesPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  return (
    <NewsSourcesClient
      providers={listProviders()}
      regions={REGIONS.map((id) => ({ id, ...REGION_META[id] }))}
      topics={TOPICS.map((id) => ({ id, label: TOPIC_LABEL[id] }))}
    />
  )
}
