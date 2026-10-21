// Writes docs/legal/investor-side/07-wording-as-shipped.md from the legal text registry (docs/architecture/73).
// Run: npx tsx scripts/legal/gen-investor-pack.ts
import { writeFileSync } from "node:fs"
import { wordingMarkdown } from "../../lib/investor/legal"
import { retentionMarkdown } from "../../lib/investor/retention-policy"

writeFileSync("docs/legal/investor-side/07-wording-as-shipped.md", wordingMarkdown() + "\n")
console.log("wrote docs/legal/investor-side/07-wording-as-shipped.md")
writeFileSync("docs/legal/investor-side/08-retention-as-configured.md", retentionMarkdown())
console.log("wrote docs/legal/investor-side/08-retention-as-configured.md")
