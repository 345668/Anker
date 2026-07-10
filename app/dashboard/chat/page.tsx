/**
 * /dashboard/chat — merged into the unified assistant (July 2026).
 * The advisor chat and the tool-running agent are one surface now.
 */
import { redirect } from "next/navigation"

export default function ChatPage() {
  redirect("/dashboard/assistant")
}
