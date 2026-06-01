/**
 * At-rest encryption for sensitive fields (API keys, etc.).
 *
 * AES-256-GCM with a key derived from `SECRET_KEY` env var via scrypt.
 * Encrypted values are stored as `enc:<iv>:<tag>:<ciphertext>` (all hex).
 * If `SECRET_KEY` isn't set, we no-op (plaintext) and warn — fine for
 * local dev, but we strongly recommend setting it in production.
 *
 * The encrypt/decrypt functions are idempotent: calling encrypt() on an
 * already-encrypted value returns it unchanged; calling decrypt() on a
 * plaintext value returns it unchanged.
 */

import crypto from "node:crypto"

const PREFIX = "enc:v1:"

let _key: Buffer | null = null
let _warned = false

function getKey(): Buffer | null {
  if (_key) return _key
  const secret = process.env.SECRET_KEY
  if (!secret) {
    if (!_warned) {
      console.warn(
        "[secrets] SECRET_KEY not set — API keys will be stored as plaintext. Set SECRET_KEY in .env.local to enable AES-256-GCM at-rest encryption.",
      )
      _warned = true
    }
    return null
  }
  // Derive a 32-byte key from the secret with scrypt + a fixed salt.
  // Fixed salt is acceptable here because the secret itself is the entropy
  // source; per-row IVs ensure ciphertext uniqueness.
  _key = crypto.scryptSync(secret, "anker-settings-salt-v1", 32)
  return _key
}

export function encryptSecret(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === "") return null
  // Already encrypted? Return as-is.
  if (typeof plaintext === "string" && plaintext.startsWith(PREFIX)) return plaintext
  const key = getKey()
  if (!key) return plaintext // fall through to plaintext storage
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + iv.toString("hex") + ":" + tag.toString("hex") + ":" + ciphertext.toString("hex")
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return null
  if (typeof stored !== "string") return null
  if (!stored.startsWith(PREFIX)) return stored // plaintext (legacy or no key set)
  const key = getKey()
  if (!key) {
    console.warn("[secrets] decryptSecret called but SECRET_KEY isn't set — returning ciphertext")
    return null
  }
  // Stored form is `enc:v1:<iv>:<tag>:<data>` → 5 colon-separated parts.
  const parts = stored.split(":")
  if (parts.length < 5) return null
  const [, , ivHex, tagHex, dataHex] = parts
  if (!ivHex || !tagHex || !dataHex) return null
  try {
    const iv = Buffer.from(ivHex, "hex")
    const tag = Buffer.from(tagHex, "hex")
    const ciphertext = Buffer.from(dataHex, "hex")
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return plaintext.toString("utf8")
  } catch (e: any) {
    console.error("[secrets] Failed to decrypt — wrong key?", e?.message)
    return null
  }
}

/** Mask a secret for display: `sk-ant-…0000` keeps prefix + last 4. */
export function maskSecret(plaintext: string | null | undefined): string {
  if (!plaintext) return ""
  if (plaintext.length <= 8) return "•".repeat(plaintext.length)
  return plaintext.slice(0, 7) + "…" + plaintext.slice(-4)
}
