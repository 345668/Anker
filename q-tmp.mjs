import fs from "fs"
import { neon } from "./node_modules/@neondatabase/serverless/index.mjs"
let url; for (const l of fs.readFileSync(`${process.env.HOME}/SAIL/.env.local`, "utf8").split("\n")) { const m = l.match(/^NEON_DATABASE_URL="?([^"]*)"?$/); if (m) url = m[1] }
await neon(url).query("update platform_flags set enabled=$1 where key='ai_studio_replace'", [process.argv[2]==="on"])
console.log("ai_studio_replace ->", process.argv[2])
