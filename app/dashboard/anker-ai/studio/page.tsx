import { AnkerAiPage } from "@/components/anker-ai/anker-ai-page"
export const dynamic = "force-dynamic"
export const metadata = {
  title: "Anker AI — Image & Video",
  description: "Create private images and short videos for pitches, updates and campaigns.",
}
export default function StudioPage() {
  return <AnkerAiPage studio />
}
