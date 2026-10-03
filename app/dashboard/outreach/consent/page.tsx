import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { requirePersona } from "@/lib/auth/persona-guard"
import { ConsentManager } from "@/components/outreach/consent-manager"

export const dynamic = "force-dynamic"
export const metadata = { title: "Outreach consent — Anker", description: "Record consent for recipients in Germany and other EU/EEA countries." }

export default async function ConsentPage() {
  await requirePersona(["founder", "vc"])
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      <Link href="/dashboard/outreach" className="text-sm text-muted-foreground hover:text-foreground">← Outreach</Link>
      <h1 className="font-display mt-3 mb-4 text-3xl">Outreach consent</h1>
      <ConsentManager />
    </div>
  )
}
