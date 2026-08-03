import { redirect } from "next/navigation"

/** /register → /auth/sign-up, forwarding the private ?invite= token. */
export default async function RegisterRedirect({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>
}) {
  const sp = await searchParams
  const invite = typeof sp?.invite === "string" ? sp.invite : ""
  redirect(invite ? `/auth/sign-up?invite=${encodeURIComponent(invite)}` : "/auth/sign-up")
}
