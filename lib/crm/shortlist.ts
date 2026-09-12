import * as XLSX from "xlsx"

export type ImportRow = { key: string; kind: "firm" | "contact"; id: string; selected: boolean; name: string; title: string; email: string; linkedin: string; location: string; type: string; score: number | null; tier: string; why: string; stage: string; owner: string; notes: string }
const stages = ["queued", "contacted", "responded", "meeting", "in_diligence", "committed", "passed"]
export function parseShortlist(wb: XLSX.WorkBook) {
  if (wb.SheetNames.length > 20) throw new Error("A shortlist can contain at most 20 sheets.")
  const canonical = wb.Sheets["Import Selection"]
  const names = canonical ? ["Import Selection"] : wb.SheetNames
  const records = new Map<string, ImportRow>()
  const excluded = new Set<string>()
  let recognized = false, copies = 0
  for (const name of names) {
    const sheet = wb.Sheets[name]
    if (!sheet["!ref"]) continue
    const range = XLSX.utils.decode_range(sheet["!ref"])
    if (range.e.r > 10000 || range.e.c > 100) throw new Error("Workbook exceeds the 10,000-row or 100-column limit.")
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" })
    const at = rows.slice(0, 20).findIndex(row => String(row[0]).trim().toLowerCase() === "contact")
    if (at < 0) continue
    const headers = rows[at].map(v => String(v).trim().toLowerCase())
    const idCol = headers.indexOf("anker id")
    if (idCol < 0) continue
    recognized = true
    for (const row of rows.slice(at + 1)) {
      const key = String(row[idCol] ?? "").trim()
      if (!key) continue
      const match = /^(firm|contact):([^\s:]{1,200})$/.exec(key)
      if (!match) throw new Error(`Invalid Anker ID in ${name}: ${key.slice(0, 80)}`)
      const value = String(row[0]).trim().toLowerCase()
      if (!["true", "false", "1", "0", "yes", "no", ""].includes(value)) throw new Error("Use TRUE or FALSE in the Contact column.")
      const selected = ["true", "1", "yes"].includes(value)
      // Legacy sheets may repeat an identity. Any explicit exclusion wins.
      if (!selected) excluded.add(key)
      const get = (field: string, limit = 2000) => String(row[headers.indexOf(field)] ?? "").trim().slice(0, limit)
      const stage = get("status") || "queued"
      if (!stages.includes(stage)) throw new Error(`Unsupported status for ${key}. Use queued, contacted, responded, meeting, in_diligence, committed or passed.`)
      if (records.has(key)) { copies++; continue }
      const score = get("score")
      records.set(key, { key, kind: match[1] as ImportRow["kind"], id: match[2], selected,
        name: get("name", 300) || get("firm", 300), title: get("title", 300), email: get("email", 320),
        linkedin: get("linkedin", 1000), location: get("location", 300), type: get("type", 100),
        score: score && Number.isFinite(Number(score)) ? Math.round(Number(score)) : null,
        tier: get("tier", 40), why: get("why match") || get("why this lp"), stage, owner: get("owner", 300), notes: get("notes", 10000) })
    }
  }
  if (!recognized) throw new Error("No import table found. Upload an Anker shortlist containing Contact and Anker ID columns.")
  for (const key of excluded) records.get(key)!.selected = false
  return { rows: [...records.values()], copies, mode: canonical ? "selection-sheet" : "legacy-exclusion-wins" }
}
