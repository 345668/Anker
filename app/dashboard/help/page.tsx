import { helpFor } from "@/lib/help/articles"
import { HelpHome } from "@/components/help/help-home"

export const metadata = { title: "Help | Anker" }

export default async function HelpPage() {
  const { articles, persona } = await helpFor()
  return <HelpHome articles={articles} persona={persona} />
}
