import { redirect } from "next/navigation"

// Preserve query params (notably ?invite=…) across the redirect — dropping
// them broke shared invite links.
export default async function RegisterRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value)
    else if (Array.isArray(value) && value[0]) qs.set(key, value[0])
  }
  const suffix = qs.toString()
  redirect(suffix ? `/auth/sign-up?${suffix}` : "/auth/sign-up")
}
