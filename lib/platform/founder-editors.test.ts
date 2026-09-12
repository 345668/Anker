// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { SWRConfig } from "swr"
import { PlanningWorkspace } from "@/components/planning/planning-workspace"
import { NativeStudio } from "@/components/decks/native-studio"
import { UpdateBuilder } from "@/components/updates/update-builder"
import { DEFAULT_RUNWAY } from "@/lib/planning/models"
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("framer-motion", () => ({ useReducedMotion: () => true }))
vi.mock("recharts", () => ({ ResponsiveContainer: () => null, AreaChart: () => null, Area: () => null, CartesianGrid: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null }))
let root: Root, container: HTMLDivElement
let calls: {url:string; method:string; body:any}[]
let responder: (url:string, method:string, body:any) => any
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true)
  container=document.createElement('div'); document.body.appendChild(container); root=createRoot(container); calls=[]
  vi.stubGlobal('fetch',vi.fn(async(url:string,options:any={})=>{const method=options.method||'GET',body=options.body?JSON.parse(options.body):undefined;calls.push({url:String(url),method,body});return new Response(JSON.stringify(responder(String(url),method,body)),{headers:{'Content-Type':'application/json'}})}))
})
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals()})
const render=async(element:React.ReactNode)=>{await act(async()=>root.render(createElement(SWRConfig,{value:{provider:()=>new Map(),dedupingInterval:0}},element)));await act(async()=>{await new Promise(r=>setTimeout(r,20))})}
const buttons=()=>[...container.querySelectorAll<HTMLButtonElement>('button')]
const button=(text:string)=>buttons().find(b=>b.textContent?.includes(text))!
async function fill(input:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})}
it('saves a planning edit with its workspace and original revision',async()=>{
  responder=(_url,method,body)=>method==='PUT'?{record:{state:body.state,revision:3,updated_at:'2026-09-12'}}:{orgId:'a',name:'Company A',canWrite:true,record:{state:DEFAULT_RUNWAY,revision:2,updated_at:'2026-09-12'}}
  await render(createElement(PlanningWorkspace,{tool:'runway',orgId:'a'}))
  await fill(container.querySelector('input')!,'900000')
  expect(container.textContent).toContain('Unsaved changes')
  await act(async()=>button('Save scenario').click())
  expect(calls.find(c=>c.method==='PUT')?.body).toMatchObject({orgId:'a',revision:2,state:{cashOnHand:900000}})
  expect(container.textContent).toContain('Saved scenario / Revision 3')
})
it('persists the selected deck round instead of a client-only change',async()=>{
  const deck={id:'deck',title:'Deck',templateKey:'founder-pitch',context:{orgId:'a',name:'Company A',persona:'founder',roundId:null,roundName:null,fundId:null},slides:[{kind:'title',title:'Company A',subtitle:'Overview',bullets:[],notes:''}],revision:0,updatedAt:'2026-09-12'}
  responder=(url,method,body)=>method==='PATCH'?{deck:{...deck,revision:1,context:{...deck.context,roundId:body.roundId}}}:url.startsWith('/api/decks/deck')?{deck}:{context:deck.context,decks:[deck],rounds:[{id:'seed',name:'Seed round'}],templates:[],canWrite:true}
  await render(createElement(NativeStudio,{deckId:'deck',orgId:'a'}))
  await act(async()=>{const select=container.querySelector('select')!;select.value='seed';select.dispatchEvent(new Event('change',{bubbles:true}))})
  await act(async()=>button('Save changes').click())
  expect(calls.find(c=>c.method==='PATCH')?.body).toMatchObject({orgId:'a',roundId:'seed',revision:0})
  expect(container.textContent).toContain('Saved revision 1')
})
it('sends the edited message and allows excluding every recommended recipient',async()=>{
  responder=(url,method)=>method==='POST'?{sent:1,skipped:0}:url==='/api/updates'?{updates:[{id:'u1',title:'Quarterly update',status:'draft',created_at:'2026-09-12'}]}:{update:{id:'u1',title:'Old title',body:'Old body',asks:'',status:'draft',revision:4},recipients:[],recommended:[{crmEntryId:'c1',name:'Investor',email:'investor@example.test'}]}
  await render(createElement(UpdateBuilder))
  await act(async()=>button('Quarterly update').click())
  await act(async()=>{await new Promise(r=>setTimeout(r,20))})
  await fill(container.querySelector('input[type="text"], input:not([type])')!,'Reviewed title')
  const checkbox=container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
  await act(async()=>checkbox.click())
  expect(button('Save and send to 0').disabled).toBe(true)
  await act(async()=>checkbox.click())
  await act(async()=>button('Save and send to 1').click())
  expect(calls.find(c=>c.url.endsWith('/send'))?.body).toMatchObject({revision:4,content:{title:'Reviewed title',body:'Old body'},recipients:[{email:'investor@example.test'}]})
})
