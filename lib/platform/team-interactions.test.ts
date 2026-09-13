// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { WorkspaceTeam } from '@/components/workspaces/team'
import { LegacyWorkspaceRecords } from '@/components/workspaces/legacy-records'
let root:Root, container:HTMLDivElement
let calls:{url:string;method:string;body:any}[]
let response:(url:string,method:string,body:any)=>{status?:number;data:any}
const member={user_id:'member',contact_email:'member@example.test',org_role:'member',can_send_outreach:false}
const team={workspace:{name:'Company A',kind:'company',team_revision:4},actorId:'owner',isOwner:true,canManage:true,emailAvailable:false,
 members:[{user_id:'owner',contact_email:'owner@example.test',org_role:'workspace_owner',can_send_outreach:true},member],invitations:[],transfers:[],events:[]}
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);calls=[]
 vi.stubGlobal('fetch',vi.fn(async(url:string,options:any={})=>{const method=options.method||'GET',body=options.body?JSON.parse(options.body):undefined;calls.push({url:String(url),method,body});const result=response(String(url),method,body);return new Response(JSON.stringify(result.data),{status:result.status||200,headers:{'Content-Type':'application/json'}})}))
 container=document.createElement('div');document.body.appendChild(container);root=createRoot(container)
 response=()=>({data:team})
})
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals()})
const render=(element:React.ReactNode)=>act(async()=>root.render(element))
const button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text)!
const click=(element:HTMLElement)=>act(async()=>element.click())
it('opens a named transfer confirmation, cancels with Escape, and returns focus without mutation',async()=>{
 await render(createElement(WorkspaceTeam,{orgId:'a'}))
 const trigger=button('Transfer ownership');trigger.focus();await click(trigger)
 const dialog=document.querySelector('[role="dialog"]')!
 expect(dialog.textContent).toContain('Request ownership transfer?')
 expect(dialog.contains(document.activeElement)).toBe(true)
 await act(async()=>{document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))})
 expect(document.querySelector('[role="dialog"]')).toBeNull()
 await vi.waitFor(()=>expect(document.activeElement).toBe(trigger))
 expect(calls.filter(c=>c.method==='POST')).toHaveLength(0)
})
it('refreshes a stale team revision without automatically retrying a permission change',async()=>{
 let revision=4
 response=(_url,method)=>method==='POST'?(revision=5,{status:409,data:{error:'Team changed. Review again.'}}):{data:{...team,workspace:{...team.workspace,team_revision:revision}}}
 await render(createElement(WorkspaceTeam,{orgId:'a'}));await click(button('Remove'));await click(button('Confirm change'))
 expect(calls.filter(c=>c.method==='POST')).toHaveLength(1)
 expect(calls.find(c=>c.method==='POST')?.body).toEqual({action:'remove_member',userId:'member',revision:4})
 expect(document.querySelector('[role="alert"]')?.textContent).toContain('Team changed')
 expect(document.querySelector('[role="dialog"]')).not.toBeNull()
 await click(button('Cancel'))
})
it('offers a viewer no invite, role-change, transfer or archive controls',async()=>{
 response=()=>({data:{...team,isOwner:false,canManage:false,actorId:'member',members:[{...member,org_role:'viewer'}]}})
 await render(createElement(WorkspaceTeam,{orgId:'a'}))
 expect(button('Create invitation')).toBeUndefined();expect(button('Save role')).toBeUndefined();expect(button('Archive workspace')).toBeUndefined()
 expect(button('Leave workspace')).toBeDefined()
})
it('requires review before moving a legacy board, preserves the destination and reports a conflict',async()=>{
 response=(_url,method)=>method==='POST'?{status:409,data:{error:'Duplicate relationship. Nothing was moved.'}}:{data:{orgId:'a',workspace:'Company A',canWrite:true,boards:[{id:'old',name:'Private board',count:2}],contacts:[],updates:[]}}
 await render(createElement(LegacyWorkspaceRecords))
 const trigger=button('Review move');await click(trigger)
 expect(calls.filter(c=>c.method==='POST')).toHaveLength(0)
 expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Share this record with Company A?')
 await click(button('Move to workspace'))
 expect(calls.find(c=>c.method==='POST')?.body).toEqual({orgId:'a',kind:'board',id:'old',confirmed:true})
 expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Nothing was moved')
 await click(button('Cancel'));await vi.waitFor(()=>expect(document.activeElement).toBe(trigger))
})
