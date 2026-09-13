import { redirect } from "next/navigation"
import { requirePersona } from "@/lib/auth/persona-guard"

/** The canonical CRM enforces personal ownership on every query and mutation. */
export default async function LegacyContactsPage() {
  await requirePersona(["founder", "vc"])
  redirect("/dashboard/crm")
}
