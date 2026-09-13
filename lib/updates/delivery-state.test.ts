import { expect, it } from "vitest"
import { sendRequest } from "./send-contract"
// Full state transitions, provider failures and concurrent claims are exercised
// against SQL in founder-integrity.integration.test.ts, not a query-name mock.
it("requires a revision and validates explicitly selected recipients", () => {
  expect(sendRequest.safeParse({}).success).toBe(false)
  expect(sendRequest.safeParse({ revision: 0, recipients: [] }).success).toBe(false)
  expect(sendRequest.safeParse({ revision: 0, recipients: [{ email: "not-an-email" }] }).success).toBe(false)
  expect(sendRequest.safeParse({ revision: 0, content: { title: "Subject", body: "Reviewed content", asks: "" }, recipients: [{ email: "investor@example.test" }] }).success).toBe(true)
})
it("allows a retry to reference the persisted snapshot without new content", () => {
  expect(sendRequest.parse({ revision: 1 })).toEqual({ revision: 1 })
})
