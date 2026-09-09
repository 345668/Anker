import { expect, it } from "vitest"
import { safeAuthDestination } from "./destination"

it.each([null, undefined, "", "https://example.com", "//example.com", "/\\example.com", "/\t/example.com", " /dashboard"])("rejects unsafe auth return destination %s", value => {
  expect(safeAuthDestination(value)).toBe("/dashboard")
})

it("preserves internal deep links, including their query and fragment", () => {
  expect(safeAuthDestination("/dashboard/discover?sector=climate#results")).toBe("/dashboard/discover?sector=climate#results")
})
