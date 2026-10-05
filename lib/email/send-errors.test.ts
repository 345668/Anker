import { describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db", () => ({ sql: vi.fn() }))
import { classifySendError, describeDropped } from "./send-errors"
import { SuppressedRecipientError } from "./unsubscribe"
import { CountryGateError } from "./send-gate"
import { EntitlementRefusal } from "@/lib/entitlements"

describe("classifySendError", () => {
  it("an opt-out and a consent gap are skips with a reason a person can act on", () => {
    expect(classifySendError(new SuppressedRecipientError("a@b.c"))).toMatchObject({ kind: "skip", reason: expect.stringMatching(/Opted out/) })
    expect(classifySendError(new CountryGateError("a@b.de", "DE"))).toMatchObject({ kind: "skip", reason: expect.stringMatching(/prior express consent/) })
  })
  it("a held sender stops the run; a provider error is a retryable failure", () => {
    expect(classifySendError(new EntitlementRefusal("limit", "Today's sending allowance is used up."))).toEqual({ kind: "stop", reason: "Today's sending allowance is used up." })
    expect(classifySendError(new EntitlementRefusal("paused", "Your workspace is paused."))).toMatchObject({ kind: "stop" })
    expect(classifySendError(new Error("Resend 500"))).toEqual({ kind: "fail", message: "Resend 500" })
    expect(classifySendError(null)).toEqual({ kind: "fail", message: "Delivery failed" })
  })
})

describe("describeDropped", () => {
  it("says nothing when nothing was left out, and names each address and why when something was", () => {
    expect(describeDropped([])).toBeNull(); expect(describeDropped(undefined)).toBeNull()
    const t = describeDropped([{ email: "a@x.com", field: "cc", reason: "suppressed" }, { email: "b@x.de", field: "bcc", reason: "country_gated" }])!
    expect(t).toMatch(/not copied to/); expect(t).toMatch(/a@x\.com \(cc, opted out\)/); expect(t).toMatch(/b@x\.de \(bcc, needs recorded consent\)/); expect(t).toMatch(/still go to its recipient/)
  })
})
