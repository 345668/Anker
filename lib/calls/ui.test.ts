// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { CallIntelligence } from "@/components/calls/call-intelligence"
let root: Root, container: HTMLDivElement
let persona = "founder", failLoad = false
const posts: { url: string; body: any; headers: any }[] = []
const call = { id: "call-a", title: "Diligence conversation", created_at: "2026-09-10T10:00:00Z", status: "captured", source: "desktop" }
beforeEach(() => {
  persona = "founder"; failLoad = false; posts.length = 0
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    if (options?.method && options.method !== "GET") {
      posts.push({ url, body: options.body ? JSON.parse(options.body) : null, headers: options.headers })
      return new Response(JSON.stringify({ error: "Temporary failure. Retry." }), { status: 503 })
    }
    if (failLoad) return new Response(JSON.stringify({ error: "Offline" }), { status: 503 })
    const data = url.endsWith("/releases") ? { releases: [] } : url.endsWith("/devices") ? { devices: [] } : url.endsWith("/contacts") ? { contacts: [] } : {
      calls: [call], legacy: [], scope: { userId: "u", orgId: "a", persona, writable: true, workspace: "Alpha" },
    }
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })
  }))
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })
async function render() {
  await act(async () => root.render(createElement(SWRConfig, { value: { provider: () => new Map(), shouldRetryOnError: false, dedupingInterval: 0 } }, createElement(CallIntelligence))))
  await act(async () => { await new Promise(r => setTimeout(r, 20)) })
}
const click = (element: HTMLElement) => act(async () => element.click())
const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.includes(text))!
const input = (label: string) => [...container.querySelectorAll("label")].find(l => l.textContent?.startsWith(label))!.querySelector("input,textarea") as HTMLInputElement
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })) })
}
it("retains failed uploads and their import ID on retry; sends the displayed workspace", async () => {
  await render()
  await type(input("Call title"), "Test call")
  const transcript = input("Transcript")
  await type(transcript, "You: Can you share evidence? Other: Yes, tomorrow.")
  const consent = container.querySelector<HTMLInputElement>('form input[type="checkbox"]')!
  await click(consent)
  await click(button("Save transcript"))
  expect(container.textContent).toContain("Temporary failure")
  expect(transcript.value).toContain("Can you share evidence")
  await click(button("Save transcript"))
  expect(posts).toHaveLength(2)
  expect(posts[0].body.externalId).toBe(posts[1].body.externalId)
  expect(posts[0].headers["x-anker-workspace"]).toBe("a")
})
it("gives LPs private review controls without exposing CRM or outbox actions", async () => {
  persona = "lp"; await render()
  expect(container.textContent).toContain("Limited partner")
  await click(button("Diligence conversation"))
  expect(container.textContent).toContain("Save reviewed notes")
  expect(container.textContent).not.toContain("Create outbox draft")
  expect(container.textContent).not.toContain("Linked contact")
})
it("requires consent for analysis and confirms deletion before a request", async () => {
  await render(); await click(button("Diligence conversation"))
  expect(button("Analyze transcript").disabled).toBe(true)
  await click(button("Delete call")); expect(posts).toHaveLength(0)
  await click(button("Confirm deletion"))
  expect(container.textContent).toContain("Temporary failure")
  expect(container.textContent).toContain("Diligence conversation")
})
it("shows load failure without falsely claiming there are no calls", async () => {
  failLoad = true; await render()
  expect(container.textContent).toContain("Calls are unavailable")
  expect(container.textContent).not.toContain("Your first conversation")
})
