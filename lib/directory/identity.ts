/**
 * Keyed identity hashes for directory people (docs/architecture/54, D2). A tombstone keeps only these, so an erased person cannot be re-imported or re-contacted
 * and nothing in the table reveals who they were. HMAC-SHA-256 with a platform secret: without the key an address cannot be confirmed by guessing.
 * Pure (no database), so importers can use it directly.
 */
import { createHmac } from "node:crypto"

export const CANARY_INPUT = "directory-hash-canary-v1"

/** The key for the hashes: DIRECTORY_HASH_KEY, else the platform SECRET_KEY. */
export function hashKey(env: Record<string, string | undefined> = process.env): string {
  const k = env.DIRECTORY_HASH_KEY || env.SECRET_KEY
  if (!k) throw new Error("No hash key: set DIRECTORY_HASH_KEY or SECRET_KEY.")
  return k
}

export const normEmail = (e: string | null | undefined): string => (e ?? "").trim().toLowerCase()

/** The in/<slug> of a LinkedIn profile URL; null for anything else (a company page, a search URL). */
export function linkedinSlug(url: string | null | undefined): string | null {
  const m = String(url ?? "").match(/linkedin\.com\/in\/([^/?#\s]+)/i)
  if (!m) return null
  let s = m[1]
  try { s = decodeURIComponent(s) } catch { /* keep raw */ }
  s = s.toLowerCase().replace(/\/+$/, "")
  return s ? `in/${s}` : null
}

const h = (key: string, kind: string, value: string) => createHmac("sha256", key).update(`${kind}:${value}`).digest("hex")

export function hashEmail(email: string | null | undefined, key = hashKey()): string | null {
  const e = normEmail(email)
  return e.includes("@") ? h(key, "email", e) : null
}
export function hashLinkedIn(url: string | null | undefined, key = hashKey()): string | null {
  const s = linkedinSlug(url)
  return s ? h(key, "li", s) : null
}
export function canaryHash(key = hashKey()): string { return h(key, "canary", CANARY_INPUT) }

export interface Identity { email: string | null; linkedinUrl?: string | null; personLinkedinUrl?: string | null }
export function identityHashes(i: Identity, key = hashKey()): { emailHash: string | null; linkedinHashes: string[] } {
  const li = [...new Set([hashLinkedIn(i.linkedinUrl, key), hashLinkedIn(i.personLinkedinUrl, key)].filter((x): x is string => !!x))]
  return { emailHash: hashEmail(i.email, key), linkedinHashes: li }
}
