import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { NextRequest } from "next/server"
const state=vi.hoisted(()=>({user:{id:"gp",email:"gp@example.test",email_confirmed_at:"2026-01-01"} as any,org:"org-a",query:null as any,generate:vi.fn(),poll:vi.fn()}))
vi.mock("server-only",()=>({}))
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user}})}})}))
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>({value:state.org})})}))
vi.mock("@/lib/db",()=>({sql:Object.assign((parts:TemplateStringsArray,...values:unknown[])=>state.query(parts.reduce((q,p,i)=>q+(i?`$${i}`:"")+p,""),values),{unsafe:(q:string,v:unknown[]=[])=>state.query(q,v)})}))
vi.mock("@/lib/ai/provider",()=>({generate:state.generate,generateBatch:vi.fn()}))
vi.mock("@/lib/ai/dashscope-media",()=>({dashscopeKey:async()=>"test-key",pollTask:state.poll,generateImage:vi.fn(),submitVideo:vi.fn()}))
import { requireAiPrincipal, resolveAiPrincipal } from "./principal"
import { withAiContext, checkAiBudget } from "./context"
import { MODELING_TOOLS } from "./tools-modeling"
import { TOOLS } from "./tools"
import { canUseTool, validateToolInput } from "./policy"
import { saveArtifact } from "./artifact"
import { GET as download } from "@/app/api/artifacts/[file]/route"
import { GET as poll } from "@/app/api/anker/media/route"
import { runAssistant } from "./agent"
import { executeTool } from "./registry"
let db:PGlite
beforeAll(async()=>{
  db=new PGlite()
  state.query=async(q:string,v:unknown[]=[])=>(await db.query(q,v)).rows
  await db.exec(`CREATE TABLE anker_chats(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,user_id text,title text,model text,messages jsonb DEFAULT '[]',updated_at timestamptz DEFAULT now());
    CREATE TABLE organizations(id text PRIMARY KEY,name text,kind text,fund_id text);
    CREATE TABLE memberships(user_id text,org_id text,org_role text,persona text,can_send_outreach boolean DEFAULT false,created_at timestamptz DEFAULT now());
    CREATE TABLE funds(id text PRIMARY KEY,slug text,name text,currency text,vintage_year integer);
    CREATE TABLE contacts(id text PRIMARY KEY,email text);
    CREATE TABLE fund_lps(id text PRIMARY KEY,fund_id text,lp_contact_id text,lp_name text,commitment_amount numeric,called_amount numeric,distributed_amount numeric,status text);
    CREATE TABLE private_artifacts(id text PRIMARY KEY,user_id text,org_id text NOT NULL,filename text,content_type text,content bytea,expires_at timestamptz DEFAULT now()+interval '30 days');
    INSERT INTO organizations VALUES('org-a','Alpha','fund','fund-a'),('org-b','Beta','fund','fund-b'),('startup','Startup','company',NULL);
    INSERT INTO memberships(user_id,org_id,org_role,persona) VALUES('gp','org-a','workspace_owner','vc'),('gp','org-b','admin','vc'),('founder','startup','workspace_owner','founder');
    INSERT INTO funds VALUES('fund-a','alpha','Alpha','EUR',2025),('fund-b','beta','Beta','USD',2026);
    INSERT INTO contacts VALUES('lp-one','lp@example.test'),('lp-other','other@example.test');
    INSERT INTO fund_lps VALUES('a-one','fund-a','lp-one','Own LP',100,50,10,'active'),('a-other','fund-a','lp-other','Other LP',9999,999,99,'active'),('b-other','fund-b','lp-other','Foreign LP',8888,888,88,'active');`)
  const migration=readFileSync('scripts/migrations/2026-09-20-ai-persona-access.sql','utf8')
  await db.exec(migration);await db.exec(migration)
},30000)
afterAll(async()=>{await db.close()})
beforeEach(async()=>{state.user={id:"gp",email:"gp@example.test",email_confirmed_at:"2026-01-01"};state.org="org-a";state.generate.mockReset();state.poll.mockReset();await db.exec('DELETE FROM private_artifacts; DELETE FROM ai_media_tasks;')})
it("fails closed for unassigned and foreign workspace principals",async()=>{
  await expect(resolveAiPrincipal("unassigned")).rejects.toThrow("Select")
  await expect(resolveAiPrincipal("founder",{orgId:"org-a"})).rejects.toThrow("access denied")
  await expect(resolveAiPrincipal("gp",{orgId:null})).rejects.toThrow("access denied")
})
it("uses a token's authorized workspace instead of its cookie",async()=>{
  const p=await resolveAiPrincipal("gp",{orgId:"org-b",readonly:false,tools:["lp_capital_account"]})
  expect(canUseTool(p,"crm_update_stage")).toBe(false)
  const result=await withAiContext(p,()=>MODELING_TOOLS.lp_capital_account.run({fundId:"fund-a"}))
  expect(result.observation).toBe("Fund access denied.")
  const allowed=await withAiContext(p,()=>MODELING_TOOLS.lp_capital_account.run({fundId:"fund-b"}))
  expect(allowed.observation).toContain("Foreign LP")
  expect(allowed.observation).not.toContain("Own LP")
})
it("lets an LP without an organization see only their own account and download its export",async()=>{
  state.user={id:"lp",email:"lp@example.test",email_confirmed_at:"2026-01-01"}
  const p=await requireAiPrincipal();expect(p.persona).toBe("lp");expect(p.orgId).toBeNull()
  const own=await withAiContext(p,()=>MODELING_TOOLS.lp_capital_account.run({fundId:"alpha"}))
  expect(own.observation).toContain("Own LP");expect(own.observation).toContain("€");expect(own.observation).not.toContain("Other LP");expect(own.observation).not.toContain("$")
  const denied=await withAiContext(p,()=>MODELING_TOOLS.lp_capital_account.run({fundId:"fund-b"}))
  expect(denied.artifact).toBeUndefined()
  const id=own.artifact!.url.split('/').at(-1)!
  expect((await download(new NextRequest('https://test.invalid'),{params:Promise.resolve({file:id})})).status).toBe(200)
  state.user={id:"gp"}
  expect((await download(new NextRequest('https://test.invalid'),{params:Promise.resolve({file:id})})).status).toBe(404)
})
it("never elevates unverified email to LP entitlement",async()=>{
  state.user={id:"lp",email:"lp@example.test"}
  await expect(requireAiPrincipal()).rejects.toThrow("Select")
})
it("preserves unknown amounts and zero-denominator DPI",async()=>{
  await db.exec("UPDATE fund_lps SET commitment_amount=NULL,called_amount=0 WHERE id='a-one'")
  state.user={id:"lp",email:"lp@example.test",email_confirmed_at:"2026-01-01"}
  const result=await MODELING_TOOLS.lp_capital_account.run({fundId:"alpha"})
  expect(result.observation).toContain("commitment Not reported");expect(result.observation).toContain("DPI not available")
  await db.exec("UPDATE fund_lps SET commitment_amount=100,called_amount=50 WHERE id='a-one'")
})
it("rejects foreign media task polling before calling the provider",async()=>{
  await db.exec("INSERT INTO ai_media_tasks(task_id,user_id,scope_key,model) VALUES('other','gp','org:org-b','video')")
  expect((await poll(new NextRequest('https://test.invalid/api/anker/media?task=other'))).status).toBe(404)
  expect(state.poll).not.toHaveBeenCalled()
})
it("does not send email when the model supplies confirm=true",async()=>{
  const result=await TOOLS.send_outreach.run({to:"alex@anker-test-company.com",subject:"Review",body:"Draft",confirm:true})
  expect(result.observation).toContain("nothing sent or queued")
})
it("retains all deck artifacts and the chosen provider during synthesis",async()=>{
  const p=await resolveAiPrincipal("founder",{orgId:"startup"})
  const spy=vi.spyOn(TOOLS.analyze_image,"run").mockResolvedValue({observation:"Image read",artifacts:[{name:"One.pdf",url:"/api/artifacts/one",kind:"pdf"},{name:"Two.pptx",url:"/api/artifacts/two",kind:"pptx"}]})
  state.generate.mockResolvedValueOnce("ok").mockResolvedValueOnce('{"action":"analyze_image","action_input":{"imageBase64":"<<IMG1>>"}}').mockResolvedValueOnce('{"final":"Done"}')
  const result=await withAiContext(p,()=>runAssistant("Read",{provider:"qwen",model:"selected",maxSteps:1,imageRefs:[{id:"IMG1",name:"image",base64:"c2FtcGxl"}]}))
  expect(spy).toHaveBeenCalledWith({imageBase64:"c2FtcGxl"},{userId:"founder"})
  expect(result.artifacts).toHaveLength(2)
  expect(state.generate.mock.calls.at(-1)?.[1]).toMatchObject({provider:"qwen",model:"selected"})
  spy.mockRestore()
})
it("intersects Observe restrictions with persona tools",async()=>{
  const p=await resolveAiPrincipal("gp",{orgId:"org-a",readonly:true,tools:["crm_search"]})
  expect(canUseTool(p,"crm_search")).toBe(true);expect(canUseTool(p,"generate_document")).toBe(false)
  await expect(withAiContext(p,()=>executeTool(p,"generate_document",{title:"No",markdown:"No"}))).rejects.toThrow("unavailable")
})
it("validates types, required fields, ranges and unknown fields before invocation",()=>{
  expect(()=>validateToolInput("crm_search",{limit:900})).toThrow()
  expect(()=>validateToolInput("generate_document",{title:"No body"})).toThrow()
  expect(()=>validateToolInput("lp_overview",{fundId:"foreign"})).toThrow()
  expect(()=>validateToolInput("web_search",{query:12})).toThrow()
})
it("bounds nested model calls",async()=>{
  const p=await requireAiPrincipal()
  await withAiContext(p,async()=>{for(let i=0;i<16;i++)checkAiBudget(true);expect(()=>checkAiBudget(true)).toThrow("budget")})
})
it("does not let a claimed persona override authenticated membership",async()=>{
  const p=await resolveAiPrincipal("founder",{orgId:"startup"})
  state.generate.mockResolvedValueOnce("ok").mockResolvedValueOnce('{"action":"lp_capital_account","action_input":{"fundId":"fund-b"}}').mockResolvedValueOnce('{"final":"Denied"}')
  const result=await withAiContext(p,()=>runAssistant("Read another fund",{persona:"vc",userId:"gp",maxSteps:1}))
  expect(result.artifacts).toHaveLength(0)
  expect(result.steps[0].error).toContain("Unknown tool")
})
it("removes global writes and all artifact-producing tools for a readonly token",async()=>{
  const p=await resolveAiPrincipal("gp",{orgId:"org-a",readonly:true})
  for(const name of ["enrich_firms","enrich_db_from_xlsx","crm_update_stage","crm_add_task","send_outreach","lp_capital_account","generate_document","generate_image"])expect(canUseTool(p,name)).toBe(false)
  expect(canUseTool(p,"fund_performance")).toBe(true)
})
it("rejects stale workspace UI context before invoking AI",async()=>{
  const {POST}=await import("@/app/api/assistant/route")
  const response=await POST(new NextRequest("https://test.invalid/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({task:"Read my fund",scopeKey:"org:org-b"})}))
  expect(response.status).toBe(409);expect(state.generate).not.toHaveBeenCalled()
})

it("keeps conversation history isolated and rejects concurrent stale saves",async()=>{
  const {POST,GET}=await import("@/app/api/anker/chats/route")
  const {GET:read}=await import("@/app/api/anker/chats/[id]/route")
  const save=(body:unknown)=>POST(new NextRequest("https://test.invalid/api/anker/chats",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}))
  const messages=[{role:"user",content:"Alpha private"}]
  const response=await save({scopeKey:"org:org-a",messages})
  const created=await response.json();expect(created.id).toBeTruthy()
  state.org="org-b"
  expect((await (await GET()).json()).chats).toHaveLength(0)
  expect((await read(new NextRequest("https://test.invalid"),{params:Promise.resolve({id:created.id})})).status).toBe(404)
  state.org="org-a"
  const attempts=await Promise.all([save({scopeKey:"org:org-a",id:created.id,revision:0,messages}),save({scopeKey:"org:org-a",id:created.id,revision:0,messages})])
  expect(attempts.map(r=>r.status).sort()).toEqual([200,409])
})
it("rejects execution without a real persona even when the caller supplies one",async()=>{
  state.user={id:"unassigned"}
  await expect(runAssistant("Read funds",{persona:"vc",userId:"gp"})).rejects.toThrow("Select")
  expect(state.generate).not.toHaveBeenCalled()
})
it("respects provider unavailability instead of bypassing the disabled task",async()=>{
  state.generate.mockResolvedValue("")
  const result=await runAssistant("Read fund")
  expect(result.provider).toBe("no-ai")
  expect(state.generate).toHaveBeenCalledTimes(1)
  expect(state.generate.mock.calls[0][1]).toMatchObject({task:"deep_research"})
})
