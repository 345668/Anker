// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { readFileSync } from "node:fs"
import { DESCRIPTION_MAX, GROUPS, PARTNERS, RESIDENCY_INTERVIEW, listedPartners, partnersByGroup, type Partner } from "./partners"
import { InterviewEmbed, youTubeId } from "@/components/landing/interview-embed"
import PartnersPage from "../../app/partners/page"
import { PartnersStrip } from "@/components/landing/partners-section"

vi.mock("next/navigation", () => ({ usePathname: () => "/partners" }))
let container: HTMLDivElement, root: Root
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })

const ASKED = ["Decile", "The Residency", "The Delta", "Makershome", "Pioneerclub", "Women TechEU", "TBDC", "Innovate UK", "LvlUp Ventures", "Clearco", "Summit Venture Studio", "Winner Capital", "ThirdWorldVC"]

describe("the partners data", () => {
  it("holds every partner the founder named, once each", () => {
    for (const n of ASKED) expect(PARTNERS.filter((p) => p.name.includes(n)), n).toHaveLength(1)
    expect(new Set(PARTNERS.map((p) => p.slug)).size).toBe(PARTNERS.length)
    expect(PARTNERS).toHaveLength(13)
  })
  it("puts every partner in a defined group, and shows the groups in order", () => {
    const keys = GROUPS.map((g) => g.key)
    expect(PARTNERS.every((p) => keys.includes(p.group))).toBe(true)
    expect(partnersByGroup().map((g) => g.key)).toEqual(keys)
  })
  it("keeps a description to one short sentence with no numbers", () => {
    for (const p of PARTNERS) if (p.description) {
      expect(p.description.length, p.name).toBeLessThanOrEqual(DESCRIPTION_MAX)
      expect(p.description, p.name).not.toMatch(/\d/)
      expect(p.description.match(/[.!?](\s|$)/g)?.length ?? 0, p.name).toBeLessThanOrEqual(1)
    }
  })
  it("describes pilots by their role only, with no link and nothing about their strategy", () => {
    const pilots = PARTNERS.filter((p) => p.kind === "pilot")
    expect(pilots.map((p) => p.name).sort()).toEqual(["ThirdWorldVC", "Summit Venture Studio", "Winner Capital"].sort())
    for (const p of pilots) { expect(p.url, p.name).toBeNull(); expect(p.description, p.name).toMatch(/piloting Anker/); expect(p.description, p.name).not.toMatch(/fund of|seed|stage|million|sector|consumer|AI\b|biotech|climate|fintech|university|hospital|emerging/i) }
  })
  it("links only to https addresses, each on a domain that belongs to the partner", () => {
    const expected: Record<string, RegExp> = { "decile-group": /decilegroup\.com$/, "the-residency": /livetheresidency\.com$/, tbdc: /tbdc\.com$/, clearco: /clear\.co$/, "lvlup-ventures": /lvlup\.vc$/, "innovate-uk": /ukri\.org$/, "women-techeu": /europa\.eu$/ }
    for (const p of PARTNERS) if (p.url) { const u = new URL(p.url); expect(u.protocol, p.name).toBe("https:"); expect(u.hostname, p.name).toMatch(expected[p.slug] ?? /^$/) }
    expect(PARTNERS.filter((p) => !p.url).map((p) => p.slug).sort()).toEqual(["makershome", "pioneerclub", "summit-venture-studio", "the-delta", "thirdworldvc", "winner-capital"])
  })
  it("leaves a description empty for a partner whose identity could not be confirmed, until the founder supplies one", () => {
    expect(PARTNERS.filter((p) => p.description === null).map((p) => p.slug).sort()).toEqual(["makershome", "pioneerclub"])
  })
  it("hides a partner everywhere when it is switched off", () => {
    const off: Partner[] = PARTNERS.map((p) => (p.slug === "clearco" ? { ...p, listed: false } : p))
    expect(listedPartners(off).some((p) => p.slug === "clearco")).toBe(false)
    expect(partnersByGroup(off).flatMap((g) => g.partners).some((p) => p.slug === "clearco")).toBe(false)
  })
  it("keeps the confidential details of the pilots out of the data file", () => {
    const src = readFileSync("lib/marketing/partners.ts", "utf8")
    expect(src).not.toMatch(/\$\s?\d|€\s?\d|fund II|Fund II|\bM\b fund|KABLAM|IRIS-X|Servy/i)
  })
})

describe("the partners page and the homepage strip", () => {
  it("renders every listed partner once, grouped, with one h1 and a visit link only where there is a link", async () => {
    await act(async () => root.render(createElement(PartnersPage)))
    expect(container.querySelectorAll("h1")).toHaveLength(1)
    const headings = [...container.querySelectorAll('[aria-labelledby^="g-"] h2')].map((h) => h.textContent)
    expect(headings).toEqual(GROUPS.map((g) => g.title))
    const names = [...container.querySelectorAll('[aria-labelledby^="g-"] h3')].map((h) => h.textContent)
    expect(names.sort()).toEqual(listedPartners().map((p) => p.name).sort())
    const visits = [...container.querySelectorAll("a")].filter((a) => a.textContent?.startsWith("Visit "))
    expect(visits).toHaveLength(PARTNERS.filter((p) => p.url).length)
    for (const a of visits) { expect(a.getAttribute("rel")).toContain("noopener"); expect(a.getAttribute("href")).toMatch(/^https:\/\//) }
    expect(container.textContent).toContain("Design partner")
  })
  it("shows no interview block while there is no source, and no third-party frame on load", async () => {
    await act(async () => root.render(createElement(PartnersPage)))
    expect(container.querySelector("#interview-title")).toBeNull(); expect(container.querySelector("iframe")).toBeNull()
  })
  it("the homepage strip lists the names and links to the page", async () => {
    await act(async () => root.render(createElement(PartnersStrip)))
    expect([...container.querySelectorAll("li")].map((l) => l.textContent).sort()).toEqual(listedPartners().map((p) => p.name).sort())
    expect(container.querySelector('a[href="/partners"]')).not.toBeNull()
  })
  it("is linked from the footer, the About page and the homepage", () => {
    expect(readFileSync("components/landing/footer-section.tsx", "utf8")).toContain('href: "/partners"')
    expect(readFileSync("app/about/page.tsx", "utf8")).toContain('href="/partners"')
    expect(readFileSync("app/page.tsx", "utf8")).toContain("<PartnersStrip />")
  })
})

describe("the interview block", () => {
  const withUrl = { ...RESIDENCY_INTERVIEW, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", date: "2026", transcript: "Line one.\nLine two." }
  it("reads a YouTube address and refuses anything else", () => {
    expect(youTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ"); expect(youTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ"); expect(youTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    for (const bad of ["http://youtu.be/dQw4w9WgXcQ", "https://evil.example/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=short", "javascript:alert(1)", "not a url"]) expect(youTubeId(bad), bad).toBeNull()
  })
  it("renders nothing without a source", async () => {
    await act(async () => root.render(createElement(InterviewEmbed, { interview: RESIDENCY_INTERVIEW })))
    expect(container.innerHTML).toBe("")
  })
  it("loads no frame until Play is pressed, then only from the privacy-friendly address; the transcript and the original link are offered", async () => {
    await act(async () => root.render(createElement(InterviewEmbed, { interview: withUrl })))
    expect(container.querySelector("iframe")).toBeNull()
    expect(container.textContent).toContain("Read the transcript"); expect(container.querySelector('a[href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"]')).not.toBeNull()
    await act(async () => { (container.querySelector("button") as HTMLButtonElement).click() })
    const frame = container.querySelector("iframe")!
    expect(frame.getAttribute("src")).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/)
  })
})
