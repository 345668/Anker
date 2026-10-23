import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import crypto from "node:crypto"

const state = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, values: unknown[]) => state.query(q, values) }) }))

import { encryptBytes, decryptBytes, encryptSecret, decryptSecret, bytesKeyState, secretKeyState } from "./secrets"
import { rotateKeys } from "./key-rotation"

const OLD = "the-old-secret-key", NEW = "the-new-secret-key", OLDER = "an-even-older-key"
const useKeys = (current: string, previous = "") => { process.env.SECRET_KEY = current; if (previous) process.env.SECRET_KEY_PREVIOUS = previous; else delete process.env.SECRET_KEY_PREVIOUS }
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex")
/** A file as written before keys could be rotated: version 1, no key id. */
function v1(plain: Buffer, secret: string): Buffer {
  const key = crypto.scryptSync(secret, "anker-settings-salt-v1", 32), iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key, iv)
  const data = Buffer.concat([c.update(plain), c.final()])
  return Buffer.concat([Buffer.from([1]), iv, c.getAuthTag(), data])
}

describe("keys that rotate", () => {
  it("reads old files and secrets through the previous key, writes new ones under the current, and picks the key by id", () => {
    useKeys(OLD)
    const oldFile = encryptBytes(Buffer.from("old file")), oldText = encryptSecret("old secret")!, legacy = v1(Buffer.from("legacy"), OLD)
    useKeys(NEW, OLD)
    expect(decryptBytes(oldFile)!.toString()).toBe("old file"); expect(decryptSecret(oldText)).toBe("old secret"); expect(decryptBytes(legacy)!.toString()).toBe("legacy")
    const fresh = encryptBytes(Buffer.from("new file"))
    expect(fresh[0]).toBe(2); expect(bytesKeyState(fresh)).toBe("current"); expect(bytesKeyState(oldFile)).toBe("old"); expect(bytesKeyState(legacy)).toBe("old")
    expect(secretKeyState(encryptSecret("x"))).toBe("current"); expect(secretKeyState(oldText)).toBe("previous"); expect(secretKeyState("plain value")).toBe("plain")
    useKeys(NEW)                                                                                          // the old key retired
    expect(decryptBytes(oldFile)).toBeNull(); expect(decryptSecret(oldText)).toBeNull(); expect(decryptBytes(fresh)!.toString()).toBe("new file")
    expect(bytesKeyState(oldFile)).toBe("unreadable"); expect(secretKeyState(oldText)).toBe("unreadable")
  })
  it("keeps a chain of previous keys readable, and a tampered file unreadable", () => {
    useKeys(OLDER); const a = encryptBytes(Buffer.from("a")); useKeys(OLD, OLDER); const b = encryptBytes(Buffer.from("b")); useKeys(NEW, `${OLD},${OLDER}`)
    expect(decryptBytes(a)!.toString()).toBe("a"); expect(decryptBytes(b)!.toString()).toBe("b")
    const bad = Buffer.from(b); bad[bad.length - 1] ^= 1
    expect(decryptBytes(bad)).toBeNull()
    expect(() => { delete process.env.SECRET_KEY; encryptBytes(Buffer.from("x")) }).toThrow(/SECRET_KEY/)           // still no plaintext fallback for files
  })
})

describe("the rotation job", () => {
  let db: PGlite
  const rows = async (q: string, v: unknown[] = []) => (await db.query<any>(q, v)).rows
  beforeAll(async () => {
    db = new PGlite()
    state.query.mockImplementation(async (q, values) => (await db.query(q, values)).rows)
    await db.exec(`CREATE TABLE passport_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_enc bytea NOT NULL, sha256 text NOT NULL);
      CREATE TABLE kyc_document_files(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_enc bytea NOT NULL, sha256 text NOT NULL);
      CREATE TABLE relationship_attachments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_enc bytea NOT NULL, sha256 text NOT NULL);
      CREATE TABLE lp_verification(lp_id text PRIMARY KEY, owners_enc text);
      CREATE TABLE lp_onboarding_details(lp_id text PRIMARY KEY, tax_id_enc text);`)
  })
  afterAll(async () => db.close())
  beforeEach(async () => { await db.exec("DELETE FROM passport_documents; DELETE FROM kyc_document_files; DELETE FROM relationship_attachments; DELETE FROM lp_verification; DELETE FROM lp_onboarding_details") })

  async function seed() {
    useKeys(OLD)
    const f1 = Buffer.from("passport-bytes"), f2 = Buffer.from("kyc-bytes"), f3 = Buffer.from("attachment-bytes")
    await db.query("INSERT INTO passport_documents (content_enc, sha256) VALUES ($1,$2), ($3,$4), ('\\x'::bytea, 'wiped')", [encryptBytes(f1), sha(f1), v1(Buffer.from("legacy-bytes"), OLD), sha(Buffer.from("legacy-bytes"))])
    await db.query("INSERT INTO kyc_document_files (content_enc, sha256) VALUES ($1,$2)", [encryptBytes(f2), sha(f2)])
    await db.query("INSERT INTO relationship_attachments (content_enc, sha256) VALUES ($1,$2)", [encryptBytes(f3), sha(f3)])
    await db.query("INSERT INTO lp_verification VALUES ('lp1', $1), ('lp2', NULL)", [encryptSecret("Owner A 60%, Owner B 40%")])
    await db.query("INSERT INTO lp_onboarding_details VALUES ('lp1', $1), ('lp2', 'plain-legacy')", [encryptSecret("DE123456789")])
    useKeys(NEW, OLD)
  }

  it("dry run counts and changes nothing; the real run re-encrypts everything, verified, and a second run finds nothing to do", async () => {
    await seed()
    const before = await rows("SELECT content_enc FROM passport_documents ORDER BY sha256")
    const dry = await rotateKeys({ dryRun: true })
    expect(dry.dryRun).toBe(true); expect(dry.clean).toBe(true)
    expect(dry.reports.find((r) => r.target.startsWith("passport_documents"))).toMatchObject({ rotated: 2 })           // the wiped row is skipped
    expect(await rows("SELECT content_enc FROM passport_documents ORDER BY sha256")).toEqual(before)
    const real = await rotateKeys({ dryRun: false })
    expect(real.clean).toBe(true)
    expect(Object.fromEntries(real.reports.map((r) => [r.target, r.rotated]))).toMatchObject({ "passport_documents.content_enc": 2, "kyc_document_files.content_enc": 1, "relationship_attachments.content_enc": 1, "lp_verification.owners_enc": 1, "lp_onboarding_details.tax_id_enc": 1 })
    expect(real.reports.filter((r) => r.missing).map((r) => r.target)).toEqual(expect.arrayContaining(["telegram_pending.text_enc"]))   // tables this database does not have are reported, not fatal
    // now readable with the new key alone, and with the same plaintext
    useKeys(NEW)
    for (const r of await rows("SELECT content_enc, sha256 FROM passport_documents WHERE length(content_enc) > 0")) { const b = decryptBytes(Buffer.from(r.content_enc))!; expect(sha(b)).toBe(r.sha256); expect(bytesKeyState(Buffer.from(r.content_enc))).toBe("current") }
    expect(decryptSecret((await rows("SELECT owners_enc FROM lp_verification WHERE lp_id = 'lp1'"))[0].owners_enc)).toBe("Owner A 60%, Owner B 40%")
    expect(decryptSecret((await rows("SELECT tax_id_enc FROM lp_onboarding_details WHERE lp_id = 'lp1'"))[0].tax_id_enc)).toBe("DE123456789")
    expect((await rows("SELECT tax_id_enc FROM lp_onboarding_details WHERE lp_id = 'lp2'"))[0].tax_id_enc).toBe("plain-legacy")            // plain values are not touched
    useKeys(NEW, OLD)
    const again = await rotateKeys({ dryRun: false })
    expect(again.reports.every((r) => r.rotated === 0 && r.failed.length === 0)).toBe(true)
  })
  it("refuses to replace a file whose decrypted bytes do not match its fingerprint, and reports it", async () => {
    useKeys(OLD)
    await db.query("INSERT INTO passport_documents (content_enc, sha256) VALUES ($1, $2)", [encryptBytes(Buffer.from("real bytes")), sha(Buffer.from("different bytes"))])
    useKeys(NEW, OLD)
    const stored = (await rows("SELECT content_enc FROM passport_documents"))[0].content_enc
    const r = await rotateKeys({ dryRun: false })
    expect(r.clean).toBe(false); expect(r.reports.find((x) => x.target.startsWith("passport_documents"))!.failed[0].why).toMatch(/fingerprint/)
    expect((await rows("SELECT content_enc FROM passport_documents"))[0].content_enc).toEqual(stored)           // untouched
  })
  it("reports what no held key can read, and will not run without a key", async () => {
    useKeys(OLDER); await db.query("INSERT INTO lp_verification VALUES ('lp9', $1)", [encryptSecret("secret")])
    useKeys(NEW, OLD)
    const r = await rotateKeys({ dryRun: false })
    expect(r.clean).toBe(false); expect(r.reports.find((x) => x.target.startsWith("lp_verification"))!.failed[0].why).toMatch(/any key/)
    delete process.env.SECRET_KEY
    await expect(rotateKeys()).rejects.toThrow(/SECRET_KEY/)
  })
})
