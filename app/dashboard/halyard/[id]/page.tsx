import { requirePersona } from "@/lib/auth/persona-guard"
import { LiveRoom } from "@/components/halyard/live-room"

export const dynamic = "force-dynamic"
export const metadata = { title: "Halyard session — Anker" }

export default async function HalyardSessionPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePersona(["founder", "vc"])
  return <LiveRoom id={(await params).id} />
}
