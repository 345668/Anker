import { expect, it, vi } from "vitest"
const provider = vi.hoisted(() => ({ generate: vi.fn(), resolveProvider: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/ai/provider", () => provider)
import { analyzeCall } from "./analyze"
it("fails honestly without generating heuristic commitment or stage claims", async () => {
  provider.resolveProvider.mockResolvedValue("none")
  await expect(analyzeCall("A sufficiently long transcript.", { persona: "founder" })).rejects.toThrow()
  provider.resolveProvider.mockResolvedValue("openai")
  provider.generate.mockResolvedValue('{"summary":"missing fields"}')
  await expect(analyzeCall("A sufficiently long transcript.", { persona: "vc" })).rejects.toThrow()
})
it("uses full bounded input and forces LP suggestions to stay outside CRM semantics", async () => {
  provider.resolveProvider.mockResolvedValue("openai")
  provider.generate.mockResolvedValue(JSON.stringify({ summary: 'Manager said "report next week".', sentiment: "neutral", interest_level: "high", objections: [], next_steps: [], key_questions: [], draft_followup: "Thank you", recommended_stage: "meeting" }))
  const transcript = "a".repeat(15000) + "important evidence at the end"
  expect(await analyzeCall(transcript, { persona: "lp" })).toMatchObject({ interestLevel: "unknown", recommendedStage: "none", generatedBy: "openai:call" })
  expect(provider.generate.mock.lastCall?.[0]).toContain("important evidence at the end")
  expect(provider.generate.mock.lastCall?.[1]).toMatchObject({ provider: "openai", noFailover: true, skill: false })
})
