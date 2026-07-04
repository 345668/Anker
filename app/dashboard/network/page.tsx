import type { Metadata } from "next"
import { NetworkGraphContent } from "@/components/tesseract/network-graph-content"

export const metadata: Metadata = {
  title: "Network | Anker",
  description: "Your LinkedIn relationship web — contacts, connections, and warm-intro paths.",
}

export default function NetworkPage() {
  return <NetworkGraphContent />
}
