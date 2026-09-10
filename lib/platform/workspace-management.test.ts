// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { WorkspaceManager } from "@/components/data/workspace-manager"
import { parseWorkspaceInput } from "@/lib/org/workspaces"
const refresh = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

const founder = { orgId: "org-founder", name: "Acme Labs", kind: "company" as const, orgRole: "workspace_owner", persona: "founder" as const, canSendOutreach: true, settings: { profile: { stage: "Seed", sectors: ["Climate"] } }, fundId: null, ownerUserId: "user-1" }
const lp = { orgId: "org-lp", name: "Harbor LP", kind: "fund" as const, orgRole: "viewer", persona: "lp" as const, canSendOutreach: false, settings: {}, fundId: "fund-1", ownerUserId: "other" }
let root: Root, container: HTMLDivElement

beforeEach(() => {
  refresh.mockClear()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function () { this.open = true }
  if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.open = false }
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, workspace: founder }), { status: 200 })))
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})

it("closes after a successful edit, restores focus and announces the saved workspace", async () => {
  await render()
  const edit = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Edit"))!
  edit.focus(); await click(edit)
  expect(document.activeElement).toBe(container.querySelector('input[placeholder="Acme Labs"]'))
  await click([...container.querySelectorAll("button")].find(button => button.textContent === "Save changes")!)
  expect(container.querySelector("dialog")?.open).toBe(false)
  expect(document.activeElement).toBe(edit)
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Changes saved for Acme Labs")
  expect(refresh).toHaveBeenCalled()
})

it("protects unsaved edits on Escape and allows explicit discard", async () => {
  await render()
  const edit = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Edit"))!
  edit.focus(); await click(edit)
  const input = container.querySelector<HTMLInputElement>('input[placeholder="Acme Labs"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Changed")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await act(async () => { container.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true })) })
  expect(container.querySelector("dialog")?.open).toBe(true)
  expect(container.textContent).toContain("You have unsaved changes")
  await click([...container.querySelectorAll("button")].find(button => button.textContent === "Discard changes")!)
  expect(container.querySelector("dialog")?.open).toBe(false)
  expect(document.activeElement).toBe(edit)
})

it("rejects unsafe URLs and invalid fund sizes before persistence", () => {
  for (const profile of [{ website: "javascript:alert(1)" }, { targetSize: "-200" }, { targetSize: "10m" }, { targetSize: "1000000000000" }]) {
    expect(() => parseWorkspaceInput({ name: "Fund", kind: "fund", profile })).toThrow()
  }
})

it("reuses the creation key after a failed request and leaves switching explicit", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: "Please retry" }), { status: 503 }))
  await render()
  await click([...container.querySelectorAll("button")].find(button => button.textContent?.includes("New workspace"))!)
  const input = container.querySelector<HTMLInputElement>('input[placeholder="Acme Labs"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Second company")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  const create = [...container.querySelectorAll("button")].find(button => button.textContent === "Create workspace")!
  await click(create)
  expect(container.querySelector("dialog")?.open).toBe(true)
  const first = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
  expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/)
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ workspace: { ...founder, orgId: "second", name: "Second company" } }), { status: 201 }))
  await click(create)
  const retry = JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string)
  expect(retry.requestId).toBe(first.requestId)
  expect(container.querySelector("dialog")?.open).toBe(false)
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Second company is ready")
  expect(vi.mocked(fetch).mock.calls.every(([url]) => url === "/api/org/workspaces")).toBe(true)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const render = () => act(async () => root.render(createElement(WorkspaceManager, { initialWorkspaces: [founder, lp], activeOrgId: founder.orgId })))
const click = (element: HTMLElement) => act(async () => element.click())

describe("workspace input contracts", () => {
  it("requires a name and only permits persona-compatible workspace kinds", () => {
    expect(() => parseWorkspaceInput({ name: "", kind: "company", profile: {} })).toThrow()
    expect(parseWorkspaceInput({ name: "Northstar", kind: "fund", profile: { thesis: "Climate" } })).toMatchObject({ name: "Northstar", kind: "fund" })
    expect(() => parseWorkspaceInput({ name: "Northstar", kind: "lp", profile: {} })).toThrow()
  })
})

describe("workspace manager", () => {
  it("shows active state, persona-specific edit controls, and LP read-only fallback", async () => {
    await render()
    expect(container.textContent).toContain("Acme Labs")
    expect(container.textContent).toContain("Active")
    expect(container.textContent).toContain("Managed by invitation")
    await click([...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Edit"))!)
    expect(container.querySelector('input[placeholder="Seed, Series A…"]')).not.toBeNull()
    expect(container.querySelector('textarea[placeholder="What are you building and for whom?"]')).not.toBeNull()
  })

  it("keeps the form open and reports a scoped save failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: "Only workspace owners and admins can edit this workspace" }), { status: 403 }))
    await render()
    await click([...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Edit"))!)
    const save = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Save changes"))!
    await click(save)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Only workspace owners")
    expect(container.querySelector("dialog")?.open).toBe(true)
  })
})
