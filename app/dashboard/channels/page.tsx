/** /dashboard/channels — connect Anker to messaging apps (docs/architecture/57). */
import { TelegramCard } from "@/components/channels/telegram-card"

export const dynamic = "force-dynamic"
export const metadata = { title: "Connected channels — Anker" }

export default function ChannelsPage() {
  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl">Connected channels</h1>
      <p className="mt-2 mb-6 max-w-2xl text-sm text-muted-foreground">Use Anker from the apps you already have on your phone. Every connection is tied to you and to this workspace, and you can disconnect it here at any time.</p>
      <TelegramCard />
    </div>
  )
}
