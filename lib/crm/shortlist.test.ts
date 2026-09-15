import { it, expect } from "vitest"
import * as XLSX from "xlsx"
import { parseShortlist } from "./shortlist"
function workbook(sheets: Record<string, unknown[][]>) {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return XLSX.read(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }), { type: "buffer" })
}
const headers = ["Contact", "Anker ID", "Name", "Status", "Owner", "Notes"]
it("excludes an identity deselected anywhere in a legacy workbook", () => {
  const data = parseShortlist(workbook({ Contacts: [headers, [false, "contact:one", "One"]], Ready: [headers, [true, "contact:one", "One"], [true, "firm:two", "Two"]] }))
  expect(data.rows.filter(r => r.selected).map(r => r.key)).toEqual(["firm:two"])
  expect(data.copies).toBe(1)
})
it("uses only the authoritative sheet and retains edited fields", () => {
  const data = parseShortlist(workbook({ "Import Selection": [headers, [false, "contact:one", "One"], [true, "firm:two", "Two", "meeting", "Alex", "Meet Friday"]], Ready: [headers, [true, "contact:one", "One"]] }))
  expect(data.rows.filter(r => r.selected)).toMatchObject([{ key: "firm:two", stage: "meeting", owner: "Alex", notes: "Meet Friday" }])
})
it("rejects unsupported workbooks and ambiguous selection values", () => {
  expect(() => parseShortlist(workbook({ Bad: [["No valid headers"]] }))).toThrow(/No import table/)
  expect(() => parseShortlist(workbook({ Bad: [headers, ["maybe", "firm:one"]] }))).toThrow(/TRUE or FALSE/)
})
