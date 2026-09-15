// @vitest-environment jsdom
// Audit-only probes: these assert the observed defects, not the desired behavior.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ user: {id:"audit-user",email:"audit@example.invalid",user_metadata:{} as Record<string,string>}, sql:vi.fn(), membership:vi.fn(), delivery:vi.fn() }));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:mocks.user}})}})}));
vi.mock("@/lib/db",()=>({sql:mocks.sql}));
vi.mock("@/lib/auth/admin",()=>({isOwner:()=>false,isAdmin:()=>false}));
vi.mock("@/lib/org/active",()=>({resolveActiveMembership:mocks.membership}));
vi.mock("@/lib/outreach/deliver",()=>({deliverApprovedReply:mocks.delivery}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`)}}));
import { requireAdmin,isAdminUser } from "@/lib/auth/require-admin";
import { requirePersona } from "@/lib/auth/persona-guard";
import PipelinePage from "@/app/dashboard/pipeline/page";
import { POST } from "@/app/api/outreach/followups/route";
import { HeaderTrays } from "@/components/shell/header-trays";

beforeEach(()=>{vi.clearAllMocks();mocks.user.user_metadata={};});
it("reproduces admin authorization from user metadata without a trusted role lookup",async()=>{
 mocks.user.user_metadata={role:"admin"};
 expect((await isAdminUser()).isAdmin).toBe(true);
 expect(await requireAdmin()).not.toBeInstanceOf(NextResponse);
 expect(mocks.sql).not.toHaveBeenCalled();
});
it("reproduces the missing-membership pass-through for VC-only routes",async()=>{
 mocks.membership.mockResolvedValue({active:null,all:[]});
 await expect(requirePersona(["vc"])).resolves.toBeUndefined();
});
it("reproduces a founder dashboard pipeline link returning to dashboard",async()=>{
 expect(()=>PipelinePage()).toThrow("REDIRECT:/dashboard/portfolio/fund/deals");
 mocks.membership.mockResolvedValue({active:{persona:"founder"}});
 await expect(requirePersona(["vc"])).rejects.toThrow("REDIRECT:/dashboard");
});
it("reproduces approval recorded before failed delivery, with retry skipped",async()=>{
 mocks.sql.mockResolvedValueOnce([{id:"reply-id",crm_entry_id:"contact-id",draft_response:"Mock draft",classification:"INTERESTED",in_reply_to_message_id:null}]);
 mocks.delivery.mockResolvedValue({ok:false,sent:false,reason:"Mock provider failure"});
 const request=()=>new NextRequest("https://example.invalid/api/outreach/followups",{method:"POST",body:JSON.stringify({replyId:"reply-id",approved:true,send:true}),headers:{"content-type":"application/json"}});
 const first=await POST(request());
 expect(first.status).toBe(200);
 expect(await first.json()).toMatchObject({ok:true,delivery:{ok:false,sent:false}});
 mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{id:"reply-id"}]);
 expect(await (await POST(request())).json()).toEqual({ok:true,alreadyApproved:true});
 expect(mocks.delivery).toHaveBeenCalledTimes(1);
});
it("reproduces a task disappearing from the header tray after a rejected save",async()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 vi.stubGlobal("fetch",vi.fn(async(url:string,options?:RequestInit)=>{
  if(options?.method==="PATCH") return {ok:false,status:500,json:async()=>({error:"Mock failure"})};
  return {ok:true,json:async()=>url==="/api/tasks"?{tasks:[{id:"one",title:"Audit task",stage:"to_do",due_date:null}]}:{}};
 }));
 const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
 try {
  await act(async()=>root.render(createElement(HeaderTrays)));
  await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Tasks"]')!.click());
  expect(container.textContent).toContain("Audit task");
  await act(async()=>container.querySelector<HTMLButtonElement>('[title="Complete"]')!.click());
  expect(container.textContent).not.toContain("Audit task");
  expect(container.textContent).toContain("You're all caught up");
  expect(container.querySelector('[role="alert"]')).toBeNull();
 } finally {await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
});
