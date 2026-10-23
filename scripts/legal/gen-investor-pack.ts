// Writes docs/legal/investor-side/07-wording-as-shipped.md from the legal text registry (docs/architecture/73).
// Run: npx tsx scripts/legal/gen-investor-pack.ts
import { writeFileSync } from "node:fs"
import { wordingMarkdown } from "../../lib/investor/legal"
import { retentionMarkdown } from "../../lib/investor/retention-policy"
import { noticeMarkdown, termsMarkdown } from "../../lib/investor/terms-text"

const preface = (n: string) => `<!-- Generated from lib/investor/terms-text.ts (${n}). Do not edit by hand: edit that file, raise INVESTOR_TERMS_VERSION and regenerate with npx tsx scripts/legal/gen-investor-pack.ts. These are the texts shown at /investor/terms and /investor/privacy. DRAFT for counsel; bracketed items are for the founder or counsel to supply. Not legal advice. -->\n\n`
writeFileSync("docs/legal/investor-side/07-wording-as-shipped.md", wordingMarkdown() + "\n")
console.log("wrote docs/legal/investor-side/07-wording-as-shipped.md")
writeFileSync("docs/legal/investor-side/08-retention-as-configured.md", retentionMarkdown())
console.log("wrote docs/legal/investor-side/08-retention-as-configured.md")
writeFileSync("docs/legal/investor-side/09-investor-privacy-notice-DRAFT.md", preface("09") + noticeMarkdown())
writeFileSync("docs/legal/investor-side/10-investor-terms-DRAFT.md", preface("10") + termsMarkdown())
console.log("wrote 09 and 10")
