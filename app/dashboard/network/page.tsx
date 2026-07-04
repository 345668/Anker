/**
 * /dashboard/network — the user's LinkedIn network.
 *
 * Populated by the Anker Chrome extension's "My Connections" capture
 * (see extensions/linkedin/src/contents/connections.tsx). This page has
 * two tabs, rendered client-side by <NetworkClient>:
 *
 *   1. List  — an Excel-style table with search / firm filter / sort.
 *   2. Galaxy — an interactive SVG force-directed graph, nodes coloured
 *      by firm cluster, with pan + zoom, hover halos, and click-to-open
 *      LinkedIn. CRM matches (people already in your outreach pipeline)
 *      get a distinct halo so you can see how many of your existing CRM
 *      targets you already know personally.
 *
 * Both views share a single data pull: listConnections(userId) + a
 * lightweight join against crm_entries.display_linkedin for the overlay
 * flag. Everything is progressive: an empty state points at the
 * extension when the DB has no rows yet.
 */
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { sql } from "@/lib/db"
import { listConnections, connectionCount, hasConnectionsTable } from "@/lib/network/connections"
import { NetworkClient, type NetworkNode } from "@/components/network/network-client"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Network — Anker",
  description: "Your LinkedIn 1st-degree connections, viewed as a table or as a Galaxy graph clustered by firm.",
}

export default async function NetworkPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const migrated = await hasConnectionsTable()
  const connections = migrated ? await listConnections(user.id) : []
  const total = migrated ? await connectionCount(user.id) : 0

  // Lightweight overlay: which of these people appear in the user's CRM
  // outreach pipeline. We match on the LinkedIn profile URL, normalised
  // to lower-case and stripped of trailing slashes / query strings.
  const crmSlugs = await loadCrmProfileSlugs(user.id)

  const nodes: NetworkNode[] = connections.map((c) => ({
    id: c.id,
    slug: c.profileSlug,
    url: c.profileUrl,
    name: c.fullName || c.profileSlug,
    headline: c.headline || null,
    firm: c.firm || parseFirmFromHeadline(c.headline),
    imageUrl: c.imageUrl,
    location: c.location,
    connectedAt: c.connectedAt,
    lastSeen: c.lastSeen,
    inCrm: crmSlugs.has(c.profileSlug.toLowerCase()),
  }))

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-[1400px] px-6 py-5">
          <div className="flex items-center justify-between gap-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Network</h1>
              <p className="mt-1 text-sm text-neutral-600">
                Your 1st-degree LinkedIn connections, captured via the Anker Chrome extension.
              </p>
            </div>
            <div className="text-right text-sm text-neutral-600">
              <div className="font-semibold text-neutral-900">{total.toLocaleString()}</div>
              <div className="text-xs uppercase tracking-wide text-neutral-500">Connections</div>
            </div>
          </div>
        </div>
      </header>

      {!migrated ? (
        <MigrationRequired />
      ) : nodes.length === 0 ? (
        <EmptyState />
      ) : (
        <NetworkClient nodes={nodes} />
      )}
    </div>
  )
}

// ─── overlays ─────────────────────────────────────────────────────────

/**
 * Load the LinkedIn profile slugs the user already has in their CRM
 * (crm_entries.display_linkedin). Fast — one query, keyed by user_id.
 * We only need the profile slug (the "abcd-efgh" bit of /in/<slug>) so
 * the join is stable across query params and http/https.
 */
async function loadCrmProfileSlugs(userId: string): Promise<Set<string>> {
  const s = new Set<string>()
  try {
    const rows: any[] = await sql`
      SELECT display_linkedin FROM crm_entries
       WHERE user_id = ${userId}::uuid
         AND display_linkedin IS NOT NULL
         AND display_linkedin <> ''`
    for (const r of rows) {
      const slug = extractProfileSlug(r.display_linkedin)
      if (slug) s.add(slug.toLowerCase())
    }
  } catch {
    // display_linkedin column may not exist on some deployments — treat
    // as "no overlay" rather than blowing up the page.
  }
  return s
}

function extractProfileSlug(url: string): string | null {
  const m = String(url).match(/linkedin\.com\/in\/([^/?#]+)/i)
  return m ? decodeURIComponent(m[1]) : null
}

function parseFirmFromHeadline(headline: string | null): string | null {
  if (!headline) return null
  // "Title at Firm" is by far the most common LinkedIn headline shape.
  const m = headline.match(/\s+at\s+(.+?)(?:\s*[|·—-]\s*|$)/i)
  return m ? m[1].trim() : null
}

// ─── empty / migration states ─────────────────────────────────────────

function MigrationRequired() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">!</div>
      <h2 className="text-xl font-semibold text-neutral-900">Migration needed</h2>
      <p className="mt-2 text-sm text-neutral-600">
        The <code className="rounded bg-neutral-100 px-1.5 py-0.5">linkedin_connections</code> table hasn't been created yet.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-lg bg-neutral-900 p-4 text-left text-xs text-neutral-100">
NEON_DATABASE_URL='…' node scripts/oneshot/run-linkedin-connections-table.mjs
      </pre>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700">◎</div>
      <h2 className="text-xl font-semibold text-neutral-900">No connections captured yet</h2>
      <p className="mt-2 text-sm text-neutral-600">
        Install the Anker Chrome extension and use <b>My Connections → Open My Connections</b> to
        sync your 1st-degree LinkedIn graph. Once captured, you'll see them here as a table and
        as an interactive Galaxy view clustered by firm.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <a href="/dashboard/settings/extension-tokens"
           className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">
          Get extension token
        </a>
        <a href="/docs/linkedin-extension"
           className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-50">
          Installation guide
        </a>
      </div>
    </div>
  )
}
