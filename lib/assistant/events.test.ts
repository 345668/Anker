import { it, expect, describe } from "vitest"
import { projectMessages, type ChatEvent, type ChatEventKind } from "./events"

/**
 * Doc: docs/architecture/28-assistant-system-design.md §3, phase 3.
 *
 * projectMessages is the reader that makes the log worth writing (§10, "an event
 * log with no reader is just a second write path"), so its edge cases are the
 * ones worth pinning.
 */
let seq = 0
const ev = (kind: ChatEventKind, payload: Record<string, any> = {}, awaiting = false): ChatEvent => ({
  id: ++seq, chatId: "c1", scopeKey: "org:a", seq, kind, payload, awaiting,
  createdBy: "u1", createdAt: new Date().toISOString(),
})

describe("projecting a conversation from its log", () => {
  it("renders a plain exchange in order", () => {
    expect(projectMessages([
      ev("chat.created"),
      ev("message.user", { content: "who are my LPs" }),
      ev("message.assistant", { content: "Three." }),
    ])).toEqual([
      { role: "user", content: "who are my LPs" },
      { role: "assistant", content: "Three." },
    ])
  })

  it("ignores events that are not turns", () => {
    // model.requested / run.ended are how the run happened, not what was said.
    expect(projectMessages([
      ev("chat.created"),
      ev("message.user", { content: "hi" }),
      ev("model.requested", { task: "chat" }),
      ev("model.completed", { content: "hi" }),
      ev("message.assistant", { content: "hello" }),
      ev("run.ended", { reason: "done" }),
    ]).map((m) => m.role)).toEqual(["user", "assistant"])
  })

  it("attaches tool activity to the assistant turn it produced", () => {
    const [, assistant] = projectMessages([
      ev("message.user", { content: "move Acme to diligence" }),
      ev("tool.requested", { name: "crm_search" }),
      ev("tool.completed", { name: "crm_search", observation: "1 match" }),
      ev("message.assistant", { content: "Found Acme." }),
    ])
    expect(assistant.tools).toEqual([{ name: "crm_search", observation: "1 match" }])
  })

  it("keeps a failed tool visible rather than dropping it", () => {
    const [, assistant] = projectMessages([
      ev("message.user", { content: "x" }),
      ev("tool.failed", { name: "crm_search", error: "timeout" }),
      ev("message.assistant", { content: "I could not search." }),
    ])
    expect(assistant.tools).toEqual([{ name: "crm_search", error: "timeout" }])
  })

  // The important one. A parked intent has NOT happened; rendering it as a step
  // would claim an action nobody approved.
  it("shows nothing for an intent still awaiting a human", () => {
    const out = projectMessages([
      ev("message.user", { content: "move Acme to committed" }),
      ev("tool.requested", { name: "crm_update_stage", input: { stage: "committed" } }, true),
    ])
    expect(out).toEqual([{ role: "user", content: "move Acme to committed" }])
  })

  it("renders the tool once approved and run", () => {
    const req = ev("tool.requested", { name: "crm_update_stage" }, true)
    const out = projectMessages([
      ev("message.user", { content: "move Acme" }),
      req,
      ev("approval.granted", { event_id: req.id }),
      ev("tool.completed", { name: "crm_update_stage", observation: "moved" }),
      ev("message.assistant", { content: "Done." }),
    ])
    expect(out[1]).toEqual({ role: "assistant", content: "Done.", tools: [{ name: "crm_update_stage", observation: "moved" }] })
  })

  it("does not carry tool activity across a later user turn", () => {
    const out = projectMessages([
      ev("message.user", { content: "one" }),
      ev("tool.completed", { name: "crm_search", observation: "x" }),
      ev("message.user", { content: "two" }),
      ev("message.assistant", { content: "answer" }),
    ])
    expect(out[2].tools).toBeUndefined()
  })

  it("survives a truncated run with no assistant turn", () => {
    // What a crash mid-tool-call leaves behind: the user's turn is still there.
    expect(projectMessages([
      ev("message.user", { content: "do the thing" }),
      ev("tool.requested", { name: "crm_search" }),
    ])).toEqual([{ role: "user", content: "do the thing" }])
  })

  it("treats a missing content field as empty rather than undefined", () => {
    expect(projectMessages([ev("message.assistant", {})])).toEqual([{ role: "assistant", content: "" }])
  })

  it("projects an empty log to an empty conversation", () => {
    expect(projectMessages([])).toEqual([])
  })
})
