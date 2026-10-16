import { describe, it, expect, vi, beforeEach } from "vitest"
vi.mock("server-only", () => ({}))
const st = vi.hoisted(() => ({ flag: true, feature: true, state: "active", preset: "standard", member: true }))
vi.mock("@/lib/db", () => ({ sql: Object.assign(async () => (st.member ? [{ ok: 1 }] : []), { unsafe: async () => [] }) }))
vi.mock("@/lib/entitlements", () => ({ isFlagOn: async () => st.flag, getEffective: async () => ({ features: { channel_telegram: st.feature }, state: st.state }) }))
vi.mock("@/lib/ai/data-policy", () => ({ presetFor: async () => st.preset }))
vi.mock("@/lib/assistant/principal", () => ({}))
vi.mock("@/lib/assistant/context", () => ({}))
vi.mock("@/lib/assistant/agent", () => ({}))
vi.mock("@/lib/ai/runtime-config", () => ({}))
vi.mock("@/lib/ai/model-router", () => ({}))
vi.mock("@/lib/db/secrets", () => ({}))
import { gate } from "./runtime"

beforeEach(() => { st.member = true; st.flag = true; st.feature = true; st.state = "active"; st.preset = "standard" })
describe("the workspace gate", () => {
  it("a person who is no longer a member of the workspace is refused, in words, whatever the plan says", async () => {
    expect(await gate({ org_id: "o1", user_id: "u1" })).toBeNull()
    st.member = false; expect(await gate({ org_id: "o1", user_id: "u1" })).toMatch(/no longer a member/)
    expect(await gate({ org_id: "o1" })).toBeNull()       // callers that only know the workspace are unaffected
  })
  it("lets a workspace through only when the channel is on, in its plan, active, and its data policy is standard", async () => {
    expect(await gate({ org_id: "o1" })).toBeNull()
  })
  it("each refusal is in words: platform switch off, not in the plan, paused or offboarding, EU-only or no-external data policy", async () => {
    st.flag = false; expect(await gate({ org_id: "o1" })).toMatch(/not switched on/); st.flag = true
    st.feature = false; expect(await gate({ org_id: "o1" })).toMatch(/plan does not include/); st.feature = true
    for (const s of ["paused", "offboarding"]) { st.state = s; expect(await gate({ org_id: "o1" })).toMatch(/paused/) }
    st.state = "active"
    for (const p of ["eu_only", "no_external"]) { st.preset = p; expect(await gate({ org_id: "o1" })).toMatch(/data policy does not allow/) }
  })
})
