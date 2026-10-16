import { describe, it, expect } from "vitest"
import { chatDecidable, renderProposal, renderDecision, parseCallback, type PView } from "./proposals"

const P = (o: Partial<PView> = {}): PView => ({ id: "11111111-2222-3333-4444-555555555555", capability: "crm_update_stage", summary: "Move Katja Weber to Contacted", diff: [{ label: "Stage", before: "Queued", after: "Contacted" }], evidence: {}, risk_class: "R0", source_trust: "trusted", status: "pending", ...o })

describe("what may be decided with a tap", () => {
  it("R0 and R1 can; R2 and R3 (anything reaching other people, money or law) and big batches cannot", () => {
    expect(chatDecidable(P()).ok).toBe(true); expect(chatDecidable(P({ risk_class: "R1" })).ok).toBe(true)
    for (const r of ["R2", "R3"] as const) { const d = chatDecidable(P({ risk_class: r })); expect(d.ok).toBe(false); expect((d as any).why).toMatch(/approved in Anker/) }
    expect(chatDecidable(P({ risk_class: "R1", evidence: { requiresTypedCount: true } })).ok).toBe(false)
  })
})
describe("renderProposal", () => {
  it("shows what changes, with Approve and Reject buttons carrying only the proposal id", () => {
    const v = renderProposal(P(), "https://app.test", true)
    expect(v.html).toContain("<b>Move Katja Weber to Contacted</b>"); expect(v.html).toContain("Stage: Queued → <b>Contacted</b>")
    expect(v.markup.inline_keyboard[0]).toEqual([{ text: "Approve", callback_data: "a:11111111-2222-3333-4444-555555555555" }, { text: "Reject", callback_data: "r:11111111-2222-3333-4444-555555555555" }])
    expect(v.markup.inline_keyboard[1][0].url).toBe("https://app.test/dashboard/actions")
    for (const row of v.markup.inline_keyboard) for (const b of row) if (b.callback_data) expect(b.callback_data.length).toBeLessThanOrEqual(64)
  })
  it("a read-only device, or a proposal that reaches other people, gets no Approve button, only a way to open Anker", () => {
    const ro = renderProposal(P(), "https://app.test", false)
    expect(ro.markup.inline_keyboard).toEqual([[{ text: "Open in Anker", url: "https://app.test/dashboard/actions" }]]); expect(ro.html).toContain("read-only")
    const r2 = renderProposal(P({ risk_class: "R2", summary: "Send 12 messages" }), "https://app.test", true)
    expect(JSON.stringify(r2.markup)).not.toContain("callback_data"); expect(r2.html).toContain("approved in Anker")
  })
  it("escapes everything a record or a model wrote, and warns when outside content was involved", () => {
    const v = renderProposal(P({ summary: "Move <b>X</b> & co", diff: [{ label: "Stage <i>", before: null, after: "<script>" }], source_trust: "untrusted" }), "https://app.test", true)
    expect(v.html).toContain("&lt;b&gt;X&lt;/b&gt; &amp; co"); expect(v.html).not.toContain("<script>"); expect(v.html).toContain("outside content")
  })
  it("shows at most six lines of change", () => {
    const diff = Array.from({ length: 12 }, (_, i) => ({ label: `L${i}`, before: null, after: "x" }))
    expect(renderProposal(P({ diff }), "https://app.test", true).html.split("\n").filter((l) => l.startsWith("L")).length).toBe(6)
  })
})
describe("renderDecision and parseCallback", () => {
  it("after applying, the buttons are gone and an Undo is offered only for a reversible change", () => {
    const a = renderDecision(P({ status: "applied" }), "Moved.", "https://app.test", true)
    expect(a.html).toContain("✅ Applied"); expect(a.markup.inline_keyboard).toEqual([[{ text: "Undo", callback_data: "u:11111111-2222-3333-4444-555555555555" }]])
    expect(renderDecision(P({ status: "applied" }), "Moved.", "https://app.test", false).markup.inline_keyboard[0][0].url).toBeTruthy()
    expect(renderDecision(P({ status: "rejected" }), "Nothing was changed.", "https://app.test", true).html).toContain("✖ Rejected")
    expect(JSON.stringify(renderDecision(P({ status: "rejected" }), "x", "https://app.test", true).markup)).not.toContain("callback_data")
  })
  it("reads only a, r or u with a proposal id; anything else is refused", () => {
    expect(parseCallback("a:11111111-2222-3333-4444-555555555555")).toEqual({ decision: "approve", id: "11111111-2222-3333-4444-555555555555" })
    expect(parseCallback("r:11111111-2222-3333-4444-555555555555")?.decision).toBe("reject"); expect(parseCallback("u:11111111-2222-3333-4444-555555555555")?.decision).toBe("undo")
    for (const bad of [undefined, "", "x:11111111-2222-3333-4444-555555555555", "a:123", "a:11111111-2222-3333-4444-55555555555g", "a:../../admin", "approve:1"]) expect(parseCallback(bad as any)).toBeNull()
  })
})
