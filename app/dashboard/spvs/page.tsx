import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { listSpvs } from "@/lib/modules/carta-modules"
import { PageShell, PageHeader } from "@/components/shell/page-header"
import { SpvsClient } from "@/components/modules/spvs-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "SPVs — Anker" }

export default async function SpvsPage() {
  await requirePersona(["vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const spvs = await listSpvs(user.id)

  return (
    <PageShell>
      <PageHeader eyebrow="Fund services" title="SPVs" description="Form, close, and administer special-purpose vehicles — one deal vehicle at a time, on the same rails as the main fund." />
      <SpvsClient initial={spvs} />
    </PageShell>
  )
}
