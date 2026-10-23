import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getProfile, termsCurrent } from "@/lib/investor/profile"

export const dynamic = "force-dynamic"

export default async function InvestorLayout({ children }: { children: React.ReactNode }) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) redirect("/auth/login?redirect=/investor")
  if (!(await getProfile(user.id))) redirect("/investor/start")
  if (!(await termsCurrent(user.id))) redirect("/investor/accept-terms")
  const tabs = [["Profile", "/investor"], ["Find a fund", "/investor/funds"], ["My requests", "/investor/requests"]]
  return <div className="min-h-screen">
    <nav aria-label="Investor area" className="border-b"><div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3 text-sm">
      <span className="font-medium">Anker · Investor</span>
      {tabs.map(([l, h]) => <Link key={h} href={h} className="text-muted-foreground hover:text-foreground">{l}</Link>)}
      <span className="ml-auto text-muted-foreground">{user.email}</span>
    </div></nav>
    <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
  </div>
}
