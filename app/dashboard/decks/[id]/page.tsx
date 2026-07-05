import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { sql } from "@/lib/db"
import { getDeck } from "@/lib/decks/decks"
import { DeckDetail } from "@/components/decks/deck-detail"

export const dynamic = "force-dynamic"

export default async function DeckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")
  const { id } = await params
  const deck = await getDeck(id, user.id)
  if (!deck) notFound()
  const rows: any[] = await sql`SELECT * FROM deck_templates WHERE id = ${deck.templateId}::uuid LIMIT 1`
  const template = rows[0] ?? null
  let funds: any[] = []
  try {
    funds = await sql`SELECT id, name FROM funds ORDER BY name LIMIT 200`
  } catch {}
  return <DeckDetail deck={deck} template={template} funds={funds} />
}
