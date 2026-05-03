import { redirect } from "next/navigation"
import { TemplatesContent } from "@/components/tesseract/templates-content"
import { TEMPLATES } from "@/lib/templates/manifest"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Templates (Admin) — Anker",
  description: "Reference templates library — admin-only.",
}

export default async function TemplatesPage() {
  // Admin-only: licence-restricted reference templates are visible only
  // to users with role='admin'. Non-admins are redirected to the public
  // /dashboard/tools page (native calculators).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = user?.user_metadata?.role || user?.app_metadata?.role
  if (!user || role !== "admin") {
    redirect("/dashboard/tools")
  }
  return <TemplatesContent templates={TEMPLATES} />
}
