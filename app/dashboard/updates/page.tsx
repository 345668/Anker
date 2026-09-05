import { UpdateBuilder } from "@/components/updates/update-builder"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Investor Updates — Anker",
  description: "Compose founder→investor updates, recommend recipients, send, and track opens.",
}

export default function UpdatesPage() {
  return <UpdateBuilder />
}
