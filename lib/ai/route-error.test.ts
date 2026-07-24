import { describe, it, expect } from "vitest"
import { aiErrorHint, aiFailureReason, aiErrorMessage } from "./route-error"

describe("aiErrorHint", () => {
  it("points at API Keys when no provider is active", () => {
    expect(aiErrorHint("no AI provider active")).toMatch(/Settings → API Keys/)
    expect(aiErrorHint("all providers failed — gemini: no text")).toMatch(/API Keys/)
  })

  it("names the exact task toggle when a task is disabled", () => {
    expect(aiErrorHint("task 'deck_critique' disabled by admin", "deck_critique"))
      .toBe(" Enable the 'deck_critique' task in Settings → AI.")
  })

  it("falls back to a generic AI-task hint when no task name is given", () => {
    expect(aiErrorHint("disabled by admin")).toBe(" Enable this AI task in Settings → AI.")
  })

  it("recognises rate limits from 429 / quota / rate-limit wording", () => {
    expect(aiErrorHint("gemini: 429 Too Many Requests")).toMatch(/rate-limited/)
    expect(aiErrorHint("openai: insufficient_quota")).toMatch(/rate-limited/)
  })

  it("recognises safety / content blocks", () => {
    expect(aiErrorHint("finishReason: SAFETY")).toMatch(/blocked this content/)
    expect(aiErrorHint("blocked by content filter")).toMatch(/blocked this content/)
  })

  it("returns empty string for an unrecognised reason", () => {
    expect(aiErrorHint("some novel upstream error")).toBe("")
  })
})

describe("aiFailureReason", () => {
  it("prefers the provider-reported error", () => {
    expect(aiFailureReason({ error: "gemini: 429", text: "" })).toBe("gemini: 429")
  })

  it("distinguishes unparseable content from an empty completion", () => {
    expect(aiFailureReason({ error: null, text: "not json {oops" }))
      .toBe("model returned unparseable content")
    expect(aiFailureReason({ error: null, text: "" })).toBe("model returned no content")
  })
})

describe("aiErrorMessage", () => {
  it("joins reason and hint into one embeddable string", () => {
    expect(aiErrorMessage({ error: "no AI provider active", text: "" }))
      .toBe("no AI provider active. Add a working AI key in Settings → API Keys.")
  })

  it("ends at the reason when no hint is recognised", () => {
    expect(aiErrorMessage({ error: "some novel upstream error", text: "" }))
      .toBe("some novel upstream error.")
  })
})
