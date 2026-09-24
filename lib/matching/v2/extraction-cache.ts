/**
 * Extract a document once (docs/architecture/21 §2).
 *
 * A deck's extraction is a pure function of its bytes and the extractor, and
 * it was being recomputed on every run. Because the semantic query vector is
 * built from the prose the model writes — oneLiner, description,
 * thesisKeywords, pitchDeckSummary — two runs of the same deck scored the
 * whole directory differently and produced two different shortlists.
 *
 * The cache is scoped to the workspace: a deck is confidential, so two
 * workspaces holding the same file never share an entry.
 *
 * It never fails the request. A read or write that throws is logged and
 * skipped, and extraction runs as it always did.
 */
import { createHash } from "node:crypto"
import { sql } from "@/lib/db"

/**
 * Bump when the prompt or the field set changes: the version is part of the
 * key, so stale output is never served and nothing has to be deleted.
 */
export const EXTRACTOR_VERSION = "2026-09-24"

export type ExtractionKind = "startup" | "fund"

export interface CacheScope {
  orgId: string | null | undefined
}

/** sha256 of the document's bytes — base64 or a Buffer, same answer either way. */
export function documentHash(input: string | Buffer): string {
  const bytes = typeof input === "string" ? Buffer.from(input, "base64") : input
  return createHash("sha256").update(bytes).digest("hex")
}

export interface CacheHit<T> {
  fields: T
  cached: true
  model: string | null
  extractedAt: string
}

/**
 * Run `extract` unless this workspace has already extracted these exact bytes
 * with this extractor version.
 *
 * Returns what was produced plus whether it came from the cache, so a caller
 * can report which extraction a run used.
 */
export async function extractOnce<T extends object>(
  args: {
    scope: CacheScope
    hash: string
    kind: ExtractionKind
    /** Recorded as provenance; deliberately not part of the key. */
    model?: string | null
  },
  extract: () => Promise<T>,
): Promise<{ fields: T; cached: boolean; extractedAt: string | null }> {
  const orgId = args.scope.orgId?.trim()
  if (!orgId) {
    // No workspace, no cache — an anonymous extraction has nowhere safe to live.
    return { fields: await extract(), cached: false, extractedAt: null }
  }

  try {
    const [row] = await sql`
      SELECT fields, created_at FROM document_extractions
       WHERE org_id = ${orgId} AND doc_hash = ${args.hash} AND kind = ${args.kind}
         AND version = ${EXTRACTOR_VERSION} AND expires_at > now()
       LIMIT 1`
    if (row?.fields) {
      return { fields: row.fields as T, cached: true, extractedAt: new Date(row.created_at).toISOString() }
    }
  } catch (e: any) {
    console.warn("[extraction-cache] read failed, extracting fresh:", e?.message ?? e)
  }

  const fields = await extract()

  try {
    await sql`
      INSERT INTO document_extractions (org_id, doc_hash, kind, version, fields, model)
      VALUES (${orgId}, ${args.hash}, ${args.kind}, ${EXTRACTOR_VERSION}, ${JSON.stringify(fields)}::jsonb, ${args.model ?? null})
      ON CONFLICT (org_id, doc_hash, kind, version) DO NOTHING`
  } catch (e: any) {
    console.warn("[extraction-cache] write failed, continuing:", e?.message ?? e)
  }
  return { fields, cached: false, extractedAt: new Date().toISOString() }
}

/** Forget one document's extraction — used when a founder says the read is wrong. */
export async function forgetExtraction(scope: CacheScope, hash: string, kind: ExtractionKind): Promise<number> {
  const orgId = scope.orgId?.trim()
  if (!orgId) return 0
  const rows = await sql`
    DELETE FROM document_extractions
     WHERE org_id = ${orgId} AND doc_hash = ${hash} AND kind = ${kind}
     RETURNING id`
  return (rows as any[]).length
}
