import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/investor/profile"
import { StartProfile } from "@/components/investor/start-profile"

export const dynamic = "force-dynamic"
export const metadata = { title: "Investor profile" }

export default async function Page() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) redirect("/auth/login?redirect=/investor/start")
  if (await getProfile(user.id)) redirect("/investor")
  return <main className="mx-auto max-w-5xl px-6 py-10"><StartProfile name={String(user.user_metadata?.full_name ?? "")} /></main>
}
