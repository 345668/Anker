import type { Metadata } from "next"
import { NetworkGraphContent } from "@/components/tesseract/network-graph-content"
import { requirePersona } from "@/lib/auth/persona-guard"

export const metadata: Metadata = {
  title: "Network | Anker",
  description: "Your LinkedIn relationship web — contacts, connections, and warm-intro paths.",
}

export default async function NetworkPage() {
  await requirePersona(["founder", "vc"])
  return <NetworkGraphContent />
}
