import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ApiKeysContent } from "@/components/tesseract/api-keys-content"
import { isAdminUser } from "@/lib/auth/require-admin"
import { integrationStatuses } from "@/lib/config/integrations"

export const dynamic = "force-dynamic"

/**
 * API Keys — Anker STAFF only (Owner Console). These are the platform's
 * AI-provider keys, not a customer setting; customers never see this. Non-staff
 * are bounced to the dashboard.
 */
export default async function ApiKeysPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect("/auth/login")

  const { isAdmin } = await isAdminUser()
  if (!isAdmin) redirect("/dashboard")

  return <ApiKeysContent isAdmin={isAdmin} integrations={integrationStatuses()} />
}
