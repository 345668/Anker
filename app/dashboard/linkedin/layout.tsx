import { requirePersona } from "@/lib/auth/persona-guard"

/** LinkedOut is available to every authenticated workspace persona. */
export default async function LinkedInLayout({ children }: { children: React.ReactNode }) {
  await requirePersona(["founder", "vc", "lp"])
  return children
}
