// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import React, { act, createElement as h } from "react"
import { createRoot, type Root } from "react-dom/client"
import { LpRunSummary } from "@/components/matching/lp-run-summary"
import { CodeChips, LpMandatePanel } from "@/components/matching/lp-mandate-panel"
import { LpHistory, type HistoryRun } from "@/components/matching/lp-history"

let root: Root | null = null, box: HTMLElement
beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; box?.remove(); vi.unstubAllGlobals() })
const mount = (el: React.ReactElement) => { box = document.createElement("div"); document.body.appendChild(box); root = createRoot(box); act(() => root!.render(el)); return box }
const type = (input: HTMLInputElement, value: string) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; set.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })) }

const base = { fundName: "Fund II", durationMs: 4200, totals: { rawFirms: 21024, rawContacts: 50074, qualifiedFirms: 383, qualifiedContacts: 576 } }

describe("the run summary", () => {
  it("states the headline, what changed since the last run, every reason that removed rows, and the confidence mix", () => {
    const el = mount(h(LpRunSummary, { minScore: 20, s: { ...base, filterSummary: "US — Family office",
      exclusions: { total: 5, inCrm: 3, declined: 1, jurisdiction: 1 }, confidenceCounts: { firms: { high: 194, medium: 21, low: 168 }, contacts: { high: 1, medium: 1, low: 1 } },
      sincePrevious: { previousSessionId: "p", previousAt: "2026-10-18T10:00:00Z", newCount: 4, droppedCount: 2, newFirms: ["A", "B"], droppedFirms: ["C"], firmsDelta: 2, contactsDelta: 0 } } }))
    const t = el.textContent!
    expect(t).toContain("383 firms and 576 people qualified")
    expect(t).toContain("4.2 s · US — Family office")
    expect(t).toContain("4 firms new")
    expect(t).toContain("2 no longer shown")
    expect(t).toContain("Left out before scoring · 5")
    expect(t).toContain("3 already in your CRM")
    expect(t).toContain("1 passed or declined")
    expect(t).toContain("1 in countries your fund does not approach")
    expect(el.querySelector('[role="img"]')!.getAttribute("aria-label")).toBe("194 high, 21 medium, 168 low confidence")
    expect(el.querySelector("details")!.textContent).toContain("New: A, B")
  })
  it("says why nothing qualified and what to try, and offers to show the ones already in the CRM", () => {
    const onShow = vi.fn()
    const el = mount(h(LpRunSummary, { minScore: 40, onShowKnown: onShow, s: { ...base, totals: { rawFirms: 441, rawContacts: 756, qualifiedFirms: 0, qualifiedContacts: 0 }, filterSummary: "Germany", exclusions: { total: 120, inCrm: 100, jurisdiction: 20 } } }))
    const t = el.textContent!
    expect(t).toContain("No LP qualified")
    expect(t).toContain("441 firms and 756 people were looked at, 120 were left out by your rules, and none scored 40 or more.")
    expect(t).toContain('The mandate ("Germany")')
    expect(t).toContain("100 are already in your CRM.")
    expect(t).toContain("20 are in countries your fund's rules exclude.")
    act(() => (Array.from(el.querySelectorAll("button")).find((b) => b.textContent === "Show them anyway") as HTMLButtonElement).click())
    expect(onShow).toHaveBeenCalledOnce()
  })
  it("keeps quiet about exclusions when nothing was left out", () => {
    const el = mount(h(LpRunSummary, { minScore: 20, s: { ...base, exclusions: { total: 0 } } }))
    expect(el.textContent).not.toContain("Left out before scoring")
  })
})

describe("country codes", () => {
  it("accepts two-letter codes typed with commas or Enter, upper-cases them, ignores anything else, and removes on click", () => {
    const changes: string[][] = []
    const Harness = () => { const [c, setC] = React.useState<string[]>([]); return h(CodeChips, { label: "Countries", codes: c, onChange: (v: string[]) => { changes.push(v); setC(v) }, hint: "hint", empty: "empty" }) }
    const el = mount(h(Harness))
    const input = el.querySelector("input") as HTMLInputElement
    act(() => type(input, "us, de xyz 7"))
    act(() => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })) })
    expect(changes.at(-1)).toEqual(["US", "DE"])
    expect(el.textContent).toContain("US ×")
    act(() => (el.querySelector('button[aria-label="Remove US"]') as HTMLButtonElement).click())
    expect(changes.at(-1)).toEqual(["DE"])
  })
})

describe("the fund's own rules", () => {
  it("saves them to the profile, and says when someone else owns the profile", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal("fetch", fetchMock)
    const saved = vi.fn()
    const el = mount(h(LpMandatePanel, { regions: [], setRegions() {}, classes: [], setClasses() {}, countries: [], setCountries() {}, includeKnown: false, setIncludeKnown() {}, fund: { id: "fp1", allowedLpClasses: [], excludedJurisdictions: [] }, onRulesSaved: saved }))
    const details = el.querySelector("details")!
    const input = Array.from(details.querySelectorAll("input")).find((i) => i.getAttribute("aria-label")?.startsWith("Never approach")) as HTMLInputElement
    const save = Array.from(details.querySelectorAll("button")).find((b) => b.textContent === "Save the rules") as HTMLButtonElement
    expect(save.disabled).toBe(true) // nothing changed yet
    act(() => type(input, "ru"))
    act(() => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })) })
    expect(save.disabled).toBe(false)
    await act(async () => { save.click() })
    expect(fetchMock).toHaveBeenCalledWith("/api/lp/fund-profiles/fp1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ allowedLpClasses: [], excludedJurisdictions: ["RU"] }) }))
    expect(saved).toHaveBeenCalledWith({ allowedLpClasses: [], excludedJurisdictions: ["RU"] })
    expect(el.textContent).toContain("Saved. Every run now follows these rules.")
    // a teammate cannot edit a profile they did not create: the server says so and the panel shows it
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Profile not found in this workspace." }) } as any)
    act(() => type(input, "kp")); act(() => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })) })
    await act(async () => { (Array.from(details.querySelectorAll("button")).find((b) => b.textContent === "Save the rules") as HTMLButtonElement).click() })
    expect(el.textContent).toContain("Profile not found in this workspace.")
  })
})

describe("run history", () => {
  const run = (id: string, over: Partial<HistoryRun> = {}): HistoryRun => ({ id, fundProfileId: "fp1", fundName: "Fund II", createdAt: "2026-10-19T10:00:00Z", source: "assistant", parentSessionId: null, filters: { countries: ["US"], classes: ["family_office"] }, options: null, exclusions: { total: 3 }, qualifiedFirms: 383, qualifiedContacts: 576, contactsWithEmail: 100, anchorCandidates: 9, ...over })
  it("lists the workspace's runs with who started them, the mandate, what was left out and a zip link", () => {
    const el = mount(h(LpHistory, { runs: [run("a"), run("b", { source: "page", filters: null, exclusions: null, parentSessionId: "a" })], openId: "a", onOpen() {}, onRerun() {}, canRerun: () => true, busy: false }))
    const t = el.textContent!
    expect(t).toContain("Anker AI")
    expect(t).toContain("3 left out")
    expect(t).toContain("Whole directory")
    expect(t).toContain("refines an earlier run")
    expect((el.querySelector('a[href="/api/lp/export/bundle/a"]') as HTMLAnchorElement).textContent).toContain("Zip")
  })
  it("compares two chosen runs through the API and shows the difference; runs again only when the profile still exists", async () => {
    const cmp = { newer: run("b"), older: run("a", { createdAt: "2026-10-18T10:00:00Z" }), newFirms: ["New FO"], droppedFirms: ["Old FO"], newCount: 1, droppedCount: 1, firmsDelta: 0, contactsDelta: 5 }
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => cmp }))
    vi.stubGlobal("fetch", fetchMock)
    const onRerun = vi.fn()
    const el = mount(h(LpHistory, { runs: [run("b"), run("a", { fundProfileId: "gone" })], openId: null, onOpen() {}, onRerun, canRerun: (r) => r.fundProfileId === "fp1", busy: false }))
    expect(el.textContent).not.toContain("Compare the two")
    for (const box of Array.from(el.querySelectorAll('input[type="checkbox"]'))) act(() => (box as HTMLInputElement).click())
    await act(async () => { (Array.from(el.querySelectorAll("button")).find((b) => b.textContent === "Compare the two") as HTMLButtonElement).click() })
    expect(fetchMock).toHaveBeenCalledWith("/api/lp/matching/sessions/b/compare?with=a") // the order chosen; the server puts the newer first
    expect(el.textContent).toContain("+5 people")
    expect(el.textContent).toContain("New: New FO")
    expect(el.textContent).toContain("No longer shown: Old FO")
    const rerun = Array.from(el.querySelectorAll("button")).filter((b) => b.textContent === "Run again") as HTMLButtonElement[]
    expect(rerun.map((b) => b.disabled)).toEqual([false, true])
    act(() => rerun[0].click())
    expect(onRerun).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }))
  })
})
