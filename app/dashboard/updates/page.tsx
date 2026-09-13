import { UpdateBuilder } from "@/components/updates/update-builder"
import { requirePersona } from "@/lib/auth/persona-guard"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Investor Updates — Anker",
  description: "Compose founder→investor updates, recommend recipients, send, and track opens.",
}

export default async function UpdatesPage() {
  await requirePersona(["founder"])
  return <UpdateBuilder />
}
