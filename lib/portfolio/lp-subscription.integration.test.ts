import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
const st = vi.hoisted(() => ({ q: null as any }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => st.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v); return { sql: f } })
process.env.SECRET_KEY = "lp-sub-secret"
import { addPackageDoc, checkPdf, decide, fileForFund, fileForLp, lpSubscriptionView, packageView, publishPackage, removePackageDoc, returnSigned, reviewsForFund, sendToLp, MAX_PDF_BYTES, MAX_PACKAGE_DOCS } from "./lp-subscription"
import { LpError } from "./lp-onboarding"

let db: PGlite
const rows = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
const pdf = (tag = "a", size = 300) => Buffer.concat([Buffer.from(`%PDF-1.4\n${tag}\n`), Buffer.alloc(size, 32)])
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex")

beforeAll(async () => {
  db = new PGlite(); st.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(`CREATE TABLE fund_lps (id text PRIMARY KEY, fund_id text, lp_contact_id text, lp_name text, lp_type text, status text DEFAULT 'committed', commitment_amount numeric, signed_at date, subscription_status text NOT NULL DEFAULT 'countersigned', metadata jsonb DEFAULT '{}', updated_at timestamptz DEFAULT now());
    CREATE TABLE lp_portal_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lp_id text);`)
  for (const f of ["2026-10-17b-lp-onboarding", "2026-10-17c-lp-subscription"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => {
  await db.exec(`DELETE FROM lp_subscription_files; DELETE FROM lp_subscriptions; DELETE FROM fund_subscription_packages; DELETE FROM fund_lps;
    INSERT INTO fund_lps (id, fund_id, lp_name, commitment_amount, subscription_status, onboarding_state) VALUES ('lp1','f1','Berg',250000,'prospective','terms_accepted'), ('lp2','f1','Meier',100000,'prospective','terms_accepted'), ('lp3','f1','New',50000,'prospective','opened'), ('lp4','f1','NoAmount',NULL,'prospective','terms_accepted'), ('lpX','f2','Other fund',10,'prospective','terms_accepted')`)
})
const publish = async (fund = "f1") => { await addPackageDoc(fund, "gp", { title: "Subscription agreement", filename: "sa.pdf", bytes: pdf("sa") }); await addPackageDoc(fund, "gp", { title: "Side letter", filename: "sl.pdf", bytes: pdf("sl") }); return publishPackage(fund, "gp") }

describe("what counts as a PDF", () => {
  it("must be non-empty, small and really a PDF whatever its name says", () => {
    expect(() => checkPdf("a.pdf", Buffer.alloc(0))).toThrow(LpError)
    expect(() => checkPdf("a.pdf", Buffer.alloc(MAX_PDF_BYTES + 1, 1))).toThrow(/larger than/)
    expect(() => checkPdf("fake.pdf", Buffer.from("<html>not a pdf</html>"))).toThrow(/not a PDF/)
    expect(() => checkPdf("a.pdf", pdf())).not.toThrow()
  })
})

describe("the package", () => {
  it("documents go to a draft; publishing makes it current and the next upload starts version 2, while version 1 stays as sent", async () => {
    await expect(publishPackage("f1", "gp")).rejects.toMatchObject({ code: "empty" })
    expect((await publish()).version).toBe(1)
    let v = await packageView("f1"); expect(v.current!.docs.map((d) => d.title)).toEqual(["Subscription agreement", "Side letter"]); expect(v.draft).toBeNull()
    await addPackageDoc("f1", "gp", { filename: "sa-v2.pdf", bytes: pdf("v2") }); v = await packageView("f1"); expect(v.draft!.version).toBe(2); expect(v.current!.version).toBe(1)
    await publishPackage("f1", "gp"); v = await packageView("f1"); expect(v.current!.version).toBe(2); expect((await rows("SELECT status FROM fund_subscription_packages WHERE version = 1"))[0].status).toBe("retired")
  })
  it("a document can be removed only from the draft, never from a published package; a package holds a limited number of documents", async () => {
    await publish(); const cur = (await packageView("f1")).current!.docs[0]
    expect(await removePackageDoc("f1", cur.id)).toBe(false)
    const d = await addPackageDoc("f1", "gp", { filename: "x.pdf", bytes: pdf("x") }); expect(await removePackageDoc("f1", d.id)).toBe(true); expect(await removePackageDoc("f2", d.id)).toBe(false)
    for (let i = 0; i < MAX_PACKAGE_DOCS; i++) await addPackageDoc("f1", "gp", { filename: `d${i}.pdf`, bytes: pdf(`d${i}`) })
    await expect(addPackageDoc("f1", "gp", { filename: "over.pdf", bytes: pdf("over") })).rejects.toThrow(/up to/)
  })
  it("the stored fingerprint is the SHA-256 of the file", async () => {
    const b = pdf("fp"); const d = await addPackageDoc("f1", "gp", { filename: "fp.pdf", bytes: b }); expect(d.sha256).toBe(sha(b))
    expect((await fileForFund("f1", d.id))!.bytes.equals(b)).toBe(true); expect(await fileForFund("f2", d.id)).toBeNull()
  })
})

describe("sending to an LP", () => {
  it("needs the first steps done, a commitment and a published package; then snapshots the commitment and moves the fundraise stage to invited", async () => {
    await expect(sendToLp("lp1", "gp", {})).rejects.toMatchObject({ code: "no_package" })
    await publish()
    await expect(sendToLp("lp3", "gp", {})).rejects.toMatchObject({ code: "not_ready" })
    await expect(sendToLp("lp4", "gp", {})).rejects.toMatchObject({ code: "no_commitment" })
    await expect(sendToLp("lp1", "gp", { date: "next week" })).rejects.toBeInstanceOf(LpError)
    await sendToLp("lp1", "gp", { shareClass: "Class A", date: "2026-11-01" })
    expect((await lpSubscriptionView("lp1"))).toMatchObject({ status: "sent", commitment: 250000, shareClass: "Class A", subscriptionDate: "2026-11-01" })
    expect((await rows("SELECT subscription_status FROM fund_lps WHERE id = 'lp1'"))[0].subscription_status).toBe("invited")
  })
  it("the LP sees the documents of the version they were sent, even after a newer version is published", async () => {
    await publish(); await sendToLp("lp1", "gp", {})
    await addPackageDoc("f1", "gp", { title: "Replacement agreement", filename: "new.pdf", bytes: pdf("new") }); await publishPackage("f1", "gp")
    expect((await lpSubscriptionView("lp1"))!.docs.map((d) => d.title)).toEqual(["Subscription agreement", "Side letter"])
    await sendToLp("lp2", "gp", {}); expect((await lpSubscriptionView("lp2"))!.docs.map((d) => d.title)).toEqual(["Replacement agreement"])
  })
})

describe("the investor returns the signed copy", () => {
  const ready = async () => { await publish(); await sendToLp("lp1", "gp", {}) }
  it("needs a typed name, the tick and a real PDF; then records the fingerprints of every document they were sent", async () => {
    await expect(returnSigned("lp2", { ackName: "x", agree: true, filename: "s.pdf", bytes: pdf() }, null)).rejects.toMatchObject({ code: "not_sent" })
    await ready()
    await expect(returnSigned("lp1", { ackName: "A", agree: true, filename: "s.pdf", bytes: pdf() }, null)).rejects.toThrow(/full name/)
    await expect(returnSigned("lp1", { ackName: "Anna Berg", agree: false, filename: "s.pdf", bytes: pdf() }, null)).rejects.toThrow(/tick/)
    await expect(returnSigned("lp1", { ackName: "Anna Berg", agree: "on", filename: "s.pdf", bytes: Buffer.from("nope") }, null)).rejects.toMatchObject({ code: "not_pdf" })
    const signed = pdf("signed"); await returnSigned("lp1", { ackName: " Anna  Berg ", agree: "true", filename: "signed.pdf", bytes: signed }, "9.9.9.9")
    const [s] = await rows("SELECT * FROM lp_subscriptions WHERE lp_id = 'lp1'"); expect(s).toMatchObject({ status: "returned", ack_name: "Anna Berg", ack_ip: "9.9.9.9" })
    expect((s.ack_hashes as Array<{ sha256: string }>).map((h) => h.sha256).sort()).toEqual([sha(pdf("sa")), sha(pdf("sl"))].sort())
    expect((await rows("SELECT subscription_status, onboarding_state FROM fund_lps WHERE id = 'lp1'"))[0]).toEqual({ subscription_status: "signed", onboarding_state: "subscription_returned" })
    expect((await rows("SELECT sha256, scanned FROM lp_subscription_files WHERE role = 'signed_copy'"))[0]).toEqual({ sha256: sha(signed), scanned: false })
    await expect(returnSigned("lp1", { ackName: "Anna Berg", agree: true, filename: "again.pdf", bytes: pdf() }, null)).rejects.toMatchObject({ code: "state" })
  })
  it("a file is downloadable only by the LP it belongs to; another LP, another fund and a retired package's documents get nothing", async () => {
    await ready(); const mine = (await lpSubscriptionView("lp1"))!.docs[0].id
    expect(await fileForLp("lp1", mine)).not.toBeNull(); expect(await fileForLp("lp2", mine)).toBeNull(); expect(await fileForLp("lpX", mine)).toBeNull()
    await returnSigned("lp1", { ackName: "Anna Berg", agree: true, filename: "s.pdf", bytes: pdf("s") }, null)
    const signedId = (await lpSubscriptionView("lp1"))!.signedCopy!.id; expect(await fileForLp("lp1", signedId)).not.toBeNull(); expect(await fileForLp("lp2", signedId)).toBeNull()
  })
})

describe("the fund's decision", () => {
  const returned = async (lp = "lp1") => { await publish(); await sendToLp(lp, "gp", {}); await returnSigned(lp, { ackName: "Anna Berg", agree: true, filename: "s.pdf", bytes: pdf("s1") }, null) }
  it("only a returned subscription can be decided", async () => {
    await publish(); await sendToLp("lp1", "gp", {})
    await expect(decide("lp1", "gp", { decision: "accept" })).rejects.toMatchObject({ code: "state" }); await expect(decide("lp2", "gp", { decision: "accept" })).rejects.toMatchObject({ status: 404 })
  })
  it("rejecting needs a reason, sends it back to the investor, and the next signed copy replaces the earlier one", async () => {
    await returned()
    await expect(decide("lp1", "gp", { decision: "reject", reason: "no" })).rejects.toThrow(/why/)
    await decide("lp1", "gp", { decision: "reject", reason: "Page 3 is not initialled" })
    expect(await lpSubscriptionView("lp1")).toMatchObject({ status: "rejected", rejectionReason: "Page 3 is not initialled" })
    expect((await rows("SELECT subscription_status FROM fund_lps WHERE id = 'lp1'"))[0].subscription_status).toBe("invited")
    await returnSigned("lp1", { ackName: "Anna Berg", agree: true, filename: "s2.pdf", bytes: pdf("s2") }, null)
    expect(await rows("SELECT superseded FROM lp_subscription_files WHERE role = 'signed_copy' ORDER BY created_at")).toEqual([{ superseded: true }, { superseded: false }])
    expect((await lpSubscriptionView("lp1"))).toMatchObject({ status: "returned", rejectionReason: null })
  })
  it("accepting countersigns: the commitment is active, the dates are set, and the fund's own countersigned PDF is kept and shown to the investor only after", async () => {
    await returned(); const before = await lpSubscriptionView("lp1"); expect(before!.countersignedCopy).toBeNull()
    await decide("lp1", "gp", { decision: "accept", countersigned: { filename: "cs.pdf", bytes: pdf("cs") } })
    expect((await rows("SELECT subscription_status, onboarding_state, signed_at FROM fund_lps WHERE id = 'lp1'"))[0]).toMatchObject({ subscription_status: "countersigned", onboarding_state: "countersigned" })
    expect((await rows("SELECT signed_at FROM fund_lps WHERE id = 'lp1'"))[0].signed_at).toBeTruthy()
    const v = (await lpSubscriptionView("lp1"))!; expect(v.status).toBe("countersigned"); expect(v.countersignedCopy).not.toBeNull(); expect(await fileForLp("lp1", v.countersignedCopy!.id)).not.toBeNull()
    await expect(decide("lp1", "gp", { decision: "accept" })).rejects.toMatchObject({ code: "state" })
  })
  it("a countersigned copy is not downloadable before the fund has countersigned, and a bad countersigned file is refused", async () => {
    await returned(); await db.exec("INSERT INTO lp_subscription_files (fund_id, lp_id, role, filename, size_bytes, sha256, content) VALUES ('f1','lp1','countersigned_copy','cs.pdf',5,'x','\\x255044462d')")
    const id = (await rows("SELECT id FROM lp_subscription_files WHERE role = 'countersigned_copy'"))[0].id
    expect(await fileForLp("lp1", id)).toBeNull()
    await expect(decide("lp1", "gp", { decision: "accept", countersigned: { filename: "cs.pdf", bytes: Buffer.from("junk") } })).rejects.toMatchObject({ code: "not_pdf" })
  })
  it("the fund's list carries the status, who confirmed, and the signed copy's fingerprint, for its own LPs only", async () => {
    await returned(); const r = await reviewsForFund("f1"); expect(r.lp1).toMatchObject({ status: "returned", ackName: "Anna Berg", commitment: 250000 }); expect(r.lp1.signedCopy!.sha256).toBe(sha(pdf("s1"))); expect(Object.keys(await reviewsForFund("f2"))).toEqual([])
  })
})
