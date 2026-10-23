// Re-encrypts files and personal-data columns under the current SECRET_KEY (docs/architecture/74 section 3; runbook docs/legal/investor-side/11-key-management.md).
//   npx tsx scripts/oneshot/rotate-keys.ts                 dry run: counts what would change
//   npx tsx scripts/oneshot/rotate-keys.ts --apply --yes-production
// Needs SECRET_KEY (new), SECRET_KEY_PREVIOUS (old, comma separated) and the database URL in the environment.
import { rotateKeys } from "../../lib/db/key-rotation"

const apply = process.argv.includes("--apply")
if (apply && !process.argv.includes("--yes-production")) { console.error("Refusing to change data without --yes-production."); process.exit(2) }
rotateKeys({ dryRun: !apply }).then((r) => {
  console.log(r.dryRun ? "DRY RUN (nothing changed)" : "APPLIED")
  for (const x of r.reports) console.log(`${x.missing ? "(no such table) " : ""}${x.target}: rotated ${x.rotated}, already current ${x.alreadyCurrent}, failed ${x.failed.length}`, ...x.failed.slice(0, 5).map((f) => `\n   ${f.id}: ${f.why}`))
  console.log(r.clean ? "CLEAN: no failures." : "NOT CLEAN: fix the failures above before retiring the old key.")
  process.exit(r.clean ? 0 : 1)
}).catch((e) => { console.error(e.message); process.exit(1) })
