import { expect, it } from "vitest"
import { summarizeLpPortfolio } from "./lp-summary"
import type { LpMembership } from "@/lib/portfolio/data-room"
const member = (id: string, currency: string | null): LpMembership => ({ fund_lp_id: id, fund_id: id, fund_slug: id, fund_name: id, lp_name: "Investor", commitment_amount: 100, called_amount: 50, distributed_amount: 10, currency })
it("keeps EUR and USD separate and aggregates same-currency memberships", () => {
  const result = summarizeLpPortfolio([member("a", "EUR"), member("b", "USD"), member("c", "EUR")], { a: 25, b: 40, c: 30 })
  expect(result).toHaveLength(2)
  expect(result[0]).toMatchObject({ currency: "EUR", committed: 200, estNav: 55, tvpi: .75 })
  expect(result[1]).toMatchObject({ currency: "USD", committed: 100, estNav: 40, tvpi: 1 })
})
it("does not combine funds with unknown currency or invent missing valuations", () => {
  const result = summarizeLpPortfolio([member("a", null), member("b", null), member("c", "EUR")], { a: 20 })
  expect(result).toHaveLength(3)
  expect(result[1]).toMatchObject({ estNav: null, tvpi: null })
  expect(result[2]).toMatchObject({ estNav: null, tvpi: null })
})
