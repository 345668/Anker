/** The assistant's route into the action layer: the two governed tools become proposals, never writes; reading outside content caps the run. docs/architecture/43 §5. */
import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ propose: vi.fn(), web: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: vi.fn() }))
vi.mock("@/lib/actions/store", () => ({ propose: h.propose }))
vi.mock("@/lib/observability/log", () => ({ logEvent: vi.fn() }))
vi.mock("@/lib/assistant/tools", () => ({ TOOLS: { web_search: { name: "web_search", description: "", params: "", run: h.web } } }))
vi.mock("@/lib/assistant/tools-fo", () => ({ FO_TOOLS: {} }))
vi.mock("@/lib/assistant/tools-modeling", () => ({ MODELING_TOOLS: {} }))
vi.mock("@/lib/assistant/tools-context", () => ({ CONTEXT_TOOLS: {} }))
vi.mock("@/lib/assistant/tools-platform", () => ({ PLATFORM_TOOLS: { crm_update_stage: { name: "crm_update_stage", run: vi.fn() }, crm_add_task: { name: "crm_add_task", run: vi.fn() } } }))
import { executeTool } from "@/lib/assistant/registry"
import { canUseTool } from "@/lib/assistant/policy"
import { withAiContext, type AiPrincipal } from "@/lib/assistant/context"

const principal = (over: Partial<AiPrincipal> = {}): AiPrincipal => ({ userId: "u1", orgId: "org-a", scopeKey: "org:org-a", persona: "founder", membership: { orgRole: "member", kind: "company" } as any, lpMemberships: [], canWrite: true, readonly: false, allowedTools: null, ...over })
const proposal = (over: any = {}) => ({ proposal: { id: "p1", summary: "Move Ann to contacted", source_trust: "trusted", status: "pending", ...over }, applied: false, message: null })
beforeEach(() => { h.propose.mockReset(); h.propose.mockResolvedValue(proposal()); h.web.mockReset(); h.web.mockResolvedValue({ observation: "a page" }) })

describe("assistant path", () => {
  it("members who can write may propose; read-only and non-writing principals may not", () => {
    expect(canUseTool(principal(), "crm_update_stage")).toBe(true)
    expect(canUseTool(principal({ readonly: true }), "crm_update_stage")).toBe(false)
    expect(canUseTool(principal({ canWrite: false }), "crm_add_task")).toBe(false)
    expect(canUseTool(principal(), "enrich_firms")).toBe(false)
  })
  it("a governed tool call proposes, tells the model it is waiting, and writes nothing itself", async () => {
    const p = principal()
    const out = await withAiContext(p, () => executeTool(p, "crm_update_stage", { entryId: "e1", stage: "contacted" }))
    expect(h.propose).toHaveBeenCalledTimes(1)
    expect(h.propose.mock.calls[0][3].trust).toBe("trusted")
    expect(out.observation).toMatch(/Proposed, not applied/); expect(out.observation).toMatch(/do not say it was done/)
  })
  it("after the run read a web page, the proposal is marked untrusted", async () => {
    const p = principal()
    await withAiContext(p, async () => {
      await executeTool(p, "web_search", { query: "x" })
      await executeTool(p, "crm_add_task", { title: "Follow up" })
    })
    expect(h.propose.mock.calls[0][3].trust).toBe("untrusted")
  })
  it("a run with an attachment is untrusted from the start", async () => {
    const p = principal()
    await withAiContext(p, () => executeTool(p, "crm_add_task", { title: "t" }, [{ id: "IMG1", base64: "x" }]))
    expect(h.propose.mock.calls[0][3].trust).toBe("untrusted")
  })
  it("tells the model plainly when policy applied it", async () => {
    h.propose.mockResolvedValue({ ...proposal({ status: "applied" }), applied: true, message: "Ann moved to contacted." })
    const p = principal()
    const out = await withAiContext(p, () => executeTool(p, "crm_update_stage", { entryId: "e1", stage: "contacted" }))
    expect(out.observation).toMatch(/^Done/)
  })
})
