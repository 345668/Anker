// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { FindInvestorsContent } from "@/components/tesseract/find-investors-content"
import { FundProfileEditor } from "@/components/tesseract/fund-profile-editor"

vi.mock("@/components/webmcp/find-investors-tools", () => ({ useFindInvestorsWebMcp: () => {} }))
vi.mock("@/components/tesseract/ai-status-badge", () => ({ AiStatusBadge: () => null }))
vi.mock("@/components/tesseract/thesis-enrich-dialog", () => ({ ThesisEnrichDialog: () => null }))
vi.mock("@/components/tesseract/shortlist-uploader", () => ({ ShortlistUploader: () => null }))
let root: Root, container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal("fetch", vi.fn())
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const click = (element: HTMLElement) => act(async () => element.click())
const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === text)!
function input(label: string) {
  const el = [...container.querySelectorAll<HTMLLabelElement>("label")].find(l => l.textContent?.startsWith(label))!
  return (el.htmlFor ? document.getElementById(el.htmlFor) : el.querySelector("input,select,textarea")) as HTMLInputElement
}
const type = (el: HTMLInputElement, value: string) => act(async () => {
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value)
  el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }))
})

it("permits manual startup entry and blocks matching until required fields are complete", async () => {
  await act(async () => root.render(createElement(FindInvestorsContent, { aiAvailable: false })))
  expect(button("Run matching").disabled).toBe(true)
  expect(container.textContent).toContain("Complete these fields")
  await type(input("Startup name"), "Manual Company")
  await type(input("Primary sector"), "climate")
  await type(input("Stage"), "seed")
  await type(input("Location"), "Berlin")
  expect(button("Run matching").disabled).toBe(true)
  await type(input("Round size"), "2.5")
  expect(button("Run matching").disabled).toBe(false)
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "Matching is unavailable. Please retry." }), { status: 503 }))
  await click(button("Run matching"))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Matching is unavailable")
  expect(input("Startup name").value).toBe("Manual Company")
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).startup.askAmount).toBe(2500000)
})

it("fills empty fields from a deck, keeps manual edits and zero revenue, and highlights remaining gaps", async () => {
  await act(async () => root.render(createElement(FindInvestorsContent, { aiAvailable: true })))
  await type(input("Startup name"), "Manual Company")
  const fileInput = container.querySelector<HTMLInputElement>('input[type="file"][accept=".pdf"]')!
  Object.defineProperty(fileInput, "files", { value: [new File(["%PDF-test"], "deck.pdf", { type: "application/pdf" })] })
  await act(async () => { fileInput.dispatchEvent(new Event("change", { bubbles: true })) })
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ fields: { name: "AI Name", stage: "seed", askAmount: 1000, arr: 0, sectors: ["climate"] } })))
  await click(button("AI: extract fields"))
  expect(input("Startup name").value).toBe("Manual Company")
  expect(input("Round size").value).toBe("0.001")
  expect(input("ARR").value).toBe("0")
  expect(button("Run matching").disabled).toBe(true)
  expect(container.textContent).toContain("Company location")
})

it("merges fund deck fields into gaps and retains the draft on save failure", async () => {
  const dirty = vi.fn()
  await act(async () => root.render(createElement(FundProfileEditor, { onDirtyChange: dirty })))
  await type(input("Fund name"), "Manual Fund")
  await act(async () => root.render(createElement(FundProfileEditor, { onDirtyChange: dirty, extracted: { name: "AI Fund", sectors: ["climate"], targetRaiseUsd: 5000000 } })))
  expect(input("Fund name").value).toBe("Manual Fund")
  expect(container.textContent).toContain("Fund headquarters")
  expect(dirty).toHaveBeenLastCalledWith(true)
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "Save unavailable" }), { status: 503 }))
  await click(button("Create profile"))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Save unavailable")
  expect(input("Fund name").value).toBe("Manual Fund")
  const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
  expect(body).toMatchObject({ name: "Manual Fund", sectors: ["climate"], targetRaise: 5000000 })
})

it("prefills the active company's facts and still requires reviewed round economics", async () => {
  await act(async () => root.render(createElement(FindInvestorsContent, { aiAvailable: false, companyDefaults: { name: "Workspace company", stage: "seed", sectorsCsv: "Climate", location: "Berlin" } })))
  expect(input("Startup name").value).toBe("Workspace company")
  expect(input("Location").value).toBe("Berlin")
  expect(input("Round size").value).toBe("")
  expect(button("Run matching").disabled).toBe(true)
})
