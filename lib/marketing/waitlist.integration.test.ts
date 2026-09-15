import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
const state = vi.hoisted(() => ({ sql: vi.fn(), admin: true, limited: false }))
vi.mock("@/lib/db", () => ({ sql: state.sql }))
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "192.0.2.1" }) }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ ok: !state.limited }) }))
vi.mock("@/lib/auth/require-admin", () => ({ isAdminUser: async () => ({ isAdmin: state.admin }) }))
vi.mock("next/navigation", () => ({ redirect: (url:string) => { throw Error(`redirect:${url}`) } }))
import { saveWaitlistRequest } from "./waitlist"
import { submitEarlyAccessRequest } from "@/app/early-access/actions"
import AdminPage from "@/app/dashboard/admin/waitlist/page"
let db: PGlite
const migration = (name:string) => readFileSync(`scripts/migrations/${name}`,"utf8")
const valid = { name:"Test Founder", email:"test@example.invalid", persona:"founder" as const, consent:true as const, referralSource:"linkedin / video / wild-ride" }
beforeAll(async () => {
  db = new PGlite()
  await db.exec(migration("2026-08-31-early-access-requests.sql"))
  await db.exec(migration("2026-09-14-waitlist-signups.sql"))
},30000)
beforeEach(async () => {
  state.admin=true; state.limited=false
  state.sql.mockImplementation(async (strings:TemplateStringsArray,...values:unknown[]) => (await db.query(strings.reduce((q,s,i)=>q+(i?`$${i}`:"")+s,""),values)).rows)
  await db.exec("DELETE FROM early_access_requests")
})
afterAll(async () => db.close())
it("saves consent and attribution once across concurrent normalized-email submissions",async()=>{
  const results=await Promise.all([valid,{...valid,email:" TEST@example.invalid "}].map(saveWaitlistRequest))
  expect(results.every(r=>r.success)).toBe(true)
  const rows=(await db.query<{email:string;email_key:string;referral_source:string;consent_version:string;consent_at:string}>("SELECT email,email_key,referral_source,consent_version,consent_at FROM early_access_requests")).rows
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({email:valid.email,email_key:valid.email,referral_source:valid.referralSource,consent_version:"waitlist-access-v1"})
  expect(rows[0].consent_at).toBeTruthy()
  await db.exec("UPDATE early_access_requests SET status='invited'")
  expect((await saveWaitlistRequest({...valid,name:"Overwrite attempt"})).success).toBe(true)
  expect((await db.query("SELECT name,status FROM early_access_requests")).rows[0]).toEqual({name:valid.name,status:"invited"})
})
it("rejects missing consent, invalid roles and honeypots without saving",async()=>{
  for (const input of [{...valid,consent:false},{...valid,persona:"admin"},{...valid,website:"spam"},{...valid,email:"bad"}]) expect((await saveWaitlistRequest(input)).success).toBe(false)
  expect((await db.query("SELECT * FROM early_access_requests")).rows).toHaveLength(0)
})
it("never reports success when storage fails and blocks excessive action requests",async()=>{
  state.sql.mockRejectedValueOnce({code:"42P01"})
  expect((await saveWaitlistRequest(valid)).success).toBe(false)
  state.limited=true;state.sql.mockClear()
  expect((await submitEarlyAccessRequest(valid)).success).toBe(false)
  expect(state.sql).not.toHaveBeenCalled()
})
it("preserves legacy duplicates and invited status during repeat migration",async()=>{
  await db.exec("INSERT INTO early_access_requests(id,name,email,status) VALUES ('old','Earlier',' Person@example.invalid ','pending'),('invited','Invited','person@example.invalid','invited')")
  await db.exec(migration("2026-09-14-waitlist-signups.sql"));await db.exec(migration("2026-09-14-waitlist-signups.sql"))
  expect((await db.query("SELECT id FROM early_access_requests WHERE email_key IS NOT NULL")).rows).toEqual([{id:"invited"}])
  expect((await db.query("SELECT id FROM early_access_requests")).rows).toHaveLength(2)
})
it("blocks the private waitlist before querying for a non-admin",async()=>{
  state.admin=false;state.sql.mockClear()
  await expect(AdminPage({searchParams:Promise.resolve({})})).rejects.toThrow("redirect:/dashboard")
  expect(state.sql).not.toHaveBeenCalled()
})
