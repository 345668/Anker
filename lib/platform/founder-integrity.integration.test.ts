import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { NextRequest } from "next/server"
import * as XLSX from "xlsx"
const session = vi.hoisted(() => ({ user: "u", org: "a", configured: true, sql: vi.fn(), send: vi.fn(), suppressed: false }))
vi.mock("@/lib/db", () => ({ sql: session.sql }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: session.org }) }) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: session.user ? { id: session.user } : null } }) } }) }))
vi.mock("@/lib/email/resend", () => ({ isResendConfigured: () => session.configured, sendEmail: session.send }))
vi.mock("@/lib/outreach/deliverability", () => ({ isEmailSuppressed: async () => session.suppressed }))
import { GET as readPlanning, PUT as savePlanning } from "@/app/api/planning/[tool]/route"
import { POST as importShortlist } from "@/app/api/crm/import-shortlist/route"
import { POST as createDeck } from "@/app/api/decks/route"
import { GET as readDeck, PATCH as saveDeck } from "@/app/api/decks/[id]/route"
import { saveArtifact } from "@/lib/assistant/artifact"
import { GET as download } from "@/app/api/artifacts/[file]/route"
import { POST as sendUpdate } from "@/app/api/updates/[id]/send/route"
import { DEFAULT_RUNWAY } from "@/lib/planning/models"
let db: PGlite
const migration = (file: string) => readFileSync(new URL(`../../scripts/migrations/${file}`, import.meta.url), "utf8")
const request = (path: string, method = "GET", body?: unknown) => new NextRequest(`https://test.invalid${path}`, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) })
const deckParams = (id: string) => ({ params: Promise.resolve({ id }) })
const planningParams = { params: Promise.resolve({ tool: "runway" }) }
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE organizations(id text PRIMARY KEY, name text, kind text, fund_id text);
    CREATE TABLE memberships(user_id text, org_id text, org_role text, persona text, can_send_outreach boolean, created_at timestamptz DEFAULT now());
    CREATE TABLE investment_firms(id text PRIMARY KEY, name text);
    CREATE TABLE investors(id text PRIMARY KEY, first_name text, last_name text, firm_id text);
    CREATE TABLE outreach_messages(kind text);
    CREATE TABLE funds(id text PRIMARY KEY, name text, slug text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    INSERT INTO organizations VALUES ('a','Company A','company',null),('b','Company B','company',null);
    INSERT INTO memberships(user_id, org_id, org_role, persona) VALUES ('u','a','workspace_owner','founder'),('u','b','workspace_owner','founder'),('other','a','member','founder'),('viewer','a','viewer','founder');
    INSERT INTO organizations VALUES ('fund-a','Fund A','fund','fa'),('fund-b','Fund B','fund','fb');
    INSERT INTO funds(id,name,slug) VALUES ('fa','Fund A','fund-a'),('fb','Fund B','fund-b');
    INSERT INTO memberships(user_id,org_id,org_role,persona) VALUES ('vc','fund-a','workspace_owner','vc'),('vc','fund-b','workspace_owner','vc');
    INSERT INTO investment_firms VALUES ('firm-one','Firm One'); INSERT INTO investors VALUES ('person-one','One','Investor','firm-one');`)
  for (const file of ['2026-05-04-crm-entries.sql','2026-05-25-crm-boards.sql','2026-09-09-fundraising-rounds.sql','2026-09-06-investor-updates.sql','2026-09-11-investor-update-delivery-state.sql','2026-09-12-founder-workflow-integrity.sql']) await db.exec(migration(file))
  session.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => (await db.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values)).rows)
}, 30000)
afterAll(async () => { await db.close() })
beforeEach(async () => {
  session.user = "u"; session.org = "a"; session.configured = true; session.suppressed = false; session.send.mockReset(); session.send.mockResolvedValue({ resendId: "provider-id" })
  await db.exec(`DELETE FROM workspace_decks; DELETE FROM planning_scenarios; DELETE FROM private_artifacts; DELETE FROM investor_update_recipients; DELETE FROM investor_updates; DELETE FROM fundraising_rounds; DELETE FROM crm_entries; DELETE FROM crm_boards;
    INSERT INTO crm_boards(id,user_id,name) VALUES ('board-a','u','Seed'),('board-b','u','B round');
    INSERT INTO fundraising_rounds(id,user_id,org_id,board_id,name,currency,target) VALUES ('round-a','u','a','board-a','Seed','USD',2000000),('round-b','u','b','board-b','B','EUR',3000000);`)
})
it("saves planning by workspace and rejects stale concurrent revisions", async () => {
  expect((await savePlanning(request('/api/planning/runway','PUT',{ orgId:'a',revision:-1,state:DEFAULT_RUNWAY }),planningParams)).status).toBe(200)
  session.org = 'b'
  expect((await (await readPlanning(request('/api/planning/runway?orgId=b'),planningParams)).json()).record).toBeNull()
  expect((await savePlanning(request('/api/planning/runway','PUT',{orgId:'a',revision:0,state:DEFAULT_RUNWAY}),planningParams)).status).toBe(409)
  session.org = 'a'
  const results = await Promise.all([1,2].map(n => savePlanning(request('/api/planning/runway','PUT',{orgId:'a',revision:0,state:{...DEFAULT_RUNWAY,cashOnHand:n}}),planningParams)))
  expect(results.map(r=>r.status).sort()).toEqual([200,409])
  session.user = 'viewer'
  expect((await savePlanning(request('/api/planning/runway','PUT',{orgId:'a',revision:-1,state:DEFAULT_RUNWAY}),planningParams)).status).toBe(403)
})
it("persists deck context and blocks foreign workspace reads, writes and rounds", async () => {
  const res = await createDeck(request('/api/decks','POST',{orgId:'a',templateKey:'founder-pitch'}))
  expect(res.status).toBe(201)
  const {deck} = await res.json()
  const saved = await saveDeck(request(`/api/decks/${deck.id}`,'PATCH',{...deck,orgId:'a',roundId:'round-a'}),deckParams(deck.id))
  expect(saved.status).toBe(200)
  expect((await saved.json()).deck.context.roundId).toBe('round-a')
  expect((await (await readDeck(request('/api/decks/x'),deckParams(deck.id))).json()).deck.context.roundId).toBe('round-a')
  expect((await saveDeck(request('/api/decks/x','PATCH',{...deck,revision:1,orgId:'a',roundId:'round-b'}),deckParams(deck.id))).status).toBe(403)
  session.org='b'
  expect((await readDeck(request('/api/decks/x'),deckParams(deck.id))).status).toBe(404)
  session.org='a';session.user='other'
  expect((await readDeck(request('/api/decks/x'),deckParams(deck.id))).status).toBe(404)
})
it("stores artifact bytes durably and enforces membership, owner, scope and expiry", async () => {
  const artifact = await saveArtifact(Buffer.from('synthetic PDF'), 'Sample', 'pdf')
  const id = artifact.url.split('/').at(-1)!, params={params:Promise.resolve({file:id})}
  expect(await (await download(request(artifact.url),params)).text()).toBe('synthetic PDF')
  session.org='b';expect((await download(request(artifact.url),params)).status).toBe(404)
  session.org='a';session.user='other';expect((await download(request(artifact.url),params)).status).toBe(404)
  session.user='';expect((await download(request(artifact.url),params)).status).toBe(401)
  session.user='u';await db.exec(`UPDATE private_artifacts SET expires_at = now() - interval '1 day'`)
  expect((await download(request(artifact.url),params)).status).toBe(404)
})
function importRequest(preview=false, invalid=false) {
  const wb=XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(invalid ? [['Bad']] : [['Contact','Anker ID','Name','Status','Owner','Notes'],[true,'firm:firm-one','Firm One','meeting','Alex','Follow up'],[false,'contact:person-one','One Investor']]),'Import Selection')
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Contact','Anker ID','Name'],[true,'contact:person-one','One Investor']]),'Ready to Email')
  const form=new FormData();form.set('xlsx',new File([new Uint8Array(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}))],'shortlist.xlsx'));form.set('source','founder_matching');if(preview)form.set('preview','true')
  return new NextRequest('https://test.invalid/api/crm/import-shortlist',{method:'POST',body:form})
}
it("previews without mutation and concurrently imports a firm only once", async () => {
  const count=async(table:string)=>(await db.query<{n:number}>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n
  expect((await importShortlist(importRequest(true))).status).toBe(200)
  expect(await count('crm_entries')).toBe(0);expect(await count('crm_boards')).toBe(2)
  expect((await importShortlist(importRequest(false,true))).status).toBe(400)
  expect(await count('crm_boards')).toBe(2)
  const responses=await Promise.all([importShortlist(importRequest()),importShortlist(importRequest())])
  expect(responses.map(r=>r.status)).toEqual([200,200])
  expect(await count('crm_entries')).toBe(1)
  expect((await db.query('SELECT stage,owner,notes,investor_id FROM crm_entries')).rows[0]).toMatchObject({stage:'meeting',owner:'Alex',notes:'Follow up',investor_id:null})
})
async function seedUpdate() { await db.exec(`INSERT INTO investor_updates(id,user_id,title,body,status) VALUES ('update','u','Old subject','Old body','draft')`) }
const sendBody={ revision:0,content:{title:'Reviewed subject',body:'Reviewed body',asks:''},recipients:[{email:'one@example.test',name:'One'},{email:'two@example.test',name:'Two'}] }
it("missing email configuration never changes delivery state", async () => {
  await seedUpdate();session.configured=false
  expect((await sendUpdate(request('/api/updates/update/send','POST',sendBody),deckParams('update'))).status).toBe(503)
  expect((await db.query('SELECT status,delivery_snapshot FROM investor_updates')).rows[0]).toEqual({status:'draft',delivery_snapshot:null})
  expect(session.send).not.toHaveBeenCalled()
})
it("sends reviewed content once and retries only failures with stable payload identity", async () => {
  await seedUpdate()
  session.send.mockImplementation(async(input:any)=>{if(input.to==='two@example.test')throw new Error('Provider temporary failure');return{resendId:'one-id'}})
  const first=await sendUpdate(request('/api/updates/update/send','POST',sendBody),deckParams('update'))
  expect(first.status).toBe(502)
  expect(session.send.mock.calls[0][0]).toMatchObject({subject:'Reviewed subject',text:'Reviewed body'})
  const original=session.send.mock.calls[1][0]
  session.send.mockResolvedValue({resendId:'two-id'})
  const retry=await sendUpdate(request('/api/updates/update/send','POST',{revision:1,content:{title:'Wrong',body:'Wrong',asks:''},recipients:[{email:'new@example.test'}]}),deckParams('update'))
  expect(retry.status).toBe(200)
  expect(session.send).toHaveBeenCalledTimes(3)
  expect(session.send.mock.calls[2][0]).toMatchObject({to:original.to,subject:original.subject,text:original.text,trackingId:original.trackingId,messageId:original.messageId,idempotencyKey:original.idempotencyKey})
})
it("rejects a simultaneous send and never labels an all-suppressed update sent", async () => {
  await seedUpdate();session.suppressed=true
  const responses=await Promise.all([sendUpdate(request('/api/updates/update/send','POST',sendBody),deckParams('update')),sendUpdate(request('/api/updates/update/send','POST',sendBody),deckParams('update'))])
  expect(responses.map(r=>r.status).sort()).toEqual([409,502])
  expect(session.send).not.toHaveBeenCalled()
  expect((await db.query('SELECT status,sent_at FROM investor_updates')).rows[0]).toEqual({status:'partial',sent_at:null})
})
it("the new migration can run again without losing data", async () => {
  await seedUpdate();await db.exec(migration('2026-09-12-founder-workflow-integrity.sql'))
  expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM investor_updates')).rows[0].n).toBe(1)
})

it("scopes native fund decks to the active authorized fund", async () => {
  session.user='vc';session.org='fund-a'
  const response=await createDeck(request('/api/decks','POST',{orgId:'fund-a',templateKey:'fund-overview'}))
  expect(response.status).toBe(201)
  const {deck}=await response.json()
  expect(deck.context.fundId).toBe('fa')
  session.org='fund-b'
  expect((await readDeck(request('/api/decks/x'),deckParams(deck.id))).status).toBe(404)
  session.org='fund-a'
  await db.exec("UPDATE organizations SET fund_id='fb' WHERE id='fund-a'")
  expect((await readDeck(request('/api/decks/x'),deckParams(deck.id))).status).toBe(403)
  await db.exec("UPDATE organizations SET fund_id='fa' WHERE id='fund-a'")
})
it("can recover an expired send lease without changing recipient identity", async () => {
  await seedUpdate()
  session.send.mockRejectedValue(new Error('temporary failure'))
  await sendUpdate(request('/api/updates/update/send','POST',sendBody),deckParams('update'))
  const original=session.send.mock.calls[0][0]
  await db.exec("UPDATE investor_updates SET status='sending',send_token='abandoned',send_lease_until=now()-interval '1 minute'")
  session.send.mockResolvedValue({resendId:'recovered'})
  expect((await sendUpdate(request('/api/updates/update/send','POST',{revision:1}),deckParams('update'))).status).toBe(200)
  expect(session.send.mock.calls[2][0]).toMatchObject({trackingId:original.trackingId,idempotencyKey:original.idempotencyKey})
})

it("saves Discover records to the personal CRM without a legacy startup and preserves existing board links", async () => {
  const { saveDiscoveryContact } = await import("@/lib/crm/discovery")
  const results = await Promise.all([saveDiscoveryContact("firm-one", "firm"), saveDiscoveryContact("firm-one", "firm")])
  expect(results.every(r => r.success)).toBe(true)
  const rows = (await db.query<{ id: string }>("SELECT id FROM crm_entries WHERE firm_id='firm-one'")).rows
  expect(rows).toHaveLength(1)
  await db.query("UPDATE crm_entries SET board_id='board-a', notes='Keep these notes' WHERE id=$1", [rows[0].id])
  session.org = "b"
  expect((await saveDiscoveryContact("firm-one", "firm")).message).toContain("Already")
  expect((await db.query("SELECT board_id, notes FROM crm_entries WHERE id=$1", [rows[0].id])).rows[0]).toEqual({ board_id: "board-a", notes: "Keep these notes" })
  session.user = "viewer"; session.org = "a"
  await expect(saveDiscoveryContact("person-one", "investor")).rejects.toMatchObject({ status: 403 })
})
