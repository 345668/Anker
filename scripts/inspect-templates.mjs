import { createRequire } from "node:module"
import fs from "node:fs"
import path from "node:path"
const require = createRequire(import.meta.url)
const XLSX = require("xlsx")

const UP = "/Users/RalfMersch/Library/Application Support/Claude/local-agent-mode-sessions/5de569ee-c7d0-4b34-a8aa-3aacf7dc6d5f/ece6cd9a-b92c-42bd-95bc-3281402726de/local_ca9a506c-f3bd-4c01-a7ba-55f6bd30c1be/uploads"
const files = fs.readdirSync(UP).filter((f) => /\.(xlsx|docx|pdf)$/.test(f) && /Foresight|Cap Table|Graph|Data Room|EOY|VC Fund Struct/i.test(f))

for (const f of files) {
  const p = path.join(UP, f)
  const stat = fs.statSync(p)
  console.log(`\n${f}  (${(stat.size / 1024).toFixed(0)} KB)`)
  if (!f.endsWith(".xlsx")) continue
  try {
    const wb = XLSX.readFile(p)
    console.log(`  sheets: ${wb.SheetNames.join(", ")}`)
  } catch (e) {
    console.log(`  ERR: ${e.message}`)
  }
}
