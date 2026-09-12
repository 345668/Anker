import { redirect } from "next/navigation"
import { requirePersona } from "@/lib/auth/persona-guard"
export default async function LegacyDealsPage() {
  await requirePersona(["vc"])
  redirect("/dashboard/portfolio")
}
