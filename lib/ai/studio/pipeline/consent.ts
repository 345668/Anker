import { randomUUID } from "node:crypto"
import { z } from "zod"
import { sql } from "@/lib/db"
import type { AiPrincipal } from "@/lib/assistant/context"
import { WorkspaceError } from "@/lib/auth/workspace-context"

/** Bump when the attestation wording changes: a stored consent keeps the version it was given under. */
export const CONSENT_VERSION = "2026-10-11"

const sha = z.string().regex(/^[a-f0-9]{64}$/, "Expected a SHA-256 hex digest.")

/** Every statement must be true. There is no partial consent. */
export const consentSchema = z
  .object({
    statementVersion: z.literal(CONSENT_VERSION),
    attest: z
      .object({
        ownsOrMayUseSource: z.literal(true),
        everyPersonInSourceAgreed: z.literal(true),
        everyReferenceIdentityAgreed: z.literal(true),
        noPublicFigureOrMinor: z.literal(true),
        understandsProvenance: z.literal(true),
      })
      .strict(),
    /** Who is in the footage and who the replacement identities are, in the person's own words. */
    subjects: z.string().trim().min(3).max(500),
    sourceSha256: sha,
    referenceSha256: z.array(sha).min(1).max(4),
    /** The voice will be altered (pitch shifted). The same consent covers it; the provenance record says so. */
    voiceAltered: z.boolean().default(false),
  })
  .strict()
export type ConsentInput = z.infer<typeof consentSchema>

export function assertCanCreate(p: AiPrincipal) {
  if (p.readonly || !p.canWrite) throw new WorkspaceError("Your role does not allow media generation.", 403)
}

/** Stores the attestation with who gave it, for which exact files, and when. Returns its id. */
export async function recordConsent(p: AiPrincipal, raw: unknown): Promise<{ id: string }> {
  assertCanCreate(p)
  const c = consentSchema.parse(raw)
  const id = randomUUID()
  await sql`INSERT INTO ai_studio_consents (id, user_id, scope_key, org_id, statement_version, source_sha256, reference_sha256, subjects, voice_altered)
    VALUES (${id}, ${p.userId}, ${p.scopeKey}, ${p.orgId}, ${c.statementVersion}, ${c.sourceSha256}, ${c.referenceSha256}, ${c.subjects}, ${c.voiceAltered})`
  return { id }
}
