// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
const state=vi.hoisted(()=>({submit:vi.fn()}))
vi.mock("@/app/early-access/actions",()=>({submitEarlyAccessRequest:state.submit}))
import { WaitlistForm } from "@/components/landing/waitlist-form"
let container:HTMLDivElement,root:Root
beforeEach(async()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true)
 vi.stubGlobal("requestAnimationFrame",(callback:()=>void)=>setTimeout(callback,0))
 container=document.createElement("div");document.body.appendChild(container);root=createRoot(container)
 state.submit.mockReset();await act(async()=>root.render(createElement(WaitlistForm)))
 for (const [name,value] of Object.entries({name:"Tester",email:"person@example.invalid",persona:"founder"})) {
  const input=container.querySelector<HTMLInputElement|HTMLSelectElement>(`[name="${name}"]`)!
  expect(input.labels?.length).toBe(1);input.value=value
 }
 container.querySelector<HTMLInputElement>('[name="consent"]')!.checked=true
})
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals()})
const submit=()=>act(async()=>{container.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))})
it("retains details after a failed save, then announces and focuses success",async()=>{
 state.submit.mockResolvedValueOnce({success:false,message:"Storage unavailable"}).mockResolvedValueOnce({success:true})
 await submit();expect(container.querySelector('[role="alert"]')?.textContent).toContain("Storage unavailable")
 expect(container.querySelector<HTMLInputElement>('[name="email"]')!.value).toBe("person@example.invalid")
 await submit();expect(container.querySelector('[role="status"]')?.textContent).toContain("You’re on the list")
 await vi.waitFor(()=>expect(document.activeElement).toBe(container.querySelector('[role="status"]')))
})
it("prevents duplicate requests while a submission is pending",async()=>{
 let finish!:(result:unknown)=>void
 state.submit.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
 await submit();await submit()
 expect(state.submit).toHaveBeenCalledTimes(1)
 expect(container.querySelector('fieldset')?.disabled).toBe(true)
 await act(async()=>finish({success:false,message:"Try again"}))
 expect(container.querySelector('fieldset')?.disabled).toBe(false)
})
