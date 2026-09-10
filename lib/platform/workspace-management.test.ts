// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { WorkspaceManager } from "@/components/data/workspace-manager"
import { parseWorkspaceInput } from "@/lib/org/workspaces"

const founder = { orgId: "org-founder", name: "Acme Labs", kind: "company" as const, orgRole: "workspace_owner", persona: "founder" as const, canSendOutreach: true, settings: { profile: { stage: "Seed", sectors: ["Climate"] } }, fundId: null, ownerUserId: "user-1" }
const lp = { orgId: "org-lp", name: "Harbor LP", kind: "fund" as const, orgRole: "viewer", persona: "lp" as const, canSendOutreach: false, settings: {}, fundId: "fund-1", ownerUserId: "other" }
let root: Root, container: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function () { this.open = true }
  if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function () { this.open = false }
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, workspace: founder }), { status: 200 })))
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
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
