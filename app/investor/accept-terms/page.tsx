import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getProfile, termsCurrent } from "@/lib/investor/profile"
import { INVESTOR_TERMS_VERSION } from "@/lib/investor/terms-text"
import { AcceptTerms } from "@/components/investor/accept-terms"

export const dynamic = "force-dynamic"
export const metadata = { title: "Updated terms" }

export default async function Page() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) redirect("/auth/login?redirect=/investor")
  if (!(await getProfile(user.id))) redirect("/investor/start")
  if (await termsCurrent(user.id)) redirect("/investor")
  return <main className="mx-auto max-w-xl px-6 py-12"><h1 className="text-xl font-semibold">Our investor terms have changed</h1>
    <p className="mt-2 text-sm text-muted-foreground">Please read the current <Link className="underline" href="/investor/terms">investor terms</Link> and <Link className="underline" href="/investor/privacy">privacy notice</Link> (version {INVESTOR_TERMS_VERSION}) before you continue.</p>
    <AcceptTerms /></main>
}
