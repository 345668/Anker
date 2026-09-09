import { redirect } from "next/navigation"
import { safeAuthDestination } from "@/lib/auth/destination"

export default async function LoginRedirect({ searchParams }: {
  searchParams: Promise<{ next?: string; redirect?: string }>
}) {
  const params = await searchParams
  const value = params.next || params.redirect
  const destination = typeof value === "string" ? safeAuthDestination(value) : null
  redirect(destination ? `/auth/login?next=${encodeURIComponent(destination)}` : "/auth/login")
}
