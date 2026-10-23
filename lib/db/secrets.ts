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

let _warned = false

/**
 * The keys in use. `SECRET_KEY` is current and is the only key that writes; `SECRET_KEY_PREVIOUS` (comma separated, newest first) are still accepted for reading, so a key can be
 * rotated without anything becoming unreadable (docs/architecture/74). Each key has a 4-byte id (the start of the SHA-256 of the derived key) written into new files.
 */
interface KeyEntry { id: Buffer; key: Buffer }
let _ring: { sig: string; current: KeyEntry | null; previous: KeyEntry[] } | null = null
const derive = (secret: string): KeyEntry => {
  // Derive a 32-byte key from the secret with scrypt + a fixed salt. The secret itself is the entropy source; per-row IVs make ciphertext unique.
  const key = crypto.scryptSync(secret, "anker-settings-salt-v1", 32)
  return { id: crypto.createHash("sha256").update(key).digest().subarray(0, 4), key }
}
function ring() {
  const cur = process.env.SECRET_KEY || "", prev = process.env.SECRET_KEY_PREVIOUS || "", sig = cur + "\u0000" + prev
  if (_ring && _ring.sig === sig) return _ring
  _ring = { sig, current: cur ? derive(cur) : null, previous: prev.split(",").map((x) => x.trim()).filter((x) => x && x !== cur).map(derive) }
  return _ring
}
function getKey(): Buffer | null {
  const r = ring()
  if (!r.current && !_warned) {
    console.warn("[secrets] SECRET_KEY not set — API keys will be stored as plaintext. Set SECRET_KEY in .env.local to enable AES-256-GCM at-rest encryption.")
    _warned = true
  }
  return r.current?.key ?? null
}
const allKeys = (): KeyEntry[] => { const r = ring(); return r.current ? [r.current, ...r.previous] : [] }

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
  const iv = Buffer.from(ivHex, "hex"), tag = Buffer.from(tagHex, "hex"), ciphertext = Buffer.from(dataHex, "hex")
  const tryKey = (k: Buffer): string | null => {
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", k, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
    } catch { return null }
  }
  for (const k of allKeys()) { const out = tryKey(k.key); if (out !== null) return out }
  console.error("[secrets] Failed to decrypt — wrong key?")
  return null
}

/** Which key reads a stored text secret: "current", "previous", "plain" (not encrypted) or "unreadable". Used by key rotation. */
export function secretKeyState(stored: string | null | undefined): "current" | "previous" | "plain" | "unreadable" {
  if (stored == null || stored === "") return "plain"
  if (!stored.startsWith(PREFIX)) return "plain"
  const parts = stored.split(":")
  if (parts.length < 5) return "unreadable"
  const iv = Buffer.from(parts[2], "hex"), tag = Buffer.from(parts[3], "hex"), data = Buffer.from(parts[4], "hex")
  const ks = allKeys()
  for (let i = 0; i < ks.length; i++) {
    try { const d = crypto.createDecipheriv("aes-256-gcm", ks[i].key, iv); d.setAuthTag(tag); Buffer.concat([d.update(data), d.final()]); return i === 0 ? "current" : "previous" } catch { /* next key */ }
  }
  return "unreadable"
}

/** Mask a secret for display: `sk-ant-…0000` keeps prefix + last 4. */
export function maskSecret(plaintext: string | null | undefined): string {
  if (!plaintext) return ""
  if (plaintext.length <= 8) return "•".repeat(plaintext.length)
  return plaintext.slice(0, 7) + "…" + plaintext.slice(-4)
}


// ── files ──────────────────────────────────────────────────────────────
/**
 * Encrypts a file's bytes (AES-256-GCM, same key as the text secrets). Layout, version 2: version byte 2, 4-byte key id, 12-byte IV, 16-byte tag, ciphertext. (Version 1, written
 * before keys could be rotated, has no key id: version byte 1, IV, tag, ciphertext; it is still read.) Unlike the text helpers this NEVER falls back to plaintext: identity
 * documents are not stored without a key.
 */
export function encryptBytes(plain: Buffer): Buffer {
  const cur = ring().current
  if (!cur) throw new Error("SECRET_KEY is not set: files cannot be stored encrypted")
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", cur.key, iv)
  const data = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([Buffer.from([2]), cur.id, iv, cipher.getAuthTag(), data])
}

const open = (key: Buffer, iv: Buffer, tag: Buffer, data: Buffer): Buffer | null => {
  try { const d = crypto.createDecipheriv("aes-256-gcm", key, iv); d.setAuthTag(tag); return Buffer.concat([d.update(data), d.final()]) } catch { return null }
}
export function decryptBytes(stored: Buffer): Buffer | null {
  const ks = allKeys()
  if (!ks.length || stored.length < 30) return null
  if (stored[0] === 2 && stored.length >= 34) {
    const id = stored.subarray(1, 5), k = ks.find((x) => x.id.equals(id))
    return k ? open(k.key, stored.subarray(5, 17), stored.subarray(17, 33), stored.subarray(33)) : null
  }
  if (stored[0] !== 1) return null
  for (const k of ks) { const out = open(k.key, stored.subarray(1, 13), stored.subarray(13, 29), stored.subarray(29)); if (out) return out }
  return null
}
/** Whether a stored file is already in the current format under the current key. Used by key rotation. */
export function bytesKeyState(stored: Buffer): "current" | "old" | "unreadable" {
  const cur = ring().current
  if (cur && stored[0] === 2 && stored.length >= 34 && stored.subarray(1, 5).equals(cur.id)) return decryptBytes(stored) ? "current" : "unreadable"
  return decryptBytes(stored) ? "old" : "unreadable"
}
