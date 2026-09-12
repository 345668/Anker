// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { PersonaChooser } from "@/components/onboarding/persona-chooser"
import { FounderWizard } from "@/components/onboarding/founder-wizard"
import { VcWizard } from "@/components/onboarding/vc-wizard"

const { push, setTheme } = vi.hoisted(() => ({ push: vi.fn(), setTheme: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark", setTheme }) }))
let root: Root, container: HTMLDivElement
let draft: any, failLoad: boolean, saveStatus: number
const posts: any[] = []
let fetcher: ReturnType<typeof vi.fn>
beforeEach(() => {
  draft = null; failLoad = false; saveStatus = 200; posts.length = 0
  push.mockReset(); setTheme.mockReset()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      const body = JSON.parse(options.body as string); posts.push(body)
      return new Response(JSON.stringify(saveStatus === 200 ? { ok: true, persisted: true, revision: body.revision + 1, workspace: body.completed ? { orgId: "setup-company", name: "Northstar" } : undefined } : { error: "Save failed. Your entries are still here." }), { status: saveStatus })
    }
    return new Response(JSON.stringify(failLoad ? { error: "Unable to load your saved setup." } : { ok: true, draft }), { status: failLoad ? 503 : 200 })
  })
  vi.stubGlobal("fetch", fetcher)
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const render = (Component = FounderWizard) => act(async () => root.render(createElement(Component)))
const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(el => el.textContent?.trim() === label)!
const click = (element: HTMLElement) => act(async () => element.click())
function input(label: string) {
  return [...container.querySelectorAll<HTMLInputElement>("input")].find(el =>
    document.getElementById(el.getAttribute("aria-labelledby") || "")?.textContent?.startsWith(label))!
}
async function type(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value)
    element.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
function saved(step: number, data: any, completed = false) { draft = { step, data, revision: 7, completed } }

it("offers accessible workspace choices, a visible disabled continue action and theme switching", async () => {
  await render(PersonaChooser)
  expect(button("Continue").disabled).toBe(true)
  const radio = container.querySelector<HTMLInputElement>('input[value="vc"]')!
  await click(radio)
  expect(radio.checked).toBe(true)
  await click(button("Continue as a fund"))
  expect(push).toHaveBeenCalledWith("/onboarding/vc")
  expect(container.querySelector('a[href="/lp"]')).not.toBeNull()
  await click(container.querySelector('[aria-label="Switch to light mode"]')!)
  expect(setTheme).toHaveBeenCalledWith("light")
})
it("restores the correct step, entries and revision; focuses the next heading after save", async () => {
  saved(1, { name: "Ada", company: "Northstar", stage: "seed" })
  await render()
  expect(input("Company name").value).toBe("Northstar")
  expect(container.querySelector('[aria-current="step"]')?.textContent).toContain("Your company")
  await click(button("Save and continue"))
  expect(posts[0]).toMatchObject({ account_type: "founder", revision: 7, step: 2, completed: false })
  expect(document.activeElement).toBe(container.querySelector("h1"))
  expect(container.querySelector("h1")?.textContent).toBe("Your fundraising plans")
})
it("retains entries and revision after failed save, and uses the same revision on retry", async () => {
  saveStatus = 503
  await render()
  await type(input("Full name"), "Ada Lovelace")
  await click(button("Save and continue"))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Save failed")
  expect(input("Full name").value).toBe("Ada Lovelace")
  expect(document.activeElement).toBe(container.querySelector('[role="alert"]'))
  saveStatus = 200
  await click(button("Save and continue"))
  expect(posts).toHaveLength(2)
  expect(posts[0].revision).toBe(posts[1].revision)
  expect(container.querySelector("h1")?.textContent).toBe("Your company")
})
it("saves an incomplete step before exiting and does not falsely complete the workspace", async () => {
  await render()
  await type(input("Title"), "Co-founder")
  await click(button("Save and exit"))
  expect(posts[0]).toMatchObject({ step: 0, completed: false, data: { title: "Co-founder" } })
  expect(push).toHaveBeenCalledWith("/onboarding")
})
it("requires valid fields to continue and gives fund sector selection an actionable error", async () => {
  await render()
  await click(button("Save and continue"))
  expect(posts).toHaveLength(0)
  expect(input("Full name").required).toBe(true)
  saved(2, { name: "Rin", firm: "Aurora", theses: [] })
  await act(async () => root.render(createElement(VcWizard)))
  await click(button("Save and continue"))
  expect(posts).toHaveLength(0)
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Choose at least one investment sector")
  await click(button("Climate"))
  await click(button("Save and continue"))
  expect(posts[0]).toMatchObject({ account_type: "vc", data: { theses: ["Climate"] } })
  expect(container.textContent).toContain("Your LP relationships")
  expect(container.textContent).not.toContain("Upload an LP list")
})
it("recovers from a load failure without displaying editable empty setup or overwriting a draft", async () => {
  failLoad = true
  await render()
  expect(container.querySelector("form")).toBeNull()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable to load")
  failLoad = false; saved(0, { name: "Saved name" })
  await click(button("Retry loading setup"))
  expect(input("Full name").value).toBe("Saved name")
  expect(posts).toHaveLength(0)
})
it("confirms draft replacement before discarding unsaved edits", async () => {
  saved(0, { name: "Saved name" }); saveStatus = 409
  await render()
  await type(input("Full name"), "Unsaved name")
  await click(button("Save and continue"))
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
  await click(button("Reload saved draft"))
  expect(confirm).toHaveBeenCalled()
  expect(input("Full name").value).toBe("Unsaved name")
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it("finishes the optional fund step only after persistence and renders the complete progress state", async () => {
  saved(3, { name: "Rin", firm: "Aurora", theses: ["Climate"], lpTypes: ["Family office"] })
  await render(VcWizard)
  await click(button("Finish setup"))
  expect(posts[0]).toMatchObject({ completed: true, step: 3, data: { lpTypes: ["Family office"] } })
  expect(container.querySelector("h1")?.textContent).toBe("Your workspace is ready.")
  expect(container.querySelector("progress")?.value).toBe(5)
  expect(container.querySelector('[aria-current="step"]')).toBeNull()
  expect(button("Open workspace")).toBeDefined()
})
it("does not present an interrupted deck upload as saved or keep the wizard permanently locked", async () => {
  saved(3, { name: "Ada", company: "Northstar", target: "EUR 1M", deck: "pitch.pdf", deckUpload: "uploading" })
  await render()
  expect(container.textContent).toContain("upload was interrupted")
  expect(button("Finish setup").disabled).toBe(false)
  expect(container.textContent).not.toContain("Deck saved to your fundraising data room.")
})
it("shows a document upload failure on the final step and allows completion without the optional deck", async () => {
  saved(3, { name: "Ada", company: "Northstar", target: "EUR 1M" })
  await render()
  const file = container.querySelector<HTMLInputElement>('input[type="file"]')!
  fetcher.mockImplementationOnce(async () => new Response(JSON.stringify({ error: "Storage unavailable." }), { status: 503 }))
  await act(async () => {
    Object.defineProperty(file, "files", { value: [new File(["test"], "pitch.pdf", { type: "application/pdf" })], configurable: true })
    file.dispatchEvent(new Event("change", { bubbles: true }))
  })
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Storage unavailable")
  expect(button("Finish setup").disabled).toBe(false)
  await click(button("Finish setup"))
  expect(container.querySelector("h1")?.textContent).toBe("Your workspace is ready.")
})
it("keeps the current step when provisioning fails and uses the persisted draft revision for retry", async () => {
  await render()
  await type(input("Full name"), "Ada")
  fetcher.mockImplementationOnce(async () => new Response(JSON.stringify({
    ok: false, revision: 1, error: "Your draft is saved, but workspace setup could not finish. Retry this step.",
  }), { status: 503 }))
  await click(button("Save and continue"))
  expect(container.querySelector("h1")?.textContent).toBe("Your profile")
  expect(input("Full name").value).toBe("Ada")
  await click(button("Save and continue"))
  expect(posts[0].revision).toBe(1)
  expect(container.querySelector("h1")?.textContent).toBe("Your company")
})
it("blocks duplicate saves and editing while a save is in flight", async () => {
  await render()
  await type(input("Full name"), "Ada")
  let finish!: (value: Response) => void
  fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  await click(button("Save and continue"))
  expect(button("Saving…").disabled).toBe(true)
  expect(button("Save and exit").disabled).toBe(true)
  expect(input("Full name").closest("fieldset[disabled]")).not.toBeNull()
  await click(button("Saving…"))
  expect(fetcher).toHaveBeenCalledTimes(2)
  await act(async () => finish(new Response(JSON.stringify({ ok: true, persisted: true, revision: 1 }))))
  expect(container.querySelector("h1")?.textContent).toBe("Your company")
})

it("allows founders to finish setup without inventing a fundraising target", async () => {
  saved(2, { name: "Ada", company: "Northstar" })
  await render()
  expect(input("Target amount").required).toBe(false)
  await click(button("Skip for now"))
  expect(posts[0].data.target).toBeUndefined()
  await click(button("Finish setup"))
  expect(container.querySelector("h1")?.textContent).toBe("Your workspace is ready.")
  expect(container.textContent).toContain("Your next steps")
})
it("routes deck reading through onboarding and never reads from the currently active company", async () => {
  saved(1, { name: "Ada", company: "Northstar" })
  await render()
  const upload = container.querySelector<HTMLInputElement>('input[type="file"]')!
  fetcher.mockImplementationOnce(async (url: string) => {
    expect(url).toBe("/api/dataroom/founder/upload?onboarding=1")
    return new Response(JSON.stringify({ ok: true, id: "reserved-deck" }))
  }).mockImplementationOnce(async (url: string) => {
    expect(url).toBe("/api/onboarding/extract")
    return new Response(JSON.stringify({ fields: { name: "Deck company", sectors: ["Climate"] } }))
  })
  await act(async () => {
    Object.defineProperty(upload, "files", { value: [new File(["%PDF-test"], "deck.pdf", { type: "application/pdf" })], configurable: true })
    upload.dispatchEvent(new Event("change", { bubbles: true }))
  })
  expect(input("Company name").value).toBe("Deck company")
  expect(fetcher.mock.calls.some(([url]) => String(url).includes("/file"))).toBe(false)
})
it("keeps a completed setup visible when activating its workspace fails", async () => {
  saved(3, { name: "Ada", company: "Northstar" })
  await render()
  await click(button("Finish setup"))
  fetcher.mockImplementationOnce(async (url: string, options: RequestInit) => {
    expect(url).toBe("/api/org/active")
    expect(JSON.parse(options.body as string)).toEqual({ orgId: "setup-company" })
    return new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 })
  })
  await click(button("Open workspace"))
  expect(container.querySelector("h1")?.textContent).toBe("Your workspace is ready.")
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be opened")
  expect(button("Open workspace").disabled).toBe(false)
})
