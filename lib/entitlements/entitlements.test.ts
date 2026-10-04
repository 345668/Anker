import { describe, it, expect } from "vitest"
import { resolveEffective, bucketOf, flagOn, canMove, minRoleFor, refusal, FEATURE_KEYS, type PlanRow } from "./model"

const pro: PlanRow = { plan: "pro", features: { assistant: true, outreach: true, linkedin: true, intake: true, tools: true, matchmaking: true, fund_ops: true, spvs: false, deals: true }, limits: { ai_spend_usd_month: 100, seats: 10 } }
const starter: PlanRow = { plan: "starter", features: { assistant: true, outreach: true, tools: true }, limits: { seats: 2, outreach_sends_day: 50 } }

describe("resolveEffective", () => {
  it("no plan and no overrides is open: everything allowed, nothing limited", () => {
    const e = resolveEffective({ plan: null, overrides: null, lifecycle: null })
    expect(e.open).toBe(true); expect(FEATURE_KEYS.every((k) => e.features[k])).toBe(true); expect(Object.values(e.limits).every((l) => l === null)).toBe(true); expect(e.state).toBe("active")
  })
  it("a plan decides features and limits; a missing feature is off, a missing limit is unlimited", () => {
    const e = resolveEffective({ plan: starter, overrides: { plan: "starter", features: {}, limits: {} }, lifecycle: null })
    expect(e.open).toBe(false); expect(e.features.linkedin).toBe(false); expect(e.features.assistant).toBe(true); expect(e.limits.seats).toBe(2); expect(e.limits.storage_mb).toBeNull()
  })
  it("overrides beat the plan in both directions, and null means unlimited", () => {
    const e = resolveEffective({ plan: starter, overrides: { plan: "starter", features: { linkedin: true, outreach: false }, limits: { seats: null, outreach_sends_day: 500 } }, lifecycle: null })
    expect(e.features.linkedin).toBe(true); expect(e.features.outreach).toBe(false); expect(e.limits.seats).toBeNull(); expect(e.limits.outreach_sends_day).toBe(500)
  })
  it("overrides with no plan apply on top of an otherwise open workspace", () => {
    const e = resolveEffective({ plan: null, overrides: { plan: null, features: { linkedin: false }, limits: { seats: 3 } }, lifecycle: null })
    expect(e.features.linkedin).toBe(false); expect(e.features.assistant).toBe(true); expect(e.limits.seats).toBe(3)
  })
  it("carries the lifecycle and maintenance", () => {
    const e = resolveEffective({ plan: pro, overrides: null, lifecycle: { state: "paused", reason: "unpaid" }, maintenance: true })
    expect(e).toMatchObject({ state: "paused", stateReason: "unpaid", maintenance: true })
  })
})

describe("refusal", () => {
  const eff = (state: any, maintenance = false, plan: PlanRow | null = null) => resolveEffective({ plan, overrides: null, lifecycle: { state }, maintenance })
  it("a paused or closing workspace cannot run AI, send, take applications or convert, but is not refused for reading", () => {
    for (const a of ["ai", "send", "intake", "convert"] as const) { expect(refusal(eff("paused"), a)?.code).toBe("paused"); expect(refusal(eff("offboarding"), a)?.code).toBe("offboarding") }
    expect(refusal(eff("active"), "ai")).toBeNull(); expect(refusal(eff("trial"), "send")).toBeNull()
  })
  it("maintenance stops AI and sends for everyone but not intake or conversion", () => {
    expect(refusal(eff("active", true), "ai")?.code).toBe("maintenance"); expect(refusal(eff("active", true), "send")?.code).toBe("maintenance")
    expect(refusal(eff("active", true), "intake")).toBeNull()
  })
  it("a module the plan lacks is refused with an upgrade message, one it has is not", () => {
    expect(refusal(eff("active", false, starter), "ai", "linkedin")?.code).toBe("module"); expect(refusal(eff("active", false, starter), "ai", "assistant")).toBeNull()
  })
})

describe("flags and lifecycle rules", () => {
  it("a rollout bucket is stable and spreads workspaces", () => {
    expect(bucketOf("f", "org-1")).toBe(bucketOf("f", "org-1"))
    const b = Array.from({ length: 400 }, (_, i) => bucketOf("f", `org-${i}`)); const lo = b.filter((x) => x < 50).length
    expect(lo).toBeGreaterThan(140); expect(lo).toBeLessThan(260)
  })
  it("a flag is on only when enabled and inside its rollout", () => {
    expect(flagOn({ enabled: true, rollout_pct: 100 }, "f", "o")).toBe(true); expect(flagOn({ enabled: true, rollout_pct: 0 }, "f", "o")).toBe(false)
    expect(flagOn({ enabled: false, rollout_pct: 100 }, "f", "o")).toBe(false); expect(flagOn(undefined, "f", "o")).toBe(false)
  })
  it("moves: pause and resume are allowed, a no-op is not, closing needs a superadmin", () => {
    expect(canMove("active", "paused")).toBe(true); expect(canMove("paused", "active")).toBe(true); expect(canMove("active", "active")).toBe(false); expect(canMove("offboarding", "trial")).toBe(false)
    expect(minRoleFor("offboarding")).toBe("superadmin"); expect(minRoleFor("paused")).toBe("admin")
  })
})

import { featureForPath } from "./routes"
describe("featureForPath", () => {
  it("maps module paths, longest prefix first, and leaves the rest alone", () => {
    expect(featureForPath("/dashboard/portfolio/fund/intake")).toBe("intake")
    expect(featureForPath("/dashboard/portfolio/fund/deals/abc")).toBe("deals")
    expect(featureForPath("/dashboard/portfolio/fund/calls")).toBe("fund_ops")
    expect(featureForPath("/dashboard/outreach/consent")).toBe("outreach")
    expect(featureForPath("/dashboard/linkedin/campaigns/?x=1")).toBe("linkedin")
    expect(featureForPath("/dashboard")).toBeNull(); expect(featureForPath("/dashboard/settings")).toBeNull(); expect(featureForPath(null)).toBeNull()
    expect(featureForPath("/dashboard/outreachx")).toBeNull()
  })
})
