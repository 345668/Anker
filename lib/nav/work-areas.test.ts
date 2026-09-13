import { expect, it } from "vitest"
import { APP_NAV, groupsForPersona, activeWorkspaceDestination } from "./taxonomy"
it.each(["founder", "vc"] as const)("preserves %s tools while grouping them into five work areas and one assistant area", persona => {
  const groups = groupsForPersona(persona)
  expect(groups.filter(g => g.heading !== "Assistant")).toHaveLength(5)
  const routes = groups.flatMap(g => g.items.map(i => i.href))
  const original = APP_NAV.filter(g => !g.personas || g.personas.includes(persona)).flatMap(g => g.items.filter(i => !i.personas || i.personas.includes(persona)).map(i => i.href))
  expect(new Set(routes)).toEqual(new Set(original))
  expect(new Set(routes).size).toBe(routes.length)
})
it("keeps LP work navigation within the LP portal", () => {
  const routes = groupsForPersona("lp").flatMap(g => g.items.map(i => i.href))
  expect(routes).toEqual(["/lp/distributions", "/lp/documents", "/lp/calls"])
})
it("selects the most specific fund destination", () => {
  expect(activeWorkspaceDestination("/dashboard/portfolio/fund/reports", groupsForPersona("vc"))).toBe("/dashboard/portfolio/fund/reports")
  expect(activeWorkspaceDestination("/dashboard/portfolio/fund/deals/example", groupsForPersona("vc"))).toBe("/dashboard/portfolio/fund/deals")
})
it("exposes workspace-authorized portfolio tools while hiding staff-only campaigns", () => {
  const routes = groupsForPersona("vc").flatMap(g => g.items.map(i => i.href))
  expect(routes).not.toContain("/dashboard/campaigns")
  expect(routes).toContain("/dashboard/portfolio")
  expect(routes).toContain("/dashboard/portfolio/compliance")
})
