// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { RaisePipelineClient } from "@/components/fundraising/raise-pipeline-client"
import { LpActivityClient } from "@/components/lp/lp-activity-client"

let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("fetch", vi.fn())
  container = document.createElement("div"); document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const round = { id: "round-a", name: "Seed", boardId: "board-a", currency: "EUR", target: 100000, revision: 0 }
const entries = [{ id: "investor-a", name: "Investor A", type: null, tier: null, stage: "meeting", checkSize: 25000, lastContactedAt: null }]
async function renderRaise() { await act(async () => root.render(createElement(RaisePipelineClient, { entries, round }))) }
async function input(element: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(element, value)
    element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }))
  })
}
it("keeps a failed stage change at the saved stage and permits a successful retry", async () => {
  vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Could not save" }) } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => ({ entry: { stage: "committed", check_size: 25000 } }) } as Response)
  await renderRaise()
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Stage for Investor A"]')!
  await input(select, "committed")
  expect(select.value).toBe("meeting")
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("previously saved values")
  expect(select.disabled).toBe(false)
  await input(select, "committed")
  const moved = container.querySelector<HTMLSelectElement>('select[aria-label="Stage for Investor A"]')!
  expect(moved.value).toBe("committed")
  expect(document.activeElement).toBe(moved)
  expect(fetch).toHaveBeenLastCalledWith("/api/crm/entries/investor-a", expect.objectContaining({ body: JSON.stringify({ stage: "committed", roundId: "round-a" }) }))
})
it("retains the persisted target when a concurrent update rejects the edit", async () => {
  vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: "This round changed. Reload before trying again." }) } as Response)
  await renderRaise()
  await input(container.querySelector<HTMLInputElement>("#round-target")!, "200000")
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) })
  expect(fetch).toHaveBeenCalledWith("/api/fundraising/rounds", expect.objectContaining({ body: JSON.stringify({ id: "round-a", target: 200000, revision: 0 }) }))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Reload")
  expect(container.textContent).toMatch(/EUR\s100k remaining/)
  expect(container.textContent).not.toContain("Soft-circled")
})
it("keeps LP acknowledgements unchanged when delivery to the API fails", async () => {
  vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response).mockResolvedValueOnce({ ok: true } as Response)
  await act(async () => root.render(createElement(LpActivityClient, { distributions: [], calls: [{ line_id: "call-a", fund_name: "Fund A", call_number: 1, title: "Call", due_date: null, amount: 100, status: "pending", acknowledged_at: null, currency: "GBP" }] })))
  const button = () => [...container.querySelectorAll("button")].find(b => b.textContent?.trim() === "Acknowledge")!
  await act(async () => button().click())
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("was not saved")
  expect(button()).toBeDefined()
  await act(async () => button().click())
  expect(container.textContent).toContain("Acknowledged")
  expect(container.textContent).toContain("GBP")
  expect(container.textContent).not.toContain("$")
})
