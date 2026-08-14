import { notFound } from "next/navigation"
import { verifyAccessGrant, listFounderDocuments } from "@/lib/portfolio/data-room"
import { RoomSections, type RoomDoc } from "@/components/dataroom/room-sections"

export const dynamic = "force-dynamic"
export const metadata = { title: "Data room — Anker", robots: { index: false, follow: false } }

/**
 * /room/[token] — tokenized, read-only investor view of a founder's raise room.
 * No account required (§11 decision 2). Watermarked with the grantee email;
 * every open is view-tracked via the token file route.
 */
export default async function InvestorRoomPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const grant = await verifyAccessGrant(token)
  if (!grant) notFound()

  const documents = await listFounderDocuments(grant.company_id)
  const docs: RoomDoc[] = documents.map((d) => ({
    id: d.id, title: d.title, section: d.section, item_key: d.item_key, category: d.category,
    fund_id: d.fund_id, fund_lp_id: d.fund_lp_id, file_name: d.file_name,
    byte_size: d.byte_size, created_at: d.created_at, description: d.description,
  }))

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      {/* Watermark overlay */}
      {grant.watermark && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-[0.05] select-none">
          <div className="absolute inset-0 flex flex-wrap gap-x-16 gap-y-24 -rotate-45 scale-150 content-center justify-center">
            {Array.from({ length: 60 }).map((_, i) => (
              <span key={i} className="text-sm font-mono whitespace-nowrap">{grant.grantee_email} · confidential</span>
            ))}
          </div>
        </div>
      )}

      <header className="relative z-10 border-b border-foreground/10 bg-background/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-foreground text-background grid place-items-center text-xs font-mono font-bold">A</div>
            <div>
              <div className="font-display text-base tracking-tight">Data room</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Confidential · shared with {grant.grantee_email}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 max-w-6xl mx-auto px-6 lg:px-10 py-8 lg:py-10">
        <RoomSections docs={docs} room="founder" fileHrefFor={(id) => `/room/${token}/file/${id}`} requestToken={token} />
      </div>
    </main>
  )
}
