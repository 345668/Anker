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
 * Fetch a private Blob object by pathname and return its bytes. Mirrors the
 * /api/artifacts/[file] read path: get() first, head()+downloadUrl fallback.
 * Returns null when Blob isn't configured or the object can't be read.
 */
export async function readBlobBytes(pathname: string): Promise<Buffer | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token && !process.env.VERCEL) return null
  try {
    const blob = await import("@vercel/blob")
    // Prefer a direct get() when available.
    if (typeof (blob as any).get === "function") {
      try {
        const r: any = await (blob as any).get(pathname, { token })
        if (r?.body) {
          const ab = await new Response(r.body).arrayBuffer()
          return Buffer.from(ab)
        }
      } catch {
        // fall through to head()+downloadUrl
      }
    }
    if (typeof (blob as any).head === "function") {
      const meta: any = await (blob as any).head(pathname, { token })
      const url = meta?.downloadUrl || meta?.url
      if (url) {
        const res = await fetch(url)
        if (res.ok) return Buffer.from(await res.arrayBuffer())
      }
    }
  } catch (e: any) {
    console.warn("[campaign/readBlobBytes] failed:", e?.message ?? e)
  }
  return null
}
