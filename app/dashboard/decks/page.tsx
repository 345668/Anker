/**
 * /dashboard/decks — Deck template catalog.
 *
 * Server component: reads the catalog from the DB and hands it to
 * <DecksCatalog> for browsing / classification. When a template is
 * classified into a real deck type, the "Build a deck" button in the
 * card is enabled and the AI-mapping flow kicks off (Phase 2).
 */
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { listTemplates, countByDeckType, hasTemplatesTable, DECK_TYPE_LABELS, type DeckType } from "@/lib/decks/templates"
import { DecksPowerhouse, type MyDeckRow } from "@/components/decks/decks-powerhouse"
import { listDecks } from "@/lib/decks/decks"
import { sql } from "@/lib/db"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Decks — Anker",
  description: "Browse Figma deck templates, classify them by deck type, and build AI-filled decks from your fund context.",
}

export default async function DecksCatalogPage({ searchParams }: { searchParams: Promise<{ type?: string; q?: string; only?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const migrated = await hasTemplatesTable()
  const params = await searchParams
  const deckType: DeckType | "all" = (params.type as any) || "all"
  const q = params.q || ""
  const only = params.only || ""
  const templates = migrated ? await listTemplates({
    deckType: deckType === "all" ? "all" : deckType as DeckType,
    shortlistedOnly: only === "shortlisted",
    favoritesOnly:   only === "favorites",
    q,
  }) : []
  const counts = migrated ? await countByDeckType() : {} as any

  if (!migrated) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">!</div>
        <h2 className="text-xl font-semibold text-neutral-900">Migration needed</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Run <code className="rounded bg-neutral-100 px-1.5 py-0.5">scripts/migrations/2026-07-05-deck-builder.sql</code>, then
          <code className="rounded bg-neutral-100 px-1.5 py-0.5">scripts/oneshot/seed-deck-templates.mjs</code>.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-neutral-900 p-4 text-left text-xs text-neutral-100">
NEON_DATABASE_URL='…' node scripts/oneshot/run-migration.mjs scripts/migrations/2026-07-05-deck-builder.sql
NEON_DATABASE_URL='…' node scripts/oneshot/seed-deck-templates.mjs
        </pre>
      </div>
    )
  }

  // My decks — join template + fund names for the list.
  const decks = await listDecks(user.id)
  let myDecks: MyDeckRow[] = []
  if (decks.length) {
    const tplIds = Array.from(new Set(decks.map((d) => d.templateId)))
    const fundIds = Array.from(new Set(decks.map((d) => d.fundId).filter(Boolean))) as string[]
    const [tplRows, fundRows] = await Promise.all([
      sql`SELECT id, name, file_key, deck_type FROM deck_templates WHERE id = ANY(${tplIds}::uuid[])` as Promise<any[]>,
      fundIds.length ? (sql`SELECT id, name FROM funds WHERE id = ANY(${fundIds})` as Promise<any[]>) : Promise.resolve([] as any[]),
    ])
    const tplById = new Map(tplRows.map((r) => [r.id, r]))
    const fundById = new Map(fundRows.map((r) => [r.id, r.name]))
    myDecks = decks.map((d) => {
      const t = tplById.get(d.templateId)
      return {
        id: d.id,
        status: d.status,
        templateName: t?.name || `Template ${String(t?.file_key ?? "").slice(-6)}`,
        deckType: t?.deck_type ?? "deck",
        fundName: d.fundId ? (fundById.get(d.fundId) ?? null) : null,
        workspaceFileUrl: d.workspaceFileUrl,
        lastFilledAt: d.lastFilledAt,
        updatedAt: d.updatedAt,
      }
    })
  }

  return (
    <DecksPowerhouse
      templates={templates} counts={counts} activeType={deckType}
      q={q} only={only} typeLabels={DECK_TYPE_LABELS} myDecks={myDecks}
    />
  )
}
