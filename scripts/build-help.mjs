import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildAll } from "./lib/help-build.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const out = JSON.stringify(buildAll(root), null, 1) + "\n"
const target = path.join(root, "lib/help/generated.json")
if (process.argv.includes("--check")) {
  const cur = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : ""
  if (cur !== out) { console.error("lib/help/generated.json is stale: run pnpm build:help"); process.exit(1) }
} else { fs.writeFileSync(target, out); console.log("help: wrote", target) }
