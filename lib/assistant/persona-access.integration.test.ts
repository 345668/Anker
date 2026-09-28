import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { NextRequest } from "next/server"
const state=vi.hoisted(()=>({user:{id:"gp",email:"gp@example.test",email_confirmed_at:"2026-01-01"} as any,org:"org-a",query:null as any,generate:vi.fn(),poll:vi.fn(),streamOpts:[] as any[]}))
vi.mock("server-only",()=>({}))
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user}})}})}))
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>({value:state.org})})}))
vi.mock("@/lib/db",()=>({sql:Object.assign((parts:TemplateStringsArray,...values:unknown[])=>state.query(parts.reduce((q,p,i)=>q+(i?`$${i}`:"")+p,""),values),{unsafe:(q:string,v:unknown[]=[])=>state.query(q,v)})}))
vi.mock("@/lib/ai/provider",()=>({generate:state.generate,generateBatch:vi.fn(),
  canStream:async()=>true,
  generateStream:(_p:string,opts:any)=>{state.streamOpts.push(opts);return (async function*(){yield "Streamed."})()}}))
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
import { GET as listChats, POST as saveChat } from "@/app/api/anker/chats/route"
import { POST as askAssistant } from "@/app/api/assistant/route"
import { POST as ankerChat } from "@/app/api/anker/chat/route"
import { GET as loadChat } from "@/app/api/anker/chats/[id]/route"
import { appendEvents, readEvents, projectMessages } from "./events"
import { invalidateRouterConfig } from "@/lib/ai/runtime-config"
let db:PGlite
beforeAll(async()=>{
  db=new PGlite()
  state.query=async(q:string,v:unknown[]=[])=>(await db.query(q,v)).rows
  await db.exec(`CREATE TABLE anker_chats(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,user_id text,title text,model text,messages jsonb DEFAULT '[]',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE organizations(id text PRIMARY KEY,name text,kind text,fund_id text);
    CREATE TABLE memberships(user_id text,org_id text,org_role text,persona text,can_send_outreach boolean DEFAULT false,created_at timestamptz DEFAULT now());
    CREATE TABLE funds(id text PRIMARY KEY,slug text,name text,currency text,vintage_year integer);
    CREATE TABLE contacts(id text PRIMARY KEY,email text);
    CREATE TABLE system_settings(key text PRIMARY KEY,value jsonb,updated_by text,updated_at timestamptz DEFAULT now());
    CREATE TABLE fund_lps(id text PRIMARY KEY,fund_id text,lp_contact_id text,lp_name text,commitment_amount numeric,called_amount numeric,distributed_amount numeric,status text);
    CREATE TABLE private_artifacts(id text PRIMARY KEY,user_id text,org_id text NOT NULL,filename text,content_type text,content bytea,expires_at timestamptz DEFAULT now()+interval '30 days');
    INSERT INTO organizations VALUES('org-a','Alpha','fund','fund-a'),('org-b','Beta','fund','fund-b'),('startup','Startup','company',NULL);
    INSERT INTO memberships(user_id,org_id,org_role,persona) VALUES('gp','org-a','workspace_owner','vc'),('gp','org-b','admin','vc'),('founder','startup','workspace_owner','founder');
    INSERT INTO funds VALUES('fund-a','alpha','Alpha','EUR',2025),('fund-b','beta','Beta','USD',2026);
    INSERT INTO contacts VALUES('lp-one','lp@example.test'),('lp-other','other@example.test');
    INSERT INTO fund_lps VALUES('a-one','fund-a','lp-one','Own LP',100,50,10,'active'),('a-other','fund-a','lp-other','Other LP',9999,999,99,'active'),('b-other','fund-b','lp-other','Foreign LP',8888,888,88,'active');`)
  // Applied twice each: the fixture doubles as an idempotency check on the
  // migrations it depends on.
  for(const f of ['scripts/migrations/2026-09-20-ai-persona-access.sql',
                  'scripts/migrations/2026-09-26-anker-chat-events.sql',
                  'scripts/migrations/2026-09-21-ai-call-log.sql',
                  'scripts/migrations/2026-09-21b-ai-call-attribution.sql',
                  'scripts/migrations/2026-09-28-ai-call-provenance.sql']){
    const migration=readFileSync(f,'utf8')
    await db.exec(migration);await db.exec(migration)
  }
},30000)
afterAll(async()=>{await db.close()})
beforeEach(async()=>{state.user={id:"gp",email:"gp@example.test",email_confirmed_at:"2026-01-01"};state.org="org-a";state.generate.mockReset();state.poll.mockReset();await db.exec('DELETE FROM private_artifacts; DELETE FROM ai_media_tasks; DELETE FROM ai_calls;')})
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

// ─── Assistant history is per workspace (doc 28 phase 1, closing doc 00 §1) ──
//
// The leak this closes: `anker_chats` was user-scoped, so one person who holds
// two workspaces had ONE assistant history spanning both. `gp` is a member of
// org-a and org-b, which is the shape that exposes it.

const jsonReq = (body: unknown) =>
  new NextRequest("http://local/api/anker/chats", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  })

it("keeps a chat saved in one workspace out of another workspace's history", async () => {
  state.org = "org-a"
  const saved = await saveChat(jsonReq({
    scopeKey: "org:org-a", title: "Alpha raise", model: "m",
    messages: [{ role: "user", content: "who are my LPs" }],
  }))
  expect(saved.status).toBe(200)
  const { id } = await saved.json()
  expect(id).toBeTruthy()

  // Same user, same session, different workspace.
  state.org = "org-b"
  const other = await (await listChats()).json()
  expect(other.scopeKey).toBe("org:org-b")
  expect(other.chats).toHaveLength(0)

  // And it cannot be reached by id either — a stale link must not cross.
  const direct = await loadChat({} as any, { params: Promise.resolve({ id }) })
  expect(direct.status).toBe(404)

  // Still there in the workspace that owns it. Containment, not equality: other
  // tests in this file also save under org-a and the table is not reset between.
  state.org = "org-a"
  const mine = await (await listChats()).json()
  expect(mine.chats.map((c: any) => c.title)).toContain("Alpha raise")
})

it("refuses a save whose scopeKey no longer matches the session", async () => {
  state.org = "org-a"
  const res = await saveChat(jsonReq({
    scopeKey: "org:org-b", title: "stale", model: "m",
    messages: [{ role: "user", content: "hi" }],
  }))
  expect(res.status).toBe(409)
})

it("leaves a legacy unscoped chat invisible rather than assigning it a workspace", async () => {
  // doc 00 §3: a row whose persona cannot be derived is retained, not guessed at.
  await db.exec(`INSERT INTO anker_chats(id,user_id,title,model,messages) VALUES('legacy','gp','Legacy','m','[]')`)
  state.org = "org-a"
  const list = await (await listChats()).json()
  expect(list.chats.map((c: any) => c.id)).not.toContain("legacy")
  const [row] = await db.query(`SELECT scope_key FROM anker_chats WHERE id='legacy'`).then((r: any) => r.rows)
  expect(row.scope_key).toBeNull()
})

// ─── The loop records intent before it acts (doc 28 phase 3, G2/G4) ─────────

it("writes tool.requested BEFORE the tool runs, and the outcome after", async () => {
  state.org = "org-a"
  const saved = await saveChat(jsonReq({
    scopeKey: "org:org-a", title: "Tool run", model: "m",
    messages: [{ role: "user", content: "search the crm" }],
  }))
  const { id: chatId } = await saved.json()

  // The model asks for a tool, then answers. runAssistant appends around its own
  // executeTool call, so the ordering below is the loop's, not the test's.
  state.generate
    .mockResolvedValueOnce("ok")
    .mockResolvedValueOnce('{"action":"lp_capital_account","action_input":{"fundId":"fund-a"}}')
    .mockResolvedValueOnce('{"final":"Reported."}')

  const p = await requireAiPrincipal()
  await withAiContext(p, () => runAssistant("report the fund", { persona: "vc", userId: "gp", maxSteps: 1, chatId }))

  const kinds = (await readEvents(chatId, "org:org-a")).map((e) => e.kind)
  const requested = kinds.indexOf("tool.requested")
  const settled = Math.max(kinds.indexOf("tool.completed"), kinds.indexOf("tool.failed"))
  expect(requested).toBeGreaterThan(-1)
  expect(settled).toBeGreaterThan(requested)  // intent is durable first
})

it("leaves a resumable intent when a tool never settles", async () => {
  // What a crash between request and completion looks like on disk: an intent
  // with no outcome. That is what a resume reads, and what an approval holds.
  state.org = "org-a"
  const saved = await saveChat(jsonReq({
    scopeKey: "org:org-a", title: "Interrupted", model: "m",
    messages: [{ role: "user", content: "move Acme" }],
  }))
  const { id } = await saved.json()
  await appendEvents(id, "gp", [{ kind: "tool.requested", payload: { name: "crm_update_stage" }, awaiting: true }])

  const events = await readEvents(id, "org:org-a")
  const open = events.filter((e) => e.kind === "tool.requested" &&
    !events.some((o) => o.kind === "tool.completed" || o.kind === "tool.failed"))
  expect(open).toHaveLength(1)
  // ...and it renders as nothing, because nothing has happened yet.
  expect(projectMessages(events).filter((m) => m.role === "assistant")).toHaveLength(0)
})

it("does not log to a conversation in another workspace", async () => {
  state.org = "org-a"
  const saved = await saveChat(jsonReq({
    scopeKey: "org:org-a", title: "Mine", model: "m",
    messages: [{ role: "user", content: "hi" }],
  }))
  const { id } = await saved.json()
  // Events belong to the chat's scope, not the caller's claim.
  await appendEvents(id, "gp", [{ kind: "message.user", payload: { content: "x" } }])
  expect(await readEvents(id, "org:org-b")).toHaveLength(0)
  expect((await readEvents(id, "org:org-a")).length).toBeGreaterThan(0)
})

// ─── The assistant streams its run as events (doc 28 phase 4) ───────────────

const parseSse = (text: string) =>
  text.split("\n\n").filter(Boolean).map((f) => ({
    id: f.match(/^id: (.+)$/m)?.[1] ?? null,
    kind: f.match(/^event: (.+)$/m)?.[1] ?? "",
    data: JSON.parse(f.match(/^data: (.*)$/m)?.[1] ?? "{}"),
  }))

const ask = (body: unknown, accept?: string) =>
  askAssistant(new NextRequest("http://local/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json", ...(accept ? { accept } : {}) },
    body: JSON.stringify(body),
  }) as any)

it("streams a tool call as its own event, distinct from the answer", async () => {
  state.org = "org-a"
  state.generate
    .mockResolvedValueOnce("ok")
    .mockResolvedValueOnce('{"action":"lp_capital_account","action_input":{"fundId":"fund-a"}}')
    .mockResolvedValueOnce('{"final":"Reported."}')

  const res = await ask({ scopeKey: "org:org-a", task: "report the fund", maxSteps: 1 }, "text/event-stream")
  expect(res.headers.get("content-type")).toContain("text/event-stream")

  const frames = parseSse(await res.text())
  const kinds = frames.map((f) => f.kind)
  // The tool is announced before it settles, and the answer is its own frame —
  // a client never has to infer a tool call from prose.
  expect(kinds).toContain("tool.requested")
  expect(kinds.indexOf("tool.requested")).toBeLessThan(kinds.indexOf("result"))
  expect(frames.find((f) => f.kind === "tool.requested")!.data.name).toBe("lp_capital_account")
  expect(frames.find((f) => f.kind === "result")!.data.answer).toBe("Reported.")
  expect(kinds).toContain("run.ended")
})

it("still answers with JSON when a stream was not asked for", async () => {
  state.org = "org-a"
  state.generate.mockResolvedValueOnce("ok").mockResolvedValueOnce('{"final":"Plain."}')
  const res = await ask({ scopeKey: "org:org-a", task: "hello", maxSteps: 1 })
  expect(res.headers.get("content-type")).toContain("application/json")
  expect((await res.json()).answer).toBe("Plain.")
})

it("refuses a run whose workspace moved, before any model call", async () => {
  state.org = "org-a"
  state.generate.mockReset()
  const res = await ask({ scopeKey: "org:org-b", task: "hi" }, "text/event-stream")
  expect(res.status).toBe(409)
  expect(state.generate).not.toHaveBeenCalled()
})

// An absent scopeKey is a different case from a stale one, and it is the case
// that shipped broken: ANKER AI's agent branch omitted the field entirely, so
// every request compared "" against a never-empty principal scope and 409'd.
// The mismatch above passed throughout.
it("refuses a run that omits the workspace entirely", async () => {
  state.org = "org-a"
  state.generate.mockReset()
  const res = await ask({ task: "hi" })
  expect(res.status).toBe(409)
  expect(state.generate).not.toHaveBeenCalled()
})

it("answers on the model the caller picked, with that model's own provider", async () => {
  state.org = "org-a"
  state.generate.mockReset()
  state.generate.mockResolvedValueOnce("ok").mockResolvedValueOnce('{"final":"Picked."}')
  const res = await ask({ scopeKey: "org:org-a", task: "hi", maxSteps: 1, model: "qwen-plus" })
  const body = await res.json()
  expect(body.answer).toBe("Picked.")
  expect(body.modelChoice).toMatchObject({ requested: "qwen-plus", honoured: true, model: "qwen-plus" })
  // Derived from the catalogue, not the client, and mapped dashscope → qwen.
  // Without it the id would be sent to whatever providerOverride names.
  expect(body.modelChoice.provider).toBe("qwen")
  expect(state.generate.mock.calls.length).toBeGreaterThan(0)
  for (const call of state.generate.mock.calls) {
    expect(call[1]).toMatchObject({ model: "qwen-plus", provider: "qwen" })
  }
})

it("falls back to the default and says so when the pick is not a real model", async () => {
  state.org = "org-a"
  state.generate.mockReset()
  state.generate.mockResolvedValueOnce("ok").mockResolvedValueOnce('{"final":"Default."}')
  const res = await ask({ scopeKey: "org:org-a", task: "hi", maxSteps: 1, model: "gpt-9-ultra" })
  const body = await res.json()
  expect(body.answer).toBe("Default.")
  expect(body.modelChoice).toMatchObject({ requested: "gpt-9-ultra", honoured: false, reason: "unknown" })
  expect(body.modelChoice.message).toContain("not a model in the catalogue")
  // No override reached the provider: the task/tier router still chose.
  expect(state.generate.mock.calls.length).toBeGreaterThan(0)
  for (const call of state.generate.mock.calls) expect(call[1]?.model).toBeUndefined()
})

it("refuses a model that cannot hold a conversation, whatever the picker sent", async () => {
  state.org = "org-a"
  state.generate.mockReset()
  state.generate.mockResolvedValueOnce("ok").mockResolvedValueOnce('{"final":"Text."}')
  const res = await ask({ scopeKey: "org:org-a", task: "hi", maxSteps: 1, model: "qwen-image-max" })
  const body = await res.json()
  expect(body.modelChoice).toMatchObject({ honoured: false, reason: "not-conversational" })
  expect(state.generate.mock.calls.length).toBeGreaterThan(0)
  for (const call of state.generate.mock.calls) expect(call[1]?.model).toBeUndefined()
})

// The text surface dropped the pick too, and it is ANKER AI's default mode, so
// fixing only the agent route would have left the picker still lying for most
// requests. Its body is a text stream, so the outcome travels as a header.
const chat = (body: unknown) =>
  ankerChat(new NextRequest("http://local/api/anker/chat", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }) as any)

it("streams the text surface on the picked model, and names it in a header", async () => {
  state.org = "org-a"; state.streamOpts.length = 0
  const res = await chat({ scopeKey: "org:org-a", model: "qwen-plus", messages: [{ role: "user", content: "hi" }] })
  expect(await res.text()).toBe("Streamed.")
  expect(res.headers.get("x-anker-model")).toBe("qwen-plus")
  expect(res.headers.get("x-anker-model-rejected")).toBeNull()
  expect(state.streamOpts.length).toBeGreaterThan(0)
  for (const o of state.streamOpts) expect(o).toMatchObject({ model: "qwen-plus", provider: "qwen" })
})

it("reports a refused pick on the text surface instead of substituting silently", async () => {
  state.org = "org-a"; state.streamOpts.length = 0
  const res = await chat({ scopeKey: "org:org-a", model: "qwen-image-max", messages: [{ role: "user", content: "hi" }] })
  expect(await res.text()).toBe("Streamed.")
  expect(res.headers.get("x-anker-model-rejected")).toBe("not-conversational")
  expect(res.headers.get("x-anker-model")).toBeNull()
  expect(state.streamOpts.length).toBeGreaterThan(0)
  for (const o of state.streamOpts) expect(o.model).toBeUndefined()
})

it("leaves model selection alone when no pick was sent", async () => {
  state.org = "org-a"
  state.generate.mockReset()
  state.generate.mockResolvedValueOnce("ok").mockResolvedValueOnce('{"final":"Router."}')
  const res = await ask({ scopeKey: "org:org-a", task: "hi", maxSteps: 1 })
  const body = await res.json()
  expect(body.answer).toBe("Router.")
  expect(body.modelChoice).toBeNull()
  expect(state.generate.mock.calls.length).toBeGreaterThan(0)
  for (const call of state.generate.mock.calls) expect(call[1]?.provider).toBeUndefined()
})

// ── Doc 30: a refusal is counted once per request ───────────────────────────
// The reason these live at the route and not in lib/ai: recordAiCall fires per
// chain attempt, and an agent run makes several model calls, so the only way to
// show that one refused pick is ONE row is to drive the real route.

const rejections = async () =>
  (await db.query("SELECT * FROM ai_calls WHERE provider='rejected' ORDER BY id")).rows as any[]

it("records a refused pick once for an agent run, not once per step", async () => {
  state.org = "org-a"
  state.generate.mockReset()
  // Several model calls in one run: enough steps that a per-call record would
  // show up as more than one row.
  state.generate.mockResolvedValueOnce("ok").mockResolvedValueOnce('{"tool":"none","final":"Answered."}')
  await ask({ scopeKey: "org:org-a", task: "hi", model: "gpt-9-ultra", maxSteps: 3 })
  expect(state.generate.mock.calls.length).toBeGreaterThan(1)
  const rows = await rejections()
  expect(rows).toHaveLength(1)
  expect(rows[0].requested_model).toBe("gpt-9-ultra")
  expect(rows[0].error).toBe("unknown")
  expect(rows[0].actor_id).toBe("gp")
  expect(rows[0].workspace_id).toBe("org-a")
})

it("records a refused pick on the text surface too", async () => {
  state.org = "org-a"
  await chat({ scopeKey: "org:org-a", model: "qwen-image-max", messages: [{ role: "user", content: "hi" }] })
  const rows = await rejections()
  expect(rows).toHaveLength(1)
  expect(rows[0].requested_model).toBe("qwen-image-max")
  expect(rows[0].error).toBe("not-conversational")
  expect(rows[0].persona).toBe("vc")
})

it("records nothing when the pick was honoured, or when none was sent", async () => {
  state.org = "org-a"
  await chat({ scopeKey: "org:org-a", model: "qwen-plus", messages: [{ role: "user", content: "hi" }] })
  await chat({ scopeKey: "org:org-a", messages: [{ role: "user", content: "hi" }] })
  expect(await rejections()).toHaveLength(0)
})

// Doc 31 acceptance 3, end to end: a surface closed by CONFIG refuses a pick and
// records it. /api/chat cannot exercise this — it takes no model from the body at
// all (doc 31 §1.4) — so the closable surface is the one that does.
it("refuses and records a pick once a surface is closed in config", async () => {
  state.org = "org-a"; state.streamOpts.length = 0
  await db.query(`INSERT INTO system_settings(key,value) VALUES('ai_router_v1',$1::jsonb)
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    [JSON.stringify({ surfaces: { copilot: { userSelectable: false } } })])
  invalidateRouterConfig()
  // A VALID catalogue model: the refusal is the surface's, not the model's.
  const res = await chat({ scopeKey: "org:org-a", model: "qwen-plus", messages: [{ role: "user", content: "hi" }] })
  expect(res.headers.get("x-anker-model-rejected")).toBe("not-selectable")
  expect(res.headers.get("x-anker-model")).toBeNull()
  const rows = await rejections()
  expect(rows).toHaveLength(1)
  expect(rows[0].error).toBe("not-selectable")
  expect(rows[0].requested_model).toBe("qwen-plus")
  // And the model was not passed to the runtime despite being a real model.
  for (const o of state.streamOpts) expect(o.model).toBeUndefined()
  await db.exec("DELETE FROM system_settings")
  invalidateRouterConfig()
})

it("passes the user's provenance claim down to every call of a run", async () => {
  state.org = "org-a"
  state.generate.mockReset()
  state.generate.mockResolvedValueOnce("ok").mockResolvedValueOnce('{"final":"Answered."}')
  await ask({ scopeKey: "org:org-a", task: "hi", model: "qwen-plus", maxSteps: 2 })
  // Not just the first call: a multi-step run that labelled only step one would
  // under-report the rule that chose the model for the rest.
  expect(state.generate.mock.calls.length).toBeGreaterThan(1)
  for (const call of state.generate.mock.calls) {
    expect(call[1]?.resolution).toBe("request")
    expect(call[1]?.requestedModel).toBe("qwen-plus")
  }
})
