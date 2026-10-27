import { requirePersona } from "@/lib/auth/persona-guard"
import { HalyardHome } from "@/components/halyard/halyard-home"

export const dynamic = "force-dynamic"
export const metadata = { title: "Halyard — Anker", description: "A silent copilot for your live calls: transcript, suggestions and notes, with the permission of everyone on the call." }

export default async function HalyardPage() {
  await requirePersona(["founder", "vc"])
  return <HalyardHome />
}
