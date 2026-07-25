/**
 * Small shared utilities for the founder campaign engine: stage mapping,
 * campaign-owner resolution, and reading a submission's private Blob back.
 */
import { sql } from "@/lib/db"
import { ADMIN_EMAILS } from "@/lib/auth/admin"
import type { StartupStage } from "@/lib/matching/v2/founder-types"

/** Map the free-text stage captured on the public form to the engine's enum. */
export function toStartupStage(raw: string | null | undefined): StartupStage {
  const s = (raw || "").toLowerCase().replace(/[\s_]+/g, "-")
  if (s.startsWith("pre")) return "pre-seed"
  if (s.startsWith("seed")) return "seed"
  if (s.includes("series-a") || s === "a") return "series-a"
  if (s.includes("series-b") || s === "b") return "series-b"
  if (s.includes("growth") || s.includes("series-c") || s.includes("late")) return "series-b"
  return "seed" // sensible default
}

/**
 * Owner user_id for engine-created outreach campaigns, so they surface in the
 * right person's Outreach tab. Priority: env override → an admin's Supabase
 * auth user id → "system". Best-effort; never throws.
 */
export async function resolveCampaignOwner(): Promise<string> {
  const envId = process.env.CAMPAIGN_OWNER_USER_ID?.trim()
  if (envId) return envId
  try {
    if (ADMIN_EMAILS.length) {
      const rows = await sql`
        SELECT id FROM auth.users
        WHERE lower(email) = ANY(${ADMIN_EMAILS.map((e) => e.toLowerCase())}::text[])
        ORDER BY created_at ASC
        LIMIT 1
      `
      if (rows.length && rows[0].id) return String(rows[0].id)
    }
  } catch {
    // auth.users not reachable in this context — fall through
  }
  return "system"
}

/**
 * Fetch a private Blob object and return its bytes. Accepts EITHER a full blob
 * URL or a pathname (older rows stored the pathname). The Vercel Blob SDK's
 * head()/get() require the full URL — passing a pathname fails with "Access
 * denied" — so for a pathname we resolve the object via list({prefix}) to get
 * its signed downloadUrl. Returns null when Blob isn't configured or the object
 * can't be read.
 */
export async function readBlobBytes(ref: string): Promise<Buffer | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!ref || !token) return null // private download requires the token
  try {
    const blob = await import("@vercel/blob")
    let url: string | null = null

    if (/^https?:\/\//.test(ref)) {
      url = ref // already a full blob URL (new rows store this)
    } else {
      // Older rows stored the pathname — resolve to the object's URL.
      const { blobs } = await (blob as any).list({ prefix: ref, token, limit: 1 })
      url = blobs?.[0]?.url ?? null
    }
    if (!url) return null

    // Private blob stores serve the object only with the token as a Bearer
    // header — the list/head downloadUrl is NOT publicly fetchable here (403).
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    console.warn("[campaign/readBlobBytes] fetch not ok:", res.status, ref)
  } catch (e: any) {
    console.warn("[campaign/readBlobBytes] failed:", e?.message ?? e)
  }
  return null
}
