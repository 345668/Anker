import { redirect } from "next/navigation"
export default async function EarlyAccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const input = await searchParams
  const query = new URLSearchParams()
  for (const key of ["source", "utm_source", "utm_medium", "utm_campaign"]) {
    const value = input[key]
    if (typeof value === "string") query.set(key, value.slice(0, 200))
  }
  redirect(`/waitlist${query.size ? `?${query}` : ""}`)
}
