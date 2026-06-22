import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { listProviders, primeNewsKeyCache } from "@/lib/news/providers"
import { REGIONS, REGION_META, TOPICS, TOPIC_LABEL } from "@/lib/news/regions"
import { NewsSourcesClient } from "@/components/admin/news-sources-client"

export const dynamic = "force-dynamic"

/**
 * /dashboard/admin/newsroom/sources — News pull from the configured providers.
 *
 * Region picker + topic chips + provider toggles. Server hands the initial
 * provider availability + vocabulary to the client so it doesn't have to
 * round-trip on first paint.
 *
 * IMPORTANT: listProviders() resolves key availability synchronously via
 * the in-process cache. On a cold serverless invocation that cache is
 * empty, so without an explicit `await primeNewsKeyCache()` first, every
 * DB-stored key shows as not-set and the provider renders as disabled.
 * That was the 'keys saved but UI greyed out' bug.
 */
export default async function NewsSourcesPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  // Prime the runtime-keys cache BEFORE we ask providers for their
  // availability — otherwise the synchronous keyOf() lookups inside
  // listProviders() see an empty cache and report DB-stored keys as
  // missing on every cold serverless invocation.
  await primeNewsKeyCache()

  return (
    <NewsSourcesClient
      providers={listProviders()}
      regions={REGIONS.map((id) => ({ id, ...REGION_META[id] }))}
      topics={TOPICS.map((id) => ({ id, label: TOPIC_LABEL[id] }))}
    />
  )
}
