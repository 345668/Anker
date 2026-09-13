import { expect, it } from "vitest"
import { formatMoney } from "./money"
it("does not invent a denomination for an unlabelled amount", () => {
  expect(formatMoney(25000)).toBe("25k")
  expect(formatMoney(null, "EUR")).toBe("—")
  expect(formatMoney(Infinity, "EUR")).toBe("—")
})
it("preserves the recorded currency independently of locale", () => {
  expect(formatMoney(25000, "EUR")).toContain("EUR")
  expect(formatMoney(25000, "GBP")).toContain("GBP")
  expect(formatMoney(25000, "USD")).toContain("USD")
})
